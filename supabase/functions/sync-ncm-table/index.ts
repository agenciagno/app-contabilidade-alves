// Sincroniza a tabela NCM local com a API oficial do Siscomex/Receita Federal.
//
// Fonte: portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json
// — pública, sem autenticação, atualizada todo dia útil pela Receita Federal.
// Não há cadastro de produto no sistema; esta função só mantém a base de referência
// usada pelo módulo de Classificação Fiscal (NCM/CEST/cClassTrib/CST/CSOSN).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SISCOMEX_URL =
  "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO";

const BATCH_SIZE = 1000;

function parseDataBr(data: string | null | undefined): string | null {
  // "DD/MM/AAAA" -> "AAAA-MM-DD". "31/12/9999" (vigência aberta) vira null.
  if (!data) return null;
  const [d, m, a] = data.split("/");
  if (!d || !m || !a) return null;
  if (a === "9999") return null;
  return `${a}-${m}-${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Chamada exige uma apikey válida (anon ou de usuário) — mesma exigência padrão
  // do gateway de edge functions. Fica aberta pra cron (anon key) e pro botão do
  // painel (usuário logado); a escrita em si sempre usa a service role interna.
  if (!req.headers.get("Authorization")) {
    return new Response(JSON.stringify({ error: "não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const res = await fetch(SISCOMEX_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} do Siscomex`);

    const json = await res.json();
    const nomenclaturas: Array<{
      Codigo: string;
      Descricao: string;
      Data_Inicio?: string;
      Data_Fim?: string;
      Tipo_Ato_Ini?: string;
      Numero_Ato_Ini?: string;
      Ano_Ato_Ini?: string;
    }> = json?.Nomenclaturas ?? [];

    if (!nomenclaturas.length) throw new Error("resposta do Siscomex sem Nomenclaturas");

    const ato = json?.Ato ?? null;
    const agora = new Date().toISOString();

    const linhas = nomenclaturas.map((n) => ({
      codigo: n.Codigo,
      descricao: n.Descricao,
      data_inicio: parseDataBr(n.Data_Inicio),
      data_fim: parseDataBr(n.Data_Fim),
      ato: [n.Tipo_Ato_Ini, n.Numero_Ato_Ini, n.Ano_Ato_Ini].filter(Boolean).join(" "),
      sincronizado_em: agora,
    }));

    let processados = 0;
    for (let i = 0; i < linhas.length; i += BATCH_SIZE) {
      const lote = linhas.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("ncm_codes").upsert(lote, { onConflict: "codigo" });
      if (error) throw error;
      processados += lote.length;
    }

    // Recalcula a descrição com contexto hierárquico (usada na busca por
    // descrição livre do módulo de Classificação Fiscal) — depende dos
    // códigos recém-sincronizados, então só faz sentido rodar depois do upsert.
    await supabase.rpc("refresh_ncm_descricao_hierarquica");

    return new Response(
      JSON.stringify({
        ok: true,
        total: processados,
        ato_vigente: ato,
        data_ultima_atualizacao: json?.Data_Ultima_Atualizacao_NCM ?? null,
        sincronizado_em: agora,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
