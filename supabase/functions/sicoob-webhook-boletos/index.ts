import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Recebe a notificação de baixa operacional (pagamento) da API de Cobrança Bancária V3 do
// Sicoob (POST /webhooks, codigoTipoMovimento=7). Chamada pelo Sicoob diretamente — sem o JWT
// do Supabase (função deployada com verify_jwt=false) — por isso a única defesa é o `token` na
// query string, comparado contra o secret SICOOB_WEBHOOK_TOKEN. Sicoob exige resposta HTTP
// 200/201/204 sem redirect pra validar a URL, então respondemos sempre 200 e nunca redirecionamos.
//
// Só atualiza boleto_controls (status, data_pagamento, valor_pago, origem_baixa) — leitura e
// monitoramento em tempo real. NÃO toca em transactions/lançamentos: isso é sempre via o botão
// "Liquidar" na tela de Boletos (ação manual, revisada por alguém antes de mexer no financeiro).
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const WEBHOOK_TOKEN = Deno.env.get("SICOOB_WEBHOOK_TOKEN")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface BaixaWebhookDados {
  nossoNumero?: string | number;
  valorPagamento?: number;
  dataHoraSituacaoBaixa?: string;
  cancelamentoBaixa?: boolean;
  codigoCanalPagamento?: number;
  codigoMotivoCancelamento?: number;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== WEBHOOK_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Corpo vazio (ex.: ping de saúde) — segue com body={} e responde 200 mesmo assim.
  }

  // Ping de validação da URL — disparado pelo Sicoob no cadastro, alteração ou reativação do
  // webhook. Só precisa dos 200 pra validar, nada pra gravar.
  if (body?.validacaoWebhook === true) {
    return json({ ok: true, validado: true });
  }

  const dados: BaixaWebhookDados | undefined = body?.dados;

  // tipoMovimento 7 = Pagamento (baixa operacional). cancelamentoBaixa=true é um estorno da
  // baixa — não mexe no status aqui (reversão financeira fica pra conferência manual, mesmo
  // padrão cauteloso do botão Liquidar); só grava o payload bruto pra rastro caso alguém precise
  // investigar depois.
  if (body?.tipoMovimento === 7 && dados && !dados.cancelamentoBaixa) {
    const nossoNumero = Number(dados.nossoNumero);
    if (nossoNumero) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const dataPagamento = dados.dataHoraSituacaoBaixa
        ? String(dados.dataHoraSituacaoBaixa).slice(0, 10)
        : null;
      const { error } = await supabase
        .from("boleto_controls")
        .update({
          status: "PAGO",
          data_pagamento: dataPagamento,
          valor_pago: dados.valorPagamento != null ? Number(dados.valorPagamento) : null,
          origem_baixa: "webhook_sicoob",
          sicoob_response: dados,
        })
        .eq("company_id", COMPANY_ID)
        .eq("nosso_numero", nossoNumero);
      if (error) {
        // Não retorna erro pro Sicoob por causa disso — a falha fica só no log; o find_orphans
        // diário continua como rede de segurança pra esse boleto específico.
        console.error("Falha ao gravar baixa via webhook:", error.message, { nossoNumero });
      }
    }
  }

  // Sempre 200 — inclusive pra tipoMovimento não tratado ou cancelamentoBaixa, pra não fazer o
  // Sicoob reenviar notificações que já entendemos e decidimos ignorar por enquanto.
  return json({ ok: true });
});
