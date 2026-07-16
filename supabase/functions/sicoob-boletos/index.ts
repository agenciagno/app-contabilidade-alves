import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ---------------------------------------------------------------------------
// Geração de boletos Sicoob com preview + seleção.
// action: 'preview'  -> lista elegíveis do mês (sem chamar Sicoob, sem efeito)
// action: 'generate' -> gera os boletos dos contact_ids informados (chunk)
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";

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

// ---------- Datas / feriados (replica a lógica do fluxo N8N) ----------
function calcularPascoa(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}
function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function buildFeriados(year: number): Set<string> {
  const feriados = new Set<string>([
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`,
    `${year}-09-07`, `${year}-10-12`, `${year}-11-02`,
    `${year}-11-15`, `${year}-12-25`,
  ]);
  const pascoa = calcularPascoa(year);
  [-48, -47, -2, 0, 60].forEach((offset) => {
    const d = new Date(pascoa);
    d.setUTCDate(d.getUTCDate() + offset);
    feriados.add(dateKey(d));
  });
  return feriados;
}
function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}
function ultimoDiaUtil(date: Date, feriados: Set<string>): Date {
  const d = new Date(date);
  while (isWeekend(d) || feriados.has(dateKey(d))) d.setUTCDate(d.getUTCDate() - 1);
  return d;
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

const feriadosCache = new Map<number, Set<string>>();
function getFeriados(ano: number): Set<string> {
  if (!feriadosCache.has(ano)) feriadosCache.set(ano, buildFeriados(ano));
  return feriadosCache.get(ano)!;
}

// Data de emissão = data real da geração (hoje, fuso Brasil) — não uma data fixa presumida.
function getDataEmissaoISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Vencimento = dia configurado no perfil do cliente (boleto_due_day), no mês seguinte ao da emissão.
// Descontos: 3% até dia 24 do mês de emissão, 2% até o último dia do mês de emissão.
// Datas ajustadas para o último dia útil anterior quando caem em fim de semana/feriado.
function computeContactDatas(dataEmissaoISO: string, dueDay: number) {
  const [anoEmi, mesEmi] = dataEmissaoISO.split("-").map(Number); // mesEmi 1-12
  const anoVenc = mesEmi === 12 ? anoEmi + 1 : anoEmi;
  const mesVenc = mesEmi === 12 ? 1 : mesEmi + 1;

  const diaVenc = Math.min(Math.max(1, dueDay), daysInMonth(anoVenc, mesVenc));
  const vencimento = ultimoDiaUtil(new Date(Date.UTC(anoVenc, mesVenc - 1, diaVenc)), getFeriados(anoVenc));

  const diaDesc1 = Math.min(24, daysInMonth(anoEmi, mesEmi));
  const desconto1 = ultimoDiaUtil(new Date(Date.UTC(anoEmi, mesEmi - 1, diaDesc1)), getFeriados(anoEmi));
  const desconto2 = ultimoDiaUtil(new Date(Date.UTC(anoEmi, mesEmi, 0)), getFeriados(anoEmi)); // último dia do mês de emissão

  return {
    dataVencimentoISO: dateKey(vencimento),
    desconto1ISO: dateKey(desconto1),
    desconto2ISO: dateKey(desconto2),
  };
}
function seuNumeroFor(referenceMonth: string, document: string | null): string {
  const [ano, mes] = referenceMonth.split("-");
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
  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(SICOOB_CLIENT_ID)}&scope=boletos_inclusao`;
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
    codigoModalidade: 1,
    numeroContaCorrente: NUMERO_CONTA,
    codigoEspecieDocumento: "DM",
    identificacaoEmissaoBoleto: 1,
    identificacaoDistribuicaoBoleto: 1,
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
    tipoMulta: 0,
    tipoJurosMora: 0,
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
    const referenceMonth: string = payload.reference_month; // 'YYYY-MM-01'
    if (!referenceMonth || !/^\d{4}-\d{2}-01$/.test(referenceMonth)) {
      return json({ error: "reference_month inválido (esperado YYYY-MM-01)" }, 400);
    }

    const dataEmissaoISO = getDataEmissaoISO();

    // Contatos elegíveis (boleto ativo)
    const { data: contatos, error: cErr } = await supabase
      .from("contacts")
      .select(CONTACT_COLS)
      .eq("company_id", COMPANY_ID)
      .eq("boleto_active", true)
      .eq("is_active", true);
    if (cErr) throw cErr;

    // Boletos já existentes no mês
    const { data: existentes, error: eErr } = await supabase
      .from("boleto_controls")
      .select("contact_id")
      .eq("company_id", COMPANY_ID)
      .eq("reference_month", referenceMonth);
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
        reference_month: referenceMonth,
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
          const seuNumero = seuNumeroFor(referenceMonth, c.document);
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
              pdfPath = `${referenceMonth}/${id}.pdf`;
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
            reference_month: referenceMonth,
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
      return json({ reference_month: referenceMonth, ok, errors, skipped, results });
    }

    return json({ error: "action inválido (use 'preview' ou 'generate')" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
