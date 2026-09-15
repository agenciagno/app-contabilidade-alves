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

// N8N: salva o PDF na pasta do mês no Drive (BOLETOS SICOOB > 2026 > <MÊS>). Só pros boletos
// gerados por "Gerar lote"/"Boleto avulso" a partir de 08/09/2026 — decisão de Gabriel, o
// histórico sincronizado via find_orphans não entra nessa automação.
const N8N_DRIVE_WEBHOOK_URL = "https://n8n.contabilidadealves.com.br/webhook/boleto-pdf-drive";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Roda `fn` sobre `items` com no máximo `limit` execuções simultâneas — usado em find_orphans pra
// não fazer as chamadas ao Sicoob (mTLS + round-trip) uma de cada vez, sequencial.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

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
function formatBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
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
// Desconto sempre deriva do mês de emissão (hoje), independente do vencimento —
// vale tanto pro ciclo mensal quanto pro boleto avulso.
function computeDescontoDatas(dataEmissaoISO: string) {
  const [anoEmi, mesEmi] = dataEmissaoISO.split("-").map(Number);
  const diaDesc1 = Math.min(24, daysInMonth(anoEmi, mesEmi));
  const desconto1 = new Date(Date.UTC(anoEmi, mesEmi - 1, diaDesc1));
  const desconto2 = new Date(Date.UTC(anoEmi, mesEmi, 0)); // último dia do mês de emissão
  return { desconto1ISO: dateKey(desconto1), desconto2ISO: dateKey(desconto2) };
}

function computeContactDatas(dataEmissaoISO: string, dueDay: number) {
  const [anoEmi, mesEmi] = dataEmissaoISO.split("-").map(Number); // mesEmi 1-12
  const anoVenc = mesEmi === 12 ? anoEmi + 1 : anoEmi;
  const mesVenc = mesEmi === 12 ? 1 : mesEmi + 1;

  const diaVenc = Math.min(Math.max(1, dueDay), daysInMonth(anoVenc, mesVenc));
  const vencimento = new Date(Date.UTC(anoVenc, mesVenc - 1, diaVenc));

  return {
    dataVencimentoISO: dateKey(vencimento),
    ...computeDescontoDatas(dataEmissaoISO),
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
  "id,name,document,email,phone,whatsapp,email_cobranca,whatsapp_cobranca,address,address_number,neighborhood,city,state,cep,boleto_value,boleto_due_day,canal_entrega,enviar_cobranca_auto,razao_social,nome_fantasia,display_name";

// Mesma cascata de getContactLegalName (src/lib/contact-display.ts) — razão social é o padrão
// legal em todo o Financeiro. Só pro nome do arquivo no Drive, em caixa alta (pedido de Gabriel,
// 08/09/2026), não muda o que é mandado pro Sicoob (pagador.nome já usa c.name direto, correto).
function legalNameUpper(c: Record<string, any>): string {
  const nome = c.razao_social || c.nome_fantasia || c.display_name || c.name || "";
  return String(nome).toUpperCase();
}

// ---------- Sicoob ----------
// Escopo padrão (boletos). Conta Corrente (extrato/saldo) usa cco_consulta — API 3 no portal
// Sicoob, confirmado em 20/07 (só existe cco_consulta e cco_transferencias, não escopos separados
// por endpoint).
async function getSicoobToken(scope = "boletos_inclusao boletos_consulta"): Promise<string> {
  // @ts-ignore unstable API — mTLS validado no edge runtime
  const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
  const scopeParam = encodeURIComponent(scope);
  const body = `grant_type=client_credentials&client_id=${encodeURIComponent(SICOOB_CLIENT_ID)}&scope=${scopeParam}`;
  const res = await fetch(
    "https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token",
    { method: "POST", client, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  // Lê como texto primeiro — um 403 de gateway/WAF (não do Sicoob) não vem em JSON, e
  // res.json().catch(()=>({})) mascarava isso como mensagem vazia (08/09/2026).
  const raw = await res.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch { /* corpo não é JSON */ }
  if (!res.ok || !data.access_token) {
    const detail = data?.error_description || data?.error || raw.slice(0, 500) || "sem corpo de resposta";
    throw new Error(`Falha ao autenticar no Sicoob (HTTP ${res.status}): ${detail}`);
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

// GET /boletos — consulta individual (não confundir com "listar por pagador" acima). Só chamada
// para boletos que acabaram de virar LIQUIDADO, atrás do listaHistorico — é o único lugar da API
// de boletos do Sicoob que carrega uma data por evento. Confirmado no schema oficial (Swagger
// cobranca-bancaria-v3, model InlineResponse200Resultado): não existe valorPago/valorRecebido em
// nenhum nível dessa API — por isso o valor pago não é preenchido automaticamente aqui, só via
// conciliação manual do extrato (Conciliação Sicoob).
async function consultarBoletoDetalhe(token: string, nossoNumero: number) {
  // @ts-ignore unstable API
  const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
  const url = `https://api.sicoob.com.br/cobranca-bancaria/v3/boletos?numeroCliente=${NUMERO_CLIENTE}&codigoModalidade=1&nossoNumero=${nossoNumero}`;
  const res = await fetch(url, {
    method: "GET",
    client,
    headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Accept": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Acha a data do evento de liquidação no listaHistorico (mesma heurística textual "LIQUID" já
// usada em mapSituacaoBoleto). Sem entrada compatível, não inventa data — fica null.
function extrairDataPagamento(listaHistorico: unknown): string | null {
  if (!Array.isArray(listaHistorico)) return null;
  const evento = listaHistorico.find((h: any) =>
    `${h?.tipoHistorico || ""} ${h?.descricaoHistorico || ""}`.toUpperCase().includes("LIQUID")
  );
  const data = (evento as any)?.dataHistorico;
  return data ? String(data).slice(0, 10) : null;
}

// GET /boletos/segunda-via — único jeito de recuperar o PDF de um boleto que já existe no Sicoob
// (a criação retorna o PDF na hora, mas a listagem por pagador usada no sync não traz o binário).
// Confirmado no código-fonte de uma lib de terceiro que implementa a v3 (não há Swagger público
// completo): GET com numeroCliente+codigoModalidade+nossoNumero+gerarPdf=true, resposta no mesmo
// formato de "resultado.pdfBoleto" da criação. Falha aqui nunca bloqueia o sync — só fica sem PDF,
// igual já acontece hoje (08/09/2026).
async function buscarSegundaViaPdf(token: string, nossoNumero: number): Promise<Uint8Array | null> {
  try {
    // @ts-ignore unstable API
    const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
    const url = `https://api.sicoob.com.br/cobranca-bancaria/v3/boletos/segunda-via?numeroCliente=${NUMERO_CLIENTE}&codigoModalidade=1&nossoNumero=${nossoNumero}&gerarPdf=true`;
    const res = await fetch(url, {
      method: "GET",
      client,
      headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const b64: string | undefined = data?.resultado?.pdfBoleto ?? data?.pdfBoleto;
    if (!b64) return null;
    return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

// GET /saldo — saldo atual/bloqueado/limite da conta corrente. Só leitura.
async function consultarSaldo(token: string) {
  // @ts-ignore unstable API
  const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
  const url = `https://api.sicoob.com.br/conta-corrente/v4/saldo?numeroContaCorrente=${NUMERO_CONTA}`;
  const res = await fetch(url, {
    method: "GET",
    client,
    headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Accept": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// GET /extrato/{mes}/{ano} — extrato completo da conta corrente (todos os lançamentos, não só
// boletos: PIX, TED, tarifas, etc.). Só leitura.
async function consultarExtrato(token: string, mes: number, ano: number) {
  // @ts-ignore unstable API
  const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
  const url = `https://api.sicoob.com.br/conta-corrente/v4/extrato/${mes}/${ano}?numeroContaCorrente=${NUMERO_CONTA}`;
  const res = await fetch(url, {
    method: "GET",
    client,
    headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Accept": "application/json" },
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
  const diaSeguinteVenc = addDaysISO(datas.dataVencimentoISO, 1);
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
    dataMulta: diaSeguinteVenc,
    valorMulta: 2,
    tipoJurosMora: 1,
    dataJurosMora: diaSeguinteVenc,
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
      // E-mail de cobrança tem prioridade — pode ser o do responsável financeiro do cliente,
      // não o representante legal cadastrado em Identificação.
      email: c.email_cobranca || c.email,
    },
    // Texto padrão obrigatório em todo boleto — datas calculadas por boleto (dia seguinte ao
    // vencimento p/ multa/juros; dia 24 e último dia do mês de emissão p/ desconto).
    mensagensInstrucao: [
      `A partir ${formatBR(diaSeguinteVenc)} Juros 0,07%/dia.`,
      `A partir ${formatBR(diaSeguinteVenc)} Multa de 2%.`,
      `Até ${formatBR(datas.desconto1ISO)} desconto de 3,00%`,
      `Até ${formatBR(datas.desconto2ISO)} desconto de 2,00%`,
    ],
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

// Assina a URL do PDF (10 min) e dispara o webhook N8N que sobe pro Drive. Usado tanto pelo
// aviso automático (fire-and-forget) quanto pelo resync manual (action: 'resync_drive'), que
// precisa saber se deu certo pra reportar item a item.
async function enviarParaDrive(
  supabase: ReturnType<typeof createClient>,
  params: { nomeCliente: string; valor: number; dataVencimento: string; pdfPath: string },
): Promise<{ ok: boolean; message?: string }> {
  const { data: signed, error } = await supabase.storage
    .from("boletos")
    .createSignedUrl(params.pdfPath, 600);
  if (error || !signed?.signedUrl) {
    return { ok: false, message: error?.message || "Falha ao gerar signed URL do PDF" };
  }
  const res = await fetch(N8N_DRIVE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome_cliente: params.nomeCliente,
      valor: params.valor,
      data_vencimento: params.dataVencimento,
      pdf_signed_url: signed.signedUrl,
    }),
  });
  if (!res.ok) return { ok: false, message: `Webhook N8N respondeu HTTP ${res.status}` };
  return { ok: true };
}

// Dispara em background (EdgeRuntime.waitUntil) pra não atrasar a resposta da geração —
// falha aqui nunca derruba o boleto, que já está gerado e salvo no Sicoob/banco.
async function avisarDriveWebhook(
  supabase: ReturnType<typeof createClient>,
  params: { nomeCliente: string; valor: number; dataVencimento: string; pdfPath: string },
) {
  try {
    await enviarParaDrive(supabase, params);
  } catch {
    // N8N/Drive fora do ar não deve nunca aparecer como erro de geração de boleto.
  }
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

    // Meses de vencimento já registrados por contato — QUALQUER origem (manual no Sicoob,
    // "Gerar lote" ou "Boleto avulso") e QUALQUER status, não só o que nasceu com
    // reference_month = mês de emissão de hoje. Motivo (08/09/2026): boleto criado manualmente
    // no Sicoob só entra em boleto_controls quando o sync roda, dias/semanas depois — o
    // reference_month dele reflete a emissão real (no Sicoob), não o ciclo de hoje. Um cliente
    // com boleto pendente vencendo mês que vem (criado manualmente há semanas) reaparecia como
    // "elegível" aqui, e "Gerar lote" duplicava a cobrança pro mesmo mês de vencimento. Ver
    // roadmap.md 08/09/2026.
    const contactIds = (contatos || []).map((c: any) => c.id);
    const vencimentoMonthsByContact = new Map<string, Set<string>>();
    if (contactIds.length) {
      const { data: existentes, error: eErr } = await supabase
        .from("boleto_controls")
        .select("contact_id, data_vencimento")
        .eq("company_id", COMPANY_ID)
        .in("contact_id", contactIds);
      if (eErr) throw eErr;
      for (const row of existentes || []) {
        if (!row.data_vencimento) continue;
        const mes = String(row.data_vencimento).slice(0, 7);
        if (!vencimentoMonthsByContact.has(row.contact_id)) vencimentoMonthsByContact.set(row.contact_id, new Set());
        vencimentoMonthsByContact.get(row.contact_id)!.add(mes);
      }
    }
    function jaTemBoletoNoMesDeVencimento(contactId: string, dataVencimentoISO: string): boolean {
      return vencimentoMonthsByContact.get(contactId)?.has(dataVencimentoISO.slice(0, 7)) ?? false;
    }
    function marcarVencimentoGerado(contactId: string, dataVencimentoISO: string) {
      if (!vencimentoMonthsByContact.has(contactId)) vencimentoMonthsByContact.set(contactId, new Set());
      vencimentoMonthsByContact.get(contactId)!.add(dataVencimentoISO.slice(0, 7));
    }

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
          already_generated: contactDatas ? jaTemBoletoNoMesDeVencimento(c.id, contactDatas.dataVencimentoISO) : false,
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
        const faltando = missingFields(c);
        if (faltando.length) {
          results.push({ contact_id: id, name: c.name, status: "error", message: `Dados incompletos: ${faltando.join(", ")}` });
          continue;
        }
        const contactDatas = computeContactDatas(dataEmissaoISO, c.boleto_due_day);
        if (jaTemBoletoNoMesDeVencimento(id, contactDatas.dataVencimentoISO)) {
          results.push({ contact_id: id, name: c.name, status: "skipped", message: "Cliente já tem boleto com vencimento neste mês" });
          continue;
        }

        try {
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
          marcarVencimentoGerado(id, contactDatas.dataVencimentoISO);
          if (pdfPath) {
            // deno-lint-ignore no-explicit-any
            (globalThis as any).EdgeRuntime?.waitUntil(avisarDriveWebhook(supabase, {
              nomeCliente: legalNameUpper(c),
              valor: Number(c.boleto_value),
              dataVencimento: contactDatas.dataVencimentoISO,
              pdfPath,
            }));
          }
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

    // ---------------- GENERATE_SINGLE (boleto avulso: valor e vencimento escolhidos na hora) --
    if (action === "generate_single") {
      const contactId: string = payload.contact_id;
      const valorInput = Number(payload.valor);
      const vencimentoInput: string = payload.data_vencimento;

      if (!contactId) return json({ error: "Cliente não informado" }, 400);
      if (!Number.isFinite(valorInput) || valorInput <= 0) return json({ error: "Valor inválido" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoInput || "")) {
        return json({ error: "Data de vencimento inválida" }, 400);
      }

      const c = (contatos || []).find((x: any) => x.id === contactId);
      if (!c) return json({ error: "Cliente não encontrado ou inativo" }, 404);

      const faltando = missingFields(c);
      if (faltando.length) return json({ error: `Dados incompletos: ${faltando.join(", ")}` }, 400);

      // Trava de segurança: mesmo cliente + mesma data de vencimento exata já registrado
      // (qualquer origem/status) — bloqueia duplicidade óbvia sem impedir 2 boletos avulsos
      // legítimos no mesmo mês com vencimentos diferentes.
      const { data: dupRows, error: dupErr } = await supabase
        .from("boleto_controls")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .eq("contact_id", contactId)
        .eq("data_vencimento", vencimentoInput)
        .limit(1);
      if (dupErr) throw dupErr;
      if (dupRows && dupRows.length) {
        return json({ error: "Este cliente já tem um boleto registrado com esse mesmo vencimento." }, 409);
      }

      let token: string;
      try {
        token = await getSicoobToken();
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }

      // Desconto segue a regra do mês de emissão; vencimento é o escolhido na hora (não o
      // boleto_due_day do cadastro) — por isso não passa por computeContactDatas.
      const datas: ContactDatas = {
        dataEmissaoISO,
        dataVencimentoISO: vencimentoInput,
        ...computeDescontoDatas(dataEmissaoISO),
      };
      // Sufixo de tempo pra não colidir com o seuNumero do ciclo mensal do mesmo cliente/mês.
      const seuNumero = `${seuNumeroFor(emissaoMonth, c.document)}${String(Date.now()).slice(-4)}`;

      const resp = await criarBoletoSicoob(token, { ...c, boleto_value: valorInput }, datas, seuNumero);
      if (!resp.ok) {
        return json({ error: extractSicoobError(resp.data, resp.status) }, 502);
      }
      const resultado = resp.data?.resultado ?? resp.data;

      let pdfPath: string | null = null;
      const pdfB64: string | undefined = resultado?.pdfBoleto;
      if (pdfB64) {
        try {
          const bytes = Uint8Array.from(atob(pdfB64), (ch) => ch.charCodeAt(0));
          pdfPath = `${emissaoMonth}/${contactId}-avulso-${Date.now()}.pdf`;
          const up = await supabase.storage.from("boletos").upload(pdfPath, bytes, {
            contentType: "application/pdf",
            upsert: true,
          });
          if (up.error) pdfPath = null;
        } catch {
          pdfPath = null;
        }
      }

      const { pdfBoleto: _omit, ...resultadoSemPdf } = resultado || {};

      const { error: insErr } = await supabase.from("boleto_controls").insert({
        company_id: COMPANY_ID,
        contact_id: contactId,
        reference_month: emissaoMonth,
        status: "PENDENTE",
        generated_at: new Date().toISOString(),
        nosso_numero: resultado?.nossoNumero ?? null,
        linha_digitavel: resultado?.linhaDigitavel ?? null,
        codigo_barras: resultado?.codigoBarras ?? null,
        url_qrcode: resultado?.qrCode ?? null,
        valor: valorInput,
        data_vencimento: vencimentoInput,
        seu_numero: seuNumero,
        canal_entrega: c.canal_entrega,
        sicoob_response: resultadoSemPdf,
        pdf_url: pdfPath,
      });
      if (insErr) {
        return json({ error: `Boleto gerado no Sicoob mas falhou ao salvar: ${insErr.message}` }, 500);
      }

      if (pdfPath) {
        // deno-lint-ignore no-explicit-any
        (globalThis as any).EdgeRuntime?.waitUntil(avisarDriveWebhook(supabase, {
          nomeCliente: legalNameUpper(c),
          valor: valorInput,
          dataVencimento: vencimentoInput,
          pdfPath,
        }));
      }

      return json({ ok: true, contact_id: contactId, name: c.name, nosso_numero: resultado?.nossoNumero ?? null, pdf: !!pdfPath });
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

      // Um cliente de cada vez levava ~14 lotes de 15 a estourar o timeout do pg_net (5s) e a
      // deixar o botão "Sincronizar" lento — cada contato faz 1+ chamadas ao Sicoob (mTLS) em
      // série. Processando alguns contatos em paralelo (limite abaixo) sem sobrecarregar o Sicoob.
      const FIND_ORPHANS_CONCURRENCY = 5;

      const processContact = async (id: string): Promise<any> => {
        const c = byId.get(id);
        if (!c) {
          return { contact_id: id, name: null, encontrados: 0, orfaos: 0, status: "error", message: "Contato não encontrado" };
        }
        const cpfCnpj = (c.document || "").replace(/\D/g, "");
        if (!cpfCnpj) {
          return { contact_id: id, name: c.name, encontrados: 0, orfaos: 0, status: "skipped", message: "Sem CPF/CNPJ" };
        }
        try {
          const resp = await listarBoletosPorPagador(token, cpfCnpj);
          if (!resp.ok) {
            // 400/404 = pagador sem boletos no Sicoob (comum); outro status = falha real
            if (resp.status === 400 || resp.status === 404) {
              return { contact_id: id, name: c.name, encontrados: 0, orfaos: 0, status: "ok" };
            }
            return { contact_id: id, name: c.name, encontrados: 0, orfaos: 0, status: "error", message: extractSicoobError(resp.data, resp.status) };
          }

          const lista: SicoobPagadorBoleto[] = Array.isArray(resp.data?.resultado) ? resp.data.resultado : [];
          let orfaosInseridos = 0;
          let falhasInsercao = 0;
          let statusAtualizados = 0;
          for (const b of lista) {
            const nn = Number(b.nossoNumero);
            if (!nn) continue;

            // Já existe localmente — atualiza status quando o Sicoob já mostra LIQUIDADO e o
            // registro local ainda não está PAGO, e completa o PDF se estiver faltando (boleto
            // sincronizado nunca teve PDF salvo, porque a listagem por pagador não devolve o
            // binário — só a criação e a "segunda via" trazem). Visual/arquivo apenas: não baixa
            // boleto nem cria movimentação.
            if (known.has(nn)) {
              const { data: localRow } = await supabase
                .from("boleto_controls")
                .select("id, status, pdf_url, reference_month")
                .eq("company_id", COMPANY_ID)
                .eq("nosso_numero", nn)
                .maybeSingle();
              if (!localRow) continue;

              const updates: Record<string, unknown> = {};

              if (!localRow.pdf_url) {
                const pdfBytes = await buscarSegundaViaPdf(token, nn);
                if (pdfBytes) {
                  const pdfPath = `${localRow.reference_month}/${id}-${nn}.pdf`;
                  const up = await supabase.storage.from("boletos").upload(pdfPath, pdfBytes, {
                    contentType: "application/pdf",
                    upsert: true,
                  });
                  if (!up.error) updates.pdf_url = pdfPath;
                }
              }

              if (mapSituacaoBoleto(b.situacaoBoleto) === "PAGO" && localRow.status !== "PAGO") {
                let dataPagamento: string | null = null;
                try {
                  const det = await consultarBoletoDetalhe(token, nn);
                  if (det.ok) dataPagamento = extrairDataPagamento((det.data as any)?.resultado?.listaHistorico);
                } catch {
                  // Segue sem data — não bloqueia a atualização do status por causa disso.
                }
                updates.status = "PAGO";
                updates.data_pagamento = dataPagamento;
                updates.sicoob_response = b;
              }

              if (Object.keys(updates).length) {
                const { error: updErr } = await supabase.from("boleto_controls").update(updates).eq("id", localRow.id);
                if (!updErr && updates.status === "PAGO") statusAtualizados++;
              }
              continue;
            }

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

            // PDF do boleto recém-achado — a listagem por pagador não traz o binário, busca
            // separado via segunda via. Falha aqui não bloqueia o registro do boleto.
            let pdfPath: string | null = null;
            const pdfBytes = await buscarSegundaViaPdf(token, nn);
            if (pdfBytes) {
              const path = `${referenceMonthOrfao}/${id}-${nn}.pdf`;
              const up = await supabase.storage.from("boletos").upload(path, pdfBytes, {
                contentType: "application/pdf",
                upsert: true,
              });
              if (!up.error) pdfPath = path;
            }

            // upsert com ignoreDuplicates: a constraint única (company_id, nosso_numero) é quem
            // garante idempotência de verdade — o Set em memória não protege contra execuções
            // concorrentes (foi assim que duplicatas entraram antes da constraint existir).
            const { error: insErr } = await supabase.from("boleto_controls").upsert({
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
              pdf_url: pdfPath,
            }, { onConflict: "company_id,nosso_numero", ignoreDuplicates: true });
            if (!insErr) {
              known.add(nn);
              orfaosInseridos++;
            } else {
              falhasInsercao++;
            }
          }
          return {
            contact_id: id,
            name: c.name,
            encontrados: lista.length,
            orfaos: orfaosInseridos,
            atualizados: statusAtualizados,
            status: falhasInsercao > 0 ? "error" : "ok",
            message: falhasInsercao > 0 ? `${falhasInsercao} boleto(s) encontrados mas não salvos (erro ao inserir)` : undefined,
          };
        } catch (e) {
          return { contact_id: id, name: c.name, encontrados: 0, orfaos: 0, atualizados: 0, status: "error", message: String((e as Error).message || e) };
        }
      };

      const results = await mapWithConcurrency(contactIds, FIND_ORPHANS_CONCURRENCY, processContact);

      const totalEncontrados = results.reduce((s, r) => s + (r.encontrados || 0), 0);
      const totalOrfaos = results.reduce((s, r) => s + (r.orfaos || 0), 0);
      const totalAtualizados = results.reduce((s, r) => s + (r.atualizados || 0), 0);
      const errors = results.filter((r) => r.status === "error");
      return json({
        contacts_scanned: contactIds.length,
        total_encontrados: totalEncontrados,
        total_orfaos: totalOrfaos,
        total_atualizados: totalAtualizados,
        errors: errors.length,
        details: results.filter((r) => r.orfaos > 0 || r.atualizados > 0 || r.status === "error"),
      });
    }

    // ---------------- RESYNC_DRIVE (reenvia pro Drive boletos cujo PDF já existe no Storage mas
    // o webhook N8N não recebeu na hora — ex. VPS do N8N fora do ar durante a geração) ----------------
    if (action === "resync_drive") {
      const boletoIds: string[] = Array.isArray(payload.boleto_ids) ? payload.boleto_ids : [];
      if (!boletoIds.length) return json({ error: "boleto_ids vazio" }, 400);

      const { data: rows, error: rowsErr } = await supabase
        .from("boleto_controls")
        .select("id, contact_id, valor, data_vencimento, pdf_url")
        .eq("company_id", COMPANY_ID)
        .in("id", boletoIds);
      if (rowsErr) throw rowsErr;

      const contactIdsNeeded = [...new Set((rows || []).map((r: any) => r.contact_id))];
      const { data: contatosResync, error: contatosErr } = await supabase
        .from("contacts")
        .select("id,razao_social,nome_fantasia,display_name,name")
        .in("id", contactIdsNeeded.length ? contactIdsNeeded : [""]);
      if (contatosErr) throw contatosErr;
      const contactById = new Map((contatosResync || []).map((c: any) => [c.id, c]));

      const results: any[] = [];
      for (const row of rows || []) {
        if (!row.pdf_url) {
          results.push({ id: row.id, contact_id: row.contact_id, status: "skipped", message: "Sem PDF salvo no Storage" });
          continue;
        }
        const c = contactById.get(row.contact_id);
        const nomeCliente = c ? legalNameUpper(c) : "DESCONHECIDO";
        try {
          const outcome = await enviarParaDrive(supabase, {
            nomeCliente,
            valor: Number(row.valor),
            dataVencimento: row.data_vencimento,
            pdfPath: row.pdf_url,
          });
          results.push({ id: row.id, contact_id: row.contact_id, name: nomeCliente, status: outcome.ok ? "ok" : "error", message: outcome.message });
        } catch (e) {
          results.push({ id: row.id, contact_id: row.contact_id, name: nomeCliente, status: "error", message: String((e as Error).message || e) });
        }
      }
      const ok = results.filter((r) => r.status === "ok").length;
      const errors = results.filter((r) => r.status === "error").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      return json({ ok, errors, skipped, results });
    }

    // ---------------- SALDO (só leitura, Conta Corrente) ----------------
    if (action === "saldo") {
      let token: string;
      try {
        token = await getSicoobToken("cco_consulta");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      const resp = await consultarSaldo(token);
      if (!resp.ok) return json({ error: extractSicoobError(resp.data, resp.status) }, 502);
      return json(resp.data?.resultado ?? resp.data);
    }

    // ---------------- EXTRATO (só leitura, Conta Corrente — mês/ano completos) ----------------
    if (action === "extrato") {
      const mes = Number(payload.mes);
      const ano = Number(payload.ano);
      if (!mes || mes < 1 || mes > 12 || !ano) return json({ error: "mês/ano inválidos" }, 400);

      let token: string;
      try {
        token = await getSicoobToken("cco_consulta");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      const resp = await consultarExtrato(token, mes, ano);
      if (!resp.ok) return json({ error: extractSicoobError(resp.data, resp.status) }, 502);
      return json(resp.data?.resultado ?? resp.data);
    }

    // ---------------- WEBHOOK_CADASTRAR (registra a URL de sicoob-webhook-boletos pra notificação
    // em tempo real de baixa/pagamento — codigoTipoMovimento 7) ----------------
    if (action === "webhook_cadastrar") {
      const webhookUrl: string = payload.url;
      const email: string = payload.email;
      if (!webhookUrl || !email) return json({ error: "url e email são obrigatórios" }, 400);

      let token: string;
      try {
        token = await getSicoobToken("webhooks_inclusao webhooks_consulta");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const res = await fetch("https://api.sicoob.com.br/cobranca-bancaria/v3/webhooks", {
        method: "POST",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, codigoTipoMovimento: 7, codigoPeriodoMovimento: 1, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: extractSicoobError(data, res.status) }, 502);
      return json(data);
    }

    // ---------------- WEBHOOK_CONSULTAR (lista os webhooks cadastrados, pra checar saúde) ----------------
    if (action === "webhook_consultar") {
      let token: string;
      try {
        token = await getSicoobToken("webhooks_consulta");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const res = await fetch("https://api.sicoob.com.br/cobranca-bancaria/v3/webhooks?codigoTipoMovimento=7", {
        method: "GET",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Accept": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: extractSicoobError(data, res.status) }, 502);
      return json(data);
    }

    // ---------------- WEBHOOK_SOLICITACOES (histórico de entregas de um webhook — sucesso/erro
    // por notificação, pra diagnosticar se o Sicoob tá conseguindo nos avisar) ----------------
    if (action === "webhook_solicitacoes") {
      const idWebhook = Number(payload.id_webhook);
      const dataSolicitacao: string = payload.data_solicitacao || getDataEmissaoISO();
      if (!idWebhook) return json({ error: "id_webhook é obrigatório" }, 400);

      let token: string;
      try {
        token = await getSicoobToken("webhooks_consulta");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const url = `https://api.sicoob.com.br/cobranca-bancaria/v3/webhooks/${idWebhook}/solicitacoes?dataSolicitacao=${dataSolicitacao}&pagina=1`;
      const res = await fetch(url, {
        method: "GET",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Accept": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: extractSicoobError(data, res.status) }, 502);
      return json(data);
    }

    // ---------------- WEBHOOK_REATIVAR (reativa um webhook que o Sicoob desativou sozinho —
    // ex.: depois de falhas repetidas de entrega) ----------------
    if (action === "webhook_reativar") {
      const idWebhook = Number(payload.id_webhook);
      if (!idWebhook) return json({ error: "id_webhook é obrigatório" }, 400);

      let token: string;
      try {
        token = await getSicoobToken("webhooks_alteracao");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const res = await fetch(`https://api.sicoob.com.br/cobranca-bancaria/v3/webhooks/${idWebhook}/reativar`, {
        method: "PATCH",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Content-Type": "application/json" },
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        return json({ error: extractSicoobError(data, res.status) }, 502);
      }
      return json({ ok: true });
    }

    // ---------------- WEBHOOK_HEALTHCHECK (pensado pra rodar 1x/dia via cron: confere se o
    // webhook de baixa continua ativo no Sicoob e reativa sozinho se não estiver — sem isso, uma
    // desativação silenciosa faria a baixa em tempo real parar sem ninguém perceber) ----------------
    if (action === "webhook_healthcheck") {
      let token: string;
      try {
        token = await getSicoobToken("webhooks_consulta webhooks_alteracao");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const consultaRes = await fetch("https://api.sicoob.com.br/cobranca-bancaria/v3/webhooks?codigoTipoMovimento=7", {
        method: "GET",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Accept": "application/json" },
      });
      const consultaData = await consultaRes.json().catch(() => ({}));
      if (!consultaRes.ok) return json({ error: extractSicoobError(consultaData, consultaRes.status) }, 502);

      const webhooks = Array.isArray(consultaData?.resultado) ? consultaData.resultado : [];
      const webhook = webhooks[0];
      if (!webhook) return json({ status: "sem_webhook_cadastrado" });

      // Heurística: só reativa quando a descrição não indica sucesso — não sabemos de antemão
      // todos os códigos possíveis de codigoSituacao (docs não listam), então não arriscamos
      // interpretar um código específico como "ativo".
      const situacaoOk = String(webhook.descricaoSituacao || "").toLowerCase().includes("sucesso");
      if (situacaoOk) {
        return json({ status: "ativo", descricaoSituacao: webhook.descricaoSituacao, idWebhook: webhook.idWebhook });
      }

      const reativarRes = await fetch(`https://api.sicoob.com.br/cobranca-bancaria/v3/webhooks/${webhook.idWebhook}/reativar`, {
        method: "PATCH",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Content-Type": "application/json" },
      });
      const reativado = reativarRes.status === 204;

      // global_logs exige user_id (not null, FK de usuário real) — não cabe um evento de cron
      // sem usuário logado. Fica só no log da function mesmo (query_logs no Supabase consulta
      // isso se precisar investigar); o retorno do healthcheck já reporta o estado.
      console.log(
        reativado
          ? `Webhook Sicoob estava inativo (${webhook.descricaoSituacao}) — reativado automaticamente.`
          : `Webhook Sicoob inativo (${webhook.descricaoSituacao}) — tentativa de reativação falhou, precisa de atenção manual.`,
        { idWebhook: webhook.idWebhook },
      );

      return json({ status: reativado ? "reativado" : "falha_ao_reativar", descricaoSituacao: webhook.descricaoSituacao, idWebhook: webhook.idWebhook });
    }

    // ---------------- HEALTH (disponibilidade da API — usado como preflight antes de rodar lote,
    // pra dar um erro claro em vez de uma parede de falhas por timeout) ----------------
    if (action === "health") {
      try {
        const token = await getSicoobToken();
        // @ts-ignore unstable API
        const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
        const res = await fetch("https://api.sicoob.com.br/cobranca-bancaria/v3/health", {
          method: "GET",
          client,
          headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID },
        });
        return json({ ok: res.ok, status: res.status });
      } catch (e) {
        return json({ ok: false, error: String((e as Error).message || e) });
      }
    }

    // ---------------- ATUALIZAR_PAGADOR (sincroniza o cadastro do pagador no Sicoob com o que
    // está em contacts hoje — PUT /pagadores usa o mesmo mapeamento de campos já usado na criação
    // de boleto) ----------------
    if (action === "atualizar_pagador") {
      const contactId: string = payload.contact_id;
      const c = (contatos || []).find((x: any) => x.id === contactId);
      if (!c) return json({ error: "Cliente não encontrado ou inativo" }, 404);
      const faltando = missingFields(c);
      if (faltando.length) return json({ error: `Dados incompletos: ${faltando.join(", ")}` }, 400);

      let token: string;
      try {
        token = await getSicoobToken("boletos_alteracao");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const res = await fetch("https://api.sicoob.com.br/cobranca-bancaria/v3/pagadores", {
        method: "PUT",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroCliente: NUMERO_CLIENTE,
          numeroCpfCnpj: (c.document || "").replace(/\D/g, ""),
          nome: c.name,
          endereco: `${c.address}, ${c.address_number}`,
          bairro: c.neighborhood,
          cidade: c.city,
          uf: c.state,
          cep: (c.cep || "").replace(/\D/g, ""),
          email: c.email_cobranca || c.email,
        }),
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        return json({ error: extractSicoobError(data, res.status) }, 502);
      }
      return json({ ok: true, name: c.name });
    }

    // ---------------- ALTERAR_BOLETO (PATCH /boletos/{nossoNumero} — só 1 objeto de alteração
    // por chamada, por isso o action aceita só "campo": 'prorrogacaoVencimento' | 'valorNominal') ----------------
    if (action === "alterar_boleto") {
      const nossoNumero = Number(payload.nosso_numero);
      const campo: string = payload.campo;
      if (!nossoNumero || !["prorrogacaoVencimento", "valorNominal"].includes(campo)) {
        return json({ error: "nosso_numero e campo (prorrogacaoVencimento|valorNominal) são obrigatórios" }, 400);
      }

      let alteracao: Record<string, unknown>;
      let localUpdate: Record<string, unknown>;
      if (campo === "prorrogacaoVencimento") {
        const novaData: string = payload.data_vencimento;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData || "")) return json({ error: "data_vencimento inválida" }, 400);
        alteracao = { prorrogacaoVencimento: { dataVencimento: novaData } };
        localUpdate = { data_vencimento: novaData };
      } else {
        const novoValor = Number(payload.valor);
        if (!Number.isFinite(novoValor) || novoValor <= 0) return json({ error: "valor inválido" }, 400);
        alteracao = { valorNominal: { valor: novoValor } };
        localUpdate = { valor: novoValor };
      }

      let token: string;
      try {
        token = await getSicoobToken("boletos_alteracao");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const res = await fetch(`https://api.sicoob.com.br/cobranca-bancaria/v3/boletos/${nossoNumero}`, {
        method: "PATCH",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Content-Type": "application/json" },
        body: JSON.stringify({ numeroCliente: NUMERO_CLIENTE, codigoModalidade: 1, ...alteracao }),
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        return json({ error: extractSicoobError(data, res.status) }, 502);
      }

      const { error: updErr } = await supabase
        .from("boleto_controls")
        .update(localUpdate)
        .eq("company_id", COMPANY_ID)
        .eq("nosso_numero", nossoNumero);
      if (updErr) return json({ error: `Alterado no Sicoob mas falhou ao atualizar localmente: ${updErr.message}` }, 500);
      return json({ ok: true });
    }

    // ---------------- BAIXAR_MANUAL (POST /boletos/{nossoNumero}/baixar — comanda no Sicoob o
    // cancelamento de um boleto PENDENTE pago por fora da rede bancária, ex. Pix direto/dinheiro.
    // Só cancela no Sicoob; quem grava valor_pago/liquida o lançamento é o caller, depois do ok) ----------------
    if (action === "baixar_manual") {
      const nossoNumero = Number(payload.nosso_numero);
      if (!nossoNumero) return json({ error: "nosso_numero inválido" }, 400);

      let token: string;
      try {
        token = await getSicoobToken("boletos_alteracao");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const res = await fetch(`https://api.sicoob.com.br/cobranca-bancaria/v3/boletos/${nossoNumero}/baixar`, {
        method: "POST",
        client,
        headers: { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Content-Type": "application/json" },
        body: JSON.stringify({ numeroCliente: NUMERO_CLIENTE, codigoModalidade: 1 }),
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        return json({ error: extractSicoobError(data, res.status) }, 502);
      }
      return json({ ok: true });
    }

    // ---------------- MOVIMENTACAO_SYNC (relatório em lote da carteira — POST solicitar → GET
    // status (com espera curta) → GET download → decodifica e atualiza boleto_controls. Só
    // enriquece leitura (valor_pago/data_pagamento/status), nunca toca lançamento — mesma regra
    // do webhook. Período máximo de 2 dias por chamada, limite real da API Sicoob.) ----------------
    if (action === "movimentacao_sync") {
      const dataInicial: string = payload.data_inicial;
      const dataFinal: string = payload.data_final;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicial || "") || !/^\d{4}-\d{2}-\d{2}$/.test(dataFinal || "")) {
        return json({ error: "data_inicial e data_final (YYYY-MM-DD) são obrigatórias" }, 400);
      }

      let token: string;
      try {
        token = await getSicoobToken("boletos_consulta");
      } catch (e) {
        return json({ error: String((e as Error).message || e) }, 502);
      }
      // @ts-ignore unstable API
      const client = Deno.createHttpClient({ cert: SICOOB_CERT, key: SICOOB_KEY });
      const authHeaders = { "Authorization": `Bearer ${token}`, "client_id": SICOOB_CLIENT_ID, "Content-Type": "application/json", "Accept": "application/json" };

      // 5 = Liquidação (só o que interessa pra preencher valor_pago/data_pagamento).
      const solicitarRes = await fetch("https://api.sicoob.com.br/cobranca-bancaria/v3/boletos/movimentacoes", {
        method: "POST",
        client,
        headers: authHeaders,
        body: JSON.stringify({ numeroCliente: NUMERO_CLIENTE, tipoMovimento: 5, dataInicial, dataFinal }),
      });
      const solicitarData = await solicitarRes.json().catch(() => ({}));
      if (!solicitarRes.ok) return json({ error: extractSicoobError(solicitarData, solicitarRes.status) }, 502);
      const codigoSolicitacao = solicitarData?.resultado?.codigoSolicitacao;
      if (!codigoSolicitacao) return json({ error: "Sicoob não retornou código da solicitação" }, 502);

      // Processamento é assíncrono do lado do Sicoob — poll com espera curta dentro do mesmo
      // request (docs não informam SLA; desiste depois de ~24s pra não estourar o timeout da
      // function e devolve status "processando" pro caller tentar de novo mais tarde).
      let idArquivos: number[] = [];
      let processado = false;
      for (let tentativa = 0; tentativa < 8; tentativa++) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusUrl = `https://api.sicoob.com.br/cobranca-bancaria/v3/boletos/movimentacoes?numeroCliente=${NUMERO_CLIENTE}&codigoSolicitacao=${codigoSolicitacao}`;
        const statusRes = await fetch(statusUrl, { method: "GET", client, headers: authHeaders });
        if (statusRes.status === 204) {
          processado = true; // processado, sem movimentação nenhuma no período
          break;
        }
        if (statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({}));
          if (Array.isArray(statusData?.resultado?.idArquivos) && statusData.resultado.idArquivos.length) {
            idArquivos = statusData.resultado.idArquivos;
            processado = true;
            break;
          }
        }
        // status != 200/204 com corpo de arquivos ainda = segue tentando.
      }
      if (!processado) {
        return json({ status: "processando", codigo_solicitacao: codigoSolicitacao, message: "Sicoob ainda processando — tente de novo em instantes com este código." });
      }
      if (!idArquivos.length) {
        return json({ status: "ok", registros_encontrados: 0, atualizados: 0, nao_reconhecidos: 0 });
      }

      // Schema exato do arquivo decodificado não é documentado publicamente (só "JSON" é citado
      // na prosa) — tenta várias chaves plausíveis por campo em vez de travar num nome só, e
      // conta como "não reconhecido" (sem gravar nada) qualquer registro que não bata em nenhuma.
      // Segurança por design: na dúvida, não escreve — nunca grava valor/data errados.
      let registrosEncontrados = 0;
      let atualizados = 0;
      let naoReconhecidos = 0;
      const amostraNaoReconhecida: unknown[] = [];

      for (const idArquivo of idArquivos) {
        const downloadUrl = `https://api.sicoob.com.br/cobranca-bancaria/v3/boletos/movimentacoes/download?numeroCliente=${NUMERO_CLIENTE}&codigoSolicitacao=${codigoSolicitacao}&idArquivo=${idArquivo}`;
        const downloadRes = await fetch(downloadUrl, { method: "GET", client, headers: authHeaders });
        if (!downloadRes.ok) continue;
        const downloadData = await downloadRes.json().catch(() => ({}));
        const b64: string | undefined = downloadData?.resultado?.arquivo;
        if (!b64) continue;

        let registros: any[] = [];
        try {
          const texto = new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
          const parsed = JSON.parse(texto);
          registros = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.registros) ? parsed.registros : Array.isArray(parsed?.resultado) ? parsed.resultado : []);
        } catch {
          continue; // arquivo não é JSON puro (ex. zip) — precisa de ajuste depois de ver um caso real
        }

        for (const r of registros) {
          registrosEncontrados++;
          const dados = r?.dados ?? r; // pode vir plano ou aninhado em "dados", igual ao webhook
          const nn = Number(dados?.nossoNumero);
          const valorPago = dados?.valorPagamento ?? dados?.valorLiquidacao ?? dados?.valorRecebido ?? dados?.valor;
          const dataPagRaw = dados?.dataHoraSituacaoBaixa ?? dados?.dataLiquidacao ?? dados?.dataPagamento ?? dados?.dataMovimento;
          if (!nn || valorPago == null || !dataPagRaw) {
            naoReconhecidos++;
            if (amostraNaoReconhecida.length < 3) amostraNaoReconhecida.push(r);
            continue;
          }
          const { data: updRows, error } = await supabase
            .from("boleto_controls")
            .update({
              status: "PAGO",
              valor_pago: Number(valorPago),
              data_pagamento: String(dataPagRaw).slice(0, 10),
              origem_baixa: "movimentacao_lote",
              sicoob_response: dados,
            })
            .eq("company_id", COMPANY_ID)
            .eq("nosso_numero", nn)
            .select("id");
          if (!error && updRows && updRows.length) atualizados++;
        }
      }

      return json({
        status: "ok",
        registros_encontrados: registrosEncontrados,
        atualizados,
        nao_reconhecidos: naoReconhecidos,
        amostra_nao_reconhecida: naoReconhecidos > 0 ? amostraNaoReconhecida : undefined,
      });
    }

    return json({ error: "action inválido" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
