import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { lerRelatorioSitfis } from "../_shared/sitfis-extrair.ts";

// ---------------------------------------------------------------------------
// Situação Fiscal (SITFIS, Serpro Integra Contador) — F4 Onda 3, 30/09/2026. Só leitura.
//
// Ações (sempre UM cliente por vez, por clique):
//   gerar  { contact_id, force? }   SOLICITARPROTOCOLO91 (/Apoiar, não cobrada) → espera o tempo informado → RELATORIOSITFIS92 (/Emitir,
//                                   cobrada em 200 E em 202). Guarda o PDF no bucket privado e lê o resultado (sem pendências / com
//                                   pendências / não lido). Se o relatório ainda estiver em processamento (202), o protocolo fica guardado e
//                                   o próximo clique só repete o /Emitir, sem pedir protocolo novo.
//   link   { id }                   link assinado (10 min) do PDF guardado (sem chamada ao Serpro).
//   reler  { id }                   lê de novo o PDF guardado (sem custo), para quando a regra de leitura melhorar.
//
// Só clientes com status "Ativo". Filial é recusada: o relatório é do CNPJ da matriz. Procuração: 00002 (Situação Fiscal).
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const PROTOCOLO_VALE_MIN = 10; // protocolo guardado mais velho que isto é descartado (pede um novo)
const ESPERA_MIN_MS = 2000;
const ESPERA_MAX_MS = 50_000;
const BUCKET = "serpro-sitfis";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro } = criarSerpro(supabase, COMPANY_ID);

const msgErro = (r: { resposta: any }) => r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro";
const codigo = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.codigo ?? "");

/** "tempoEspera": a documentação diz milissegundos, mas o exemplo dela traz 30. Até 99 lê como segundos; de 100 em diante, milissegundos. */
function esperaMs(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return ESPERA_MIN_MS;
  const ms = n < 100 ? n * 1000 : n;
  return Math.min(Math.max(ms, ESPERA_MIN_MS), ESPERA_MAX_MS);
}

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. O relatório de situação fiscal é da matriz: consulte o CNPJ da matriz." }) };
  return { contato: c, cnpj };
}

/** Texto do PDF guardado. `unpdf` é carregado só aqui: se a biblioteca falhar, o resto da função continua funcionando. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("npm:unpdf@1.8.1");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function lerPdfGuardado(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("PDF não encontrado no armazenamento");
  return lerRelatorioSitfis(await textoDoPdf(new Uint8Array(await data.arrayBuffer())));
}

const camposDaLeitura = (l: ReturnType<typeof lerRelatorioSitfis>) => ({
  resultado: l.resultado, categorias: l.categorias, confiavel: l.confiavel, avisos: l.avisos,
  certidao_tipo: l.certidao?.tipo ?? null, certidao_emissao: l.certidao?.emissao ?? null, certidao_validade: l.certidao?.validade ?? null,
});

async function gerar(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;

  if (!payload.force) {
    const { data: ja } = await supabase.from("serpro_sitfis").select("gerado_em").eq("contact_id", contactId).eq("status", "pronto").order("gerado_em", { ascending: false }).limit(1).maybeSingle();
    if (ja?.gerado_em && Date.now() - Date.parse(ja.gerado_em) < RECENTE_MIN * 60_000) return json({ ok: true, recente: true, gerado_em: ja.gerado_em });
  }

  // Solicitação em aberto (um /Emitir anterior voltou 202): repete só o /Emitir, sem pedir protocolo novo.
  const { data: aberta } = await supabase.from("serpro_sitfis").select("id,protocolo,solicitado_em").eq("contact_id", contactId).eq("status", "aguardando")
    .not("protocolo", "is", null).order("solicitado_em", { ascending: false }).limit(1).maybeSingle();
  let registroId: string | null = null;
  let protocolo: string | null = null;
  let espera = ESPERA_MIN_MS;
  if (aberta?.protocolo && Date.now() - Date.parse(aberta.solicitado_em) < PROTOCOLO_VALE_MIN * 60_000) {
    registroId = aberta.id; protocolo = aberta.protocolo;
  } else {
    const a = await serpro({
      tipo: "Apoiar", idSistema: "SITFIS", idServico: "SOLICITARPROTOCOLO91", versao: "2.0",
      contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "",
      uid, contactId, origem: "manual",
      finalidade: "Solicitação do protocolo do relatório de situação fiscal acionada por usuário para acompanhamento fiscal do cliente",
    });
    if (a.status === 403) return json({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a Situação Fiscal deste cliente" });
    const d = a.resposta?.dados;
    const prot = pega(d, "protocoloRelatorio");
    espera = esperaMs(pega(d, "tempoEspera"));
    // AV02 (limite de solicitações em processamento) e 503 (AV03) vêm sem protocolo: é só esperar o tempo informado e clicar de novo.
    if (!prot || typeof prot !== "string") {
      const seg = Math.ceil(espera / 1000);
      return json({ ok: false, aguarde: seg, error: `O Serpro pediu para esperar ${seg} segundos antes de gerar este relatório. Clique de novo depois.`, detalhe: codigo(a) || msgErro(a) });
    }
    protocolo = prot;
    const { data: novo, error } = await supabase.from("serpro_sitfis").insert({ company_id: COMPANY_ID, contact_id: contactId, solicitado_por: uid, protocolo, status: "aguardando" }).select("id").maybeSingle();
    if (error || !novo) return json({ ok: false, error: `Protocolo obtido, mas não foi possível gravar: ${error?.message ?? "sem retorno"}` }, 500);
    registroId = novo.id;
    await sleep(espera + 1000); // esperar o prazo informado evita pagar um 202 (cobrado igual ao 200)
  }

  const e = await serpro({
    tipo: "Emitir", idSistema: "SITFIS", idServico: "RELATORIOSITFIS92", versao: "2.0",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ protocoloRelatorio: protocolo }),
    uid, contactId, origem: "manual",
    finalidade: "Emissão do relatório de situação fiscal confirmada por usuário para acompanhamento fiscal do cliente",
  });
  if (e.status === 403) return json({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a Situação Fiscal deste cliente" });
  if (e.status === 202) {
    const seg = Math.ceil(esperaMs(pega(e.resposta?.dados, "tempoEspera")) / 1000);
    return json({ ok: true, processando: true, aguarde: seg, id: registroId });
  }
  if (e.status !== 200) {
    // ER05 = "inicie uma nova solicitação": o protocolo não serve mais.
    if (/ER05/.test(codigo(e))) await supabase.from("serpro_sitfis").update({ status: "erro", protocolo: null }).eq("id", registroId!);
    return json({ ok: false, status: e.status, error: msgErro(e) });
  }

  const b64 = pega(e.resposta?.dados, "pdf");
  const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/sitfis-${registroId}.pdf`, b64);
  if (!path) {
    await supabase.from("serpro_sitfis").update({ status: "erro", protocolo: null, avisos: ["o Serpro devolveu 200 mas o PDF não veio em formato válido"] }).eq("id", registroId!);
    return json({ ok: false, error: "O Serpro respondeu, mas o PDF do relatório não veio em formato válido" }, 502);
  }
  let leitura: Record<string, unknown> = { resultado: "nao_lido", confiavel: false, avisos: ["não consegui ler o PDF: abra o arquivo"], categorias: [] };
  try { leitura = camposDaLeitura(await lerPdfGuardado(path)); } catch (err) { leitura.avisos = [`não consegui ler o PDF: ${(err as Error).message}`]; }
  await supabase.from("serpro_sitfis").update({ status: "pronto", protocolo: null, pdf_path: path, gerado_em: new Date().toISOString(), ...leitura }).eq("id", registroId!);
  return json({ ok: true, id: registroId, resultado: leitura.resultado, confiavel: leitura.confiavel, avisos: leitura.avisos });
}

async function link(payload: any) {
  const { data } = await supabase.from("serpro_sitfis").select("id,contact_id,pdf_path,gerado_em").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "Relatório ainda não disponível" });
  const dia = (data.gerado_em ?? "").slice(0, 10);
  const url = await assinar(supabase, BUCKET, data.pdf_path, `situacao-fiscal-${dia}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

async function reler(payload: any) {
  const { data } = await supabase.from("serpro_sitfis").select("id,pdf_path").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "Relatório ainda não disponível" });
  try {
    const leitura = camposDaLeitura(await lerPdfGuardado(data.pdf_path));
    await supabase.from("serpro_sitfis").update(leitura).eq("id", data.id);
    return json({ ok: true, resultado: leitura.resultado, confiavel: leitura.confiavel, avisos: leitura.avisos });
  } catch (e) {
    return json({ ok: false, error: `Não consegui ler o PDF: ${(e as Error).message}` });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "gerar": return await gerar(payload, uid);
    case "link": return await link(payload);
    case "reler": return await reler(payload);
    default: return json({ error: "action inválida (gerar | link | reler)" }, 400);
  }
});
