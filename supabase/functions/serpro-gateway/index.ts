import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits, type Tipo } from "../_shared/serpro-core.ts";

// ---------------------------------------------------------------------------
// Gateway único do Serpro Integra Contador (F4, Onda 0 — 29/09/2026).
//
// Ferramenta de administração com allowlist: as telas do Dashboard Federal chamam funções próprias (serpro-pgdasd, serpro-pagamentos...),
// que usam o mesmo núcleo. O navegador (nem o do cliente, no futuro portal) nunca
// chama o Serpro. Responsabilidades: autenticar, montar o body, aplicar allowlist, registrar
// TODA chamada em serpro_call_log (contrato Serpro cl. 3.1.5.2: acessos, finalidade e base legal)
// e nunca reenviar sozinho depois de 504 (a Receita pode ter concluído — doc "timeout").
//
// SERPRO_MODE = "trial" (padrão): endpoint de demonstração com dados simulados, sem credencial.
// SERPRO_MODE = "producao": mTLS com e-CNPJ do contratante + Consumer Key/Secret + Autentica
//   Procurador (procurações estão no CNPJ do autor, não no contratante). Validado em produção em 30/09/2026.
//
// Ações: "health" (config, sem segredo) e "chamar".
// Escrita na Receita ("Declarar") está BLOQUEADA nesta versão (fase final, dupla checagem humana).
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";

// Autenticação (mTLS + Autentica Procurador), chamada, tempo limite e registro em serpro_call_log vêm do núcleo _shared/serpro-core.ts.
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { MODE, BASE_URL, CONTRATANTE_NI, AUTOR_NI, serpro } = criarSerpro(supabase, COMPANY_ID);

// Allowlist = escopo aprovado em 29/09/2026 (relatório serpro-integra-contador-oportunidades-set2026, seção 10).
// "Declarar" está listado só pra ser recusado com mensagem clara.
const CATALOGO: Record<string, Tipo> = {};
function reg(sistema: string, tipo: Tipo, servicos: string[]) {
  for (const s of servicos) CATALOGO[`${sistema}.${s}`] = tipo;
}
reg("PROCURACOES", "Consultar", ["OBTERPROCURACAO41"]);
reg("DTE", "Consultar", ["CONSULTASITUACAODTE111"]);
// MSGDETALHAMENTO62 (ler o corpo da mensagem) NÃO entra aqui de propósito: caracteriza CIÊNCIA da intimação
// (art. 23, § 2º, III, Decreto 70.235/1972) e marca a mensagem como lida. Só a função dedicada da Caixa Postal
// pode chamá-lo, com confirmação individual e registro de quem abriu (decisão de Gabriel, 30/09/2026).
reg("CAIXAPOSTAL", "Consultar", ["MSGCONTRIBUINTE61"]);
reg("CAIXAPOSTAL", "Monitorar", ["INNOVAMSG63"]);
reg("EVENTOSATUALIZACAO", "Monitorar", ["SOLICEVENTOSPJ132", "OBTEREVENTOSPJ134"]);
reg("PAGTOWEB", "Consultar", ["PAGAMENTOS71", "CONTACONSDOCARRPG73"]);
reg("PAGTOWEB", "Emitir", ["COMPARRECADACAO72"]);
reg("PGDASD", "Consultar", ["CONSDECLARACAO13", "CONSULTIMADECREC14", "CONSDECREC15", "CONSEXTRATO16"]);
reg("PGDASD", "Emitir", ["GERARDAS12", "GERARDASCOBRANCA17", "GERARDASPROCESSO18", "GERARDASAVULSO19"]);
reg("REGIMEAPURACAO", "Consultar", ["CONSULTARANOSCALENDARIOS102", "CONSULTAROPCAOREGIME103", "CONSULTARRESOLUCAO104"]);
reg("DEFIS", "Consultar", ["CONSDECLARACAO142", "CONSULTIMADECREC143", "CONSDECREC144"]);
for (const [sis, n] of [["PARCSN", 16], ["PARCSN-ESP", 17], ["PERTSN", 18], ["RELPSN", 19]] as const) {
  reg(sis, "Emitir", [`GERARDAS${n}1`]);
  reg(sis, "Consultar", [`PARCELASPARAGERAR${n}2`, `PEDIDOSPARC${n}3`, `OBTERPARC${n}4`, `DETPAGTOPARC${n}5`]);
}
reg("SITFIS", "Apoiar", ["SOLICITARPROTOCOLO91"]);
reg("SITFIS", "Emitir", ["RELATORIOSITFIS92"]);
reg("SICALC", "Emitir", ["CONSOLIDARGERARDARF51", "GERARDARFCODBARRA53"]);
reg("SICALC", "Apoiar", ["CONSULTAAPOIORECEITAS52"]);
reg("EPROCESSO", "Consultar", ["CONSPROCPORINTER271"]);
reg("DCTFWEB", "Consultar", ["CONSRECIBO32", "CONSDECCOMPLETA33", "CONSXMLDECLARACAO38"]);
reg("DCTFWEB", "Emitir", ["GERARGUIA31", "GERARGUIAANDAMENTO313"]);
reg("MIT", "Apoiar", ["SITUACAOENC315"]);
reg("MIT", "Consultar", ["CONSAPURACAO316", "LISTAAPURACOES317"]);
reg("PNRCONTADOR", "Consultar", ["CONSVINCULOS261", "CONSRENUNCIA263", "SITSOLICRENUNCIA265"]);
reg("PNRCONTADOR", "Emitir", ["COMPRENUNCIA264"]);
// Escrita na Receita — bloqueada
reg("PGDASD", "Declarar", ["TRANSDECLARACAO11"]);
reg("DEFIS", "Declarar", ["TRANSDECLARACAO141"]);
reg("REGIMEAPURACAO", "Declarar", ["EFETUAROPCAOREGIME101"]);
reg("DCTFWEB", "Declarar", ["TRANSDECLARACAO310"]);
reg("MIT", "Declarar", ["ENCAPURACAO314"]);
reg("PNRCONTADOR", "Declarar", ["SOLICRENUNCIA262"]);

// Finalidade padrão (a base legal padrão, LGPD art. 7º, II e V, é a do núcleo) — o chamador pode detalhar, nunca omitir.
const FINALIDADE_PADRAO = "Prestação de serviços contábeis e fiscais ao cliente (obrigações acessórias e principais junto à Receita Federal)";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Só admin do escritório (ou super admin) chama o gateway. verify_jwt garante token válido; aqui checamos o papel.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: profile } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const autorizado = profile?.is_super_admin === true || (profile?.role === "admin" && profile?.company_id === COMPANY_ID);
  if (!autorizado) return json({ error: "Sem permissão" }, 403);

  const payload = await req.json().catch(() => ({}));
  const action: string = payload.action;

  if (action === "health") {
    return json({
      modo: MODE,
      base_url: BASE_URL,
      contratante: CONTRATANTE_NI,
      autor: AUTOR_NI,
      usa_autentica_procurador: AUTOR_NI !== CONTRATANTE_NI,
      segredos_producao: {
        cert: !!Deno.env.get("SERPRO_CERT"),
        key: !!Deno.env.get("SERPRO_KEY"),
        consumer_key: !!Deno.env.get("SERPRO_CONSUMER_KEY"),
        consumer_secret: !!Deno.env.get("SERPRO_CONSUMER_SECRET"),
        termo_autorizacao: !!Deno.env.get("SERPRO_TERMO_ASSINADO_B64"),
      },
      servicos_liberados: Object.entries(CATALOGO).filter(([, t]) => t !== "Declarar").length,
    });
  }

  if (action !== "chamar") return json({ error: "action inválida (use 'health' ou 'chamar')" }, 400);

  const idSistema = String(payload.idSistema ?? "").toUpperCase();
  const idServico = String(payload.idServico ?? "").toUpperCase();
  const tipo = CATALOGO[`${idSistema}.${idServico}`];
  if (!tipo) return json({ error: `Serviço fora do escopo aprovado: ${idSistema}.${idServico}` }, 400);
  if (tipo === "Declarar") {
    return json({ error: "Escrita na Receita (Declarar) está desativada nesta versão. Fase final, com dupla checagem humana." }, 403);
  }

  const contribuinteNi = onlyDigits(payload.contribuinte?.numero);
  const contribuinteTipo = Number(payload.contribuinte?.tipo ?? (contribuinteNi.length === 11 ? 1 : 2));
  if (![11, 14].includes(contribuinteNi.length) && !payload.contribuinte?.lista) {
    return json({ error: "contribuinte.numero inválido (CPF 11 ou CNPJ 14 dígitos)" }, 400);
  }

  // Só cliente com status "Ativo" gera chamada em produção (decisão de Gabriel, 01/10/2026): cliente suspenso por falta de
  // pagamento ("Suspensa - Contabilidade"), ex-cliente, baixado etc. é recusado. Os CNPJs da própria CA e números que não
  // são cliente cadastrado passam. O status é lido do cadastro a cada chamada.
  if (MODE === "producao" && contribuinteNi && contribuinteNi !== CONTRATANTE_NI && contribuinteNi !== AUTOR_NI) {
    const formatado = contribuinteNi.length === 14
      ? contribuinteNi.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : contribuinteNi.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    const cid = /^[0-9a-f-]{36}$/i.test(String(payload.contact_id ?? "")) ? String(payload.contact_id) : null;
    const { data: cadastro } = await supabase.from("contacts").select("status_cliente")
      .eq("company_id", COMPANY_ID).or(`document.eq.${contribuinteNi},document.eq.${formatado}${cid ? `,id.eq.${cid}` : ""}`);
    if (cadastro?.length && !cadastro.some((c: { status_cliente: string | null }) => c.status_cliente === "Ativo")) {
      return json({
        error: `Cliente fora do monitoramento (status: ${cadastro[0].status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "Ativo".`,
        fora_do_monitoramento: true,
      }, 403);
    }
  }

  const dados = typeof payload.dados === "string" ? payload.dados : payload.dados == null ? "" : JSON.stringify(payload.dados);
  const r = await serpro({
    tipo, idSistema, idServico, contribuinte: { numero: contribuinteNi, tipo: contribuinteTipo }, dados,
    uid, contactId: payload.contact_id ?? null, origem: payload.origem ?? "manual",
    finalidade: payload.finalidade ?? FINALIDADE_PADRAO, baseLegal: payload.base_legal,
    versao: String(payload.versaoSistema ?? "1.0"),
    // No trial os números reais não importam (dados simulados); permite usar os números do manual.
    trialContratante: payload.trial_contratante ? onlyDigits(payload.trial_contratante) : undefined,
    trialAutor: payload.trial_autor ? onlyDigits(payload.trial_autor) : undefined,
  });

  // Sempre HTTP 200 aqui: o status do Serpro vai dentro do corpo (supabase.functions.invoke esconde o corpo de respostas não-2xx).
  return json({ status: r.status, tipo, ambiente: MODE, cobravel: r.cobravel, resposta: r.resposta });
});
