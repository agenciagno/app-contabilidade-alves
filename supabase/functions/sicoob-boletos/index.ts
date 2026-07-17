import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ---------------------------------------------------------------------------
// Geração de boletos Sicoob com preview + seleção.
// action: 'preview'  -> lista elegíveis do mês (sem chamar Sicoob, sem efeito)
// action: 'generate' -> gera os boletos dos contact_ids informados (chunk)
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";

// Histórico anterior a este mês (vencimento) não é exposto nem salvo — decisão de 16/07/2026.
const HISTORICO_FLOOR = "2026-07-01";

const SICOOB_CLIENT_ID = Deno.env.get("SICOOB_CLIENT_ID")!;
const SICOOB_CERT = Deno.env.get("SICOOB_CERT")!;
const SICOOB_KEY = Deno.env.get("SICOOB_KEY")!;
const NUMERO_CLIENTE = Number(Deno.env.get("SICOOB_NUMERO_CLIENTE"));
const NUMERO_CONTA = Number(Deno.env.get("SICOOB_NUMERO_CONTA"));
const NUMERO_CONTRATO = Deno.env.get("SICOOB_NUMERO_CONTRATO")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------- Datas ----------
// Sem ajuste de dia útil: o Sicoob já trata fim de semana/feriado na hora do pagamento.
function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysInMonth(ano: number, mes: number): number {
  // mes 1-12 → dias do mês (dia 0 do mês seguinte = último dia do mês atual)
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// Data de emissão = data real da geração (hoje, fuso Brasil) — não uma data fixa presumida.
function getDataEmissaoISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Vencimento = dia configurado no perfil do cliente (boleto_due_day), no mês seguinte ao da emissão.
// Descontos: 3% até dia 24 do mês de emissão, 2% até o último dia do mês de emissão.
function computeContactDatas(dataEmissaoISO: string, dueDay: number) {
  const [anoEmi, mesEmi] = dataEmissaoISO.split("-").map(Number); // mesEmi 1-12
  const anoVenc = mesEmi === 12 ? anoEmi + 1 : anoEmi;
  const mesVenc = mesEmi === 12 ? 1 : mesEmi + 1;

  const diaVenc = Math.min(Math.max(1, dueDay), daysInMonth(anoVenc, mesVenc));
  const vencimento = new Date(Date.UTC(anoVenc, mesVenc - 1, diaVenc));

  const diaDesc1 = Math.min(24, daysInMonth(anoEmi, mesEmi));
  const desconto1 = new Date(Date.UTC(anoEmi, mesEmi - 1, diaDesc1));
  const desconto2 = new Date(Date.UTC(anoEmi, mesEmi, 0)); // último dia do mês de emissão

  return {
    dataVencimentoISO: dateKey(vencimento),
    desconto1ISO: dateKey(desconto1),
    desconto2ISO: dateKey(desconto2),
  };
}
function seuNumeroFor(emissaoMonth: string, document: string | null): string {
  const [ano, mes] = emissaoMonth.split("-");
  const docSuffix = (document || "").replace(/\D/g, "").slice(-4);
  return `${ano}${mes}${docSuffix}`;
}

const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "nome" },
  { key: "document", label: "CPF/CNPJ" },
  { key: "boleto_value", label: "valor" },
  { key: "boleto_due_day", label: "dia de vencimento" },
  { key: "address", label: "endereço" },
  { key: "address_number", label: "número" },
  { key: "neighborhood", label: "bairro" },
  { key: "city", label: "cidade" },
  { key: "state", label: "UF" },
  { key: "cep", label: "CEP" },
];
function missingFields(c: Record<string, unknown>): string[] {
  return REQUIRED_FIELDS.filter(({ key }) => {
    const v = c[key];
    return v === null || v === undefined || v === "";
  }).map(({ label }) => label);
}

const CONTACT_COLS =
  "id,name,document,email,phone,whatsapp,address,address_number,neighborhood,city,state,cep,boleto_value,boleto_due_day,canal_entrega,enviar_cobranca_auto,numero_cliente_sicoob";

// ---------- Sicoob ----------
async function getSicoobToken(): Promise<string> {
  // @ts-ignore unstable API — mTLS validado no edge runtime
  const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
  // boletos_inclusao (criar) + boletos_consulta (GET /boletos, /pagadores/{cpf}/boletos)
  const scope = encodeURIComponent("boletos_inclusao boletos_consulta");
  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(SICOOB_CLIENT_ID)}&scope=${scope}`;
  const res = await fetch(
    "https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token",
    { method: "POST", client, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao autenticar no Sicoob (HTTP ${res.status})`);
  }
  return data.access_token as string;
}

interface SicoobPagadorBoleto {
  nossoNumero: number;
  seuNumero?: string;
  codigoBarras?: string;
  linhaDigitavel?: string;
  valor?: number;
  dataEmissao?: string;
  dataVencimento?: string;
  situacaoBoleto?: string;
  qrCode?: string;
}

// GET /pagadores/{cpf}/boletos — lista todos os boletos registrados no Sicoob para o pagador
// (reconciliação: achar boletos que existem no Sicoob mas não em boleto_controls).
// Sem filtro de data na chamada: o Sicoob exige dataFim sempre que dataInicio é informado E
// limita o intervalo a no máximo 35 dias — inviável para "de julho em diante" sem paginar por
// janelas. O piso HISTORICO_FLOOR é aplicado depois, no código, antes de inserir.
async function listarBoletosPorPagador(token: string, cpfCnpj: string) {
  // @ts-ignore unstable API
  const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
  const url = `https://api.sicoob.com.br/cobranca-bancaria/v3/pagadores/${cpfCnpj}/boletos?numeroCliente=${NUMERO_CLIENTE}`;
  const res = await fetch(url, {
    method: "GET",
    client,
    headers: {
      "Authorization": `Bearer ${token}`,
      "client_id": SICOOB_CLIENT_ID,
      "Accept": "application/json",
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Valores reais observados na API: "ENTRADA NORMAL", "BAIXADO" (não batem com a grafia do doc).
// "Baixado" é ambíguo (pago OU cancelado/estornado, o Sicoob não distingue nesta resposta) — não
// dá pra confirmar qual sem outro dado, e o CHECK constraint de boleto_controls.status só aceita
// PENDENTE/PAGO/FILA_IMPRESSAO/IMPRESSO/CANCELADO. Fica como PENDENTE (neutro); o valor bruto
// continua disponível em sicoob_response.situacaoBoleto para conferência manual.
function mapSituacaoBoleto(situacao: string | undefined): string {
  return (situacao || "").toUpperCase().includes("LIQUID") ? "PAGO" : "PENDENTE";
}

interface ContactDatas {
  dataEmissaoISO: string;
  dataVencimentoISO: string;
  desconto1ISO: string;
  desconto2ISO: string;
}

async function criarBoletoSicoob(token: string, c: Record<string, any>, datas: ContactDatas, seuNumero: string) {
  // @ts-ignore unstable API
  const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
  const payload = {
    numeroCliente: NUMERO_CLIENTE,
    codigoModalidade: 1, // 1 = SIMPLES COM REGISTRO
    numeroContaCorrente: NUMERO_CONTA,
    codigoEspecieDocumento: "FAT", // Fatura — igual ao boleto de referência já emitido
    // Cliente Emite/Distribui (2): geramos e enviamos o PDF nós mesmos (WhatsApp/e-mail),
    // não pelo processo físico do banco. Com "Banco Emite/Distribui" (1) o boleto fica
    // preso na fila de impressão/distribuição do Sicoob à espera de um formulário físico.
    identificacaoEmissaoBoleto: 2,
    identificacaoDistribuicaoBoleto: 2,
    seuNumero,
    dataEmissao: datas.dataEmissaoISO,
    dataVencimento: datas.dataVencimentoISO,
    dataLimitePagamento: addDaysISO(datas.dataVencimentoISO, 30),
    valor: Number(c.boleto_value),
    valorAbatimento: 0,
    // Desconto: 2 = percentual até a data informada (Sicoob v3). 3% até dia 24 do mês de
    // emissão, 2% até o último dia do mês de emissão.
    tipoDesconto: 2,
    dataPrimeiroDesconto: datas.desconto1ISO,
    valorPrimeiroDesconto: 3,
    dataSegundoDesconto: datas.desconto2ISO,
    valorSegundoDesconto: 2,
    // Multa 2% e juros de mora 0,07%/dia a partir do dia seguinte ao vencimento.
    tipoMulta: 2,
    dataMulta: addDaysISO(datas.dataVencimentoISO, 1),
    valorMulta: 2,
    tipoJurosMora: 1,
    dataJurosMora: addDaysISO(datas.dataVencimentoISO, 1),
    valorJurosMora: 0.07,
    numeroParcela: 1,
    aceite: false,
    gerarPdf: true,
    pagador: {
      numeroCpfCnpj: (c.document || "").replace(/\D/g, ""),
      nome: c.name,
      endereco: `${c.address}, ${c.address_number}`,
      bairro: c.neighborhood,
      cidade: c.city,
      uf: c.state,
      cep: (c.cep || "").replace(/\D/g, ""),
      email: c.email,
    },
    mensagensInstrucao: ["Contabilidade Alves"],
  };
  const res = await fetch(
    `https://api.sicoob.com.br/cobranca-bancaria/v3/boletos?numeroContrato=${NUMERO_CONTRATO}`,
    {
      method: "POST",
      client,
      headers: {
        "Authorization": `Bearer ${token}`,
        "client_id": SICOOB_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function extractSicoobError(data: any, status: number): string {
  const msgs = data?.mensagens || data?.messages;
  if (Array.isArray(msgs) && msgs.length) {
    return msgs.map((m: any) => m.mensagem || m.message || JSON.stringify(m)).join("; ");
  }
  if (typeof data === "string" && data) return data.slice(0, 300);
  return `Erro Sicoob (HTTP ${status})`;
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await req.json().catch(() => ({}));
    const action: string = payload.action;

    const dataEmissaoISO = getDataEmissaoISO();
    // Ciclo de geração = mês real de hoje — não depende de qual mês está selecionado na tela
    // (que agora filtra por vencimento). Evita duplicar boleto se o filtro da tabela mudar.
    const emissaoMonth = `${dataEmissaoISO.slice(0, 7)}-01`;

    // Contatos elegíveis (boleto ativo)
    const { data: contatos, error: cErr } = await supabase
      .from("contacts")
      .select(CONTACT_COLS)
      .eq("company_id", COMPANY_ID)
      .eq("boleto_active", true)
      .eq("is_active", true);
    if (cErr) throw cErr;

    // Boletos já gerados neste ciclo de emissão (mês real de hoje)
    const { data: existentes, error: eErr } = await supabase
      .from("boleto_controls")
      .select("contact_id")
      .eq("company_id", COMPANY_ID)
      .eq("reference_month", emissaoMonth);
    if (eErr) throw eErr;
    const jaGerados = new Set((existentes || []).map((b: any) => b.contact_id));

    // ---------------- PREVIEW ----------------
    if (action === "preview") {
      const items = (contatos || []).map((c: any) => {
        const faltando = missingFields(c);
        const contactDatas = faltando.length === 0 ? computeContactDatas(dataEmissaoISO, c.boleto_due_day) : null;
        return {
          contact_id: c.id,
          name: c.name,
          document: c.document,
          valor: c.boleto_value != null ? Number(c.boleto_value) : null,
          canal_entrega: c.canal_entrega,
          data_vencimento: contactDatas?.dataVencimentoISO ?? null,
          already_generated: jaGerados.has(c.id),
          missing_fields: faltando,
        };
      });
      items.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
      return json({
        data_emissao: dataEmissaoISO,
        total: items.length,
        elegiveis: items.filter((i) => !i.already_generated && i.missing_fields.length === 0).length,
        items,
      });
    }

    // ---------------- GENERATE ----------------
    if (action === "generate") {
      const contactIds: string[] = Array.isArray(payload.contact_ids) ? payload.contact_ids : [];
      if (!contactIds.length) return json({ error: "contact_ids vazio" }, 400);

      const byId = new Map((contatos || []).map((c: any) => [c.id, c]));
      const results: any[] = [];

      let token: string;
      try {
        token = await getSicoobToken();
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }

      for (const id of contactIds) {
        const c = byId.get(id);
        if (!c) {
          results.push({ contact_id: id, name: null, status: "error", message: "Contato não elegível ou não encontrado" });
          continue;
        }
        if (jaGerados.has(id)) {
          results.push({ contact_id: id, name: c.name, status: "skipped", message: "Boleto já existe neste mês" });
          continue;
        }
        const faltando = missingFields(c);
        if (faltando.length) {
          results.push({ contact_id: id, name: c.name, status: "error", message: `Dados incompletos: ${faltando.join(", ")}` });
          continue;
        }

        try {
          const contactDatas = computeContactDatas(dataEmissaoISO, c.boleto_due_day);
          const datas: ContactDatas = { dataEmissaoISO, ...contactDatas };
          const seuNumero = seuNumeroFor(emissaoMonth, c.document);
          const resp = await criarBoletoSicoob(token, c, datas, seuNumero);
          if (!resp.ok) {
            results.push({ contact_id: id, name: c.name, status: "error", message: extractSicoobError(resp.data, resp.status) });
            continue;
          }
          const resultado = resp.data?.resultado ?? resp.data;

          // Upload do PDF (base64) para o Storage
          let pdfPath: string | null = null;
          const pdfB64: string | undefined = resultado?.pdfBoleto;
          if (pdfB64) {
            try {
              const bytes = Uint8Array.from(atob(pdfB64), (ch) => ch.charCodeAt(0));
              pdfPath = `${emissaoMonth}/${id}.pdf`;
              const up = await supabase.storage.from("boletos").upload(pdfPath, bytes, {
                contentType: "application/pdf",
                upsert: true,
              });
              if (up.error) pdfPath = null;
            } catch {
              pdfPath = null;
            }
          }

          // sicoob_response sem o base64 gigante
          const { pdfBoleto: _omit, ...resultadoSemPdf } = resultado || {};

          const { error: insErr } = await supabase.from("boleto_controls").insert({
            company_id: COMPANY_ID,
            contact_id: id,
            reference_month: emissaoMonth,
            status: "PENDENTE",
            generated_at: new Date().toISOString(),
            nosso_numero: resultado?.nossoNumero ?? null,
            linha_digitavel: resultado?.linhaDigitavel ?? null,
            codigo_barras: resultado?.codigoBarras ?? null,
            url_qrcode: resultado?.qrCode ?? null,
            valor: Number(c.boleto_value),
            data_vencimento: contactDatas.dataVencimentoISO,
            seu_numero: seuNumero,
            canal_entrega: c.canal_entrega,
            sicoob_response: resultadoSemPdf,
            pdf_url: pdfPath,
          });
          if (insErr) {
            results.push({ contact_id: id, name: c.name, status: "error", message: `Boleto gerado no Sicoob mas falhou ao salvar: ${insErr.message}` });
            continue;
          }
          jaGerados.add(id);
          results.push({ contact_id: id, name: c.name, status: "ok", pdf: !!pdfPath });
        } catch (e) {
          results.push({ contact_id: id, name: c.name, status: "error", message: String((e as Error).message || e) });
        }
      }

      const ok = results.filter((r) => r.status === "ok").length;
      const errors = results.filter((r) => r.status === "error").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      return json({ ok, errors, skipped, results });
    }

    // ---------------- LIST_CONTACTS (para o "Sincronizar com Sicoob" montar os lotes) ----------------
    if (action === "list_contacts") {
      const items = (contatos || [])
        .filter((c: any) => (c.document || "").replace(/\D/g, "").length > 0)
        .map((c: any) => ({ contact_id: c.id, name: c.name }));
      items.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
      return json({ total: items.length, items });
    }

    // ---------------- FIND_ORPHANS (reconciliação: boletos no Sicoob ausentes do sistema) ----------------
    if (action === "find_orphans") {
      const contactIds: string[] = Array.isArray(payload.contact_ids) ? payload.contact_ids : [];
      if (!contactIds.length) return json({ error: "contact_ids vazio" }, 400);

      const byId = new Map((contatos || []).map((c: any) => [c.id, c]));

      const { data: knownRows, error: knownErr } = await supabase
        .from("boleto_controls")
        .select("nosso_numero")
        .eq("company_id", COMPANY_ID)
        .not("nosso_numero", "is", null);
      if (knownErr) throw knownErr;
      const known = new Set((knownRows || []).map((r: any) => Number(r.nosso_numero)));

      let token: string;
      try {
        token = await getSicoobToken();
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }

      const results: any[] = [];

      for (const id of contactIds) {
        const c = byId.get(id);
        if (!c) {
          results.push({ contact_id: id, name: null, encontrados: 0, orfaos: 0, status: "error", message: "Contato não encontrado" });
          continue;
        }
        const cpfCnpj = (c.document || "").replace(/\D/g, "");
        if (!cpfCnpj) {
          results.push({ contact_id: id, name: c.name, encontrados: 0, orfaos: 0, status: "skipped", message: "Sem CPF/CNPJ" });
          continue;
        }
        try {
          const resp = await listarBoletosPorPagador(token, cpfCnpj);
          if (!resp.ok) {
            // 400/404 = pagador sem boletos no Sicoob (comum); outro status = falha real
            if (resp.status === 400 || resp.status === 404) {
              results.push({ contact_id: id, name: c.name, encontrados: 0, orfaos: 0, status: "ok" });
            } else {
              results.push({ contact_id: id, name: c.name, encontrados: 0, orfaos: 0, status: "error", message: extractSicoobError(resp.data, resp.status) });
            }
            continue;
          }

          const lista: SicoobPagadorBoleto[] = Array.isArray(resp.data?.resultado) ? resp.data.resultado : [];
          let orfaosInseridos = 0;
          let falhasInsercao = 0;
          for (const b of lista) {
            const nn = Number(b.nossoNumero);
            if (!nn || known.has(nn)) continue;

            const dataEmissao = b.dataEmissao ? b.dataEmissao.slice(0, 10) : null;
            const dataVencimento = b.dataVencimento ? b.dataVencimento.slice(0, 10) : null;
            // Defesa extra: mesmo com dataInicio no filtro, não expõe/salva vencimento anterior ao piso.
            if (!dataVencimento || dataVencimento < HISTORICO_FLOOR) continue;
            const referenceMonthOrfao = dataEmissao
              ? `${dataEmissao.slice(0, 7)}-01`
              : dataVencimento
              ? `${dataVencimento.slice(0, 7)}-01`
              : null;
            if (!referenceMonthOrfao) continue; // sem data suficiente para classificar o mês

            const { error: insErr } = await supabase.from("boleto_controls").insert({
              company_id: COMPANY_ID,
              contact_id: id,
              reference_month: referenceMonthOrfao,
              status: mapSituacaoBoleto(b.situacaoBoleto),
              generated_at: dataEmissao,
              nosso_numero: nn,
              linha_digitavel: b.linhaDigitavel ?? null,
              codigo_barras: b.codigoBarras ?? null,
              url_qrcode: b.qrCode ?? null,
              valor: b.valor != null ? Number(b.valor) : null,
              data_vencimento: dataVencimento,
              seu_numero: b.seuNumero ?? null,
              canal_entrega: c.canal_entrega ?? null,
              sicoob_response: b,
            });
            if (!insErr) {
              known.add(nn);
              orfaosInseridos++;
            } else {
              falhasInsercao++;
            }
          }
          results.push({
            contact_id: id,
            name: c.name,
            encontrados: lista.length,
            orfaos: orfaosInseridos,
            status: falhasInsercao > 0 ? "error" : "ok",
            message: falhasInsercao > 0 ? `${falhasInsercao} boleto(s) encontrados mas não salvos (erro ao inserir)` : undefined,
          });
        } catch (e) {
          results.push({ contact_id: id, name: c.name, encontrados: 0, orfaos: 0, status: "error", message: String((e as Error).message || e) });
        }
      }

      const totalEncontrados = results.reduce((s, r) => s + (r.encontrados || 0), 0);
      const totalOrfaos = results.reduce((s, r) => s + (r.orfaos || 0), 0);
      const errors = results.filter((r) => r.status === "error");
      return json({
        contacts_scanned: contactIds.length,
        total_encontrados: totalEncontrados,
        total_orfaos: totalOrfaos,
        errors: errors.length,
        details: results.filter((r) => r.orfaos > 0 || r.status === "error"),
      });
    }

    return json({ error: "action inválido" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
