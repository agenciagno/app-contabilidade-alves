// Upload em lote: classifica uma planilha inteira de produtos de uma vez.
//
// Achado em produção (22/09/2026): a primeira versão fazia de 2 a 4 chamadas
// RPC POR PRODUTO, em sequência. Com 268 produtos reais (nenhum com NCM
// preenchido), isso deu timeout — cada chamada é 1 round-trip de rede/auth
// além do tempo de query. Reescrita pra resolver em FASES, cada fase com uma
// única chamada RPC em lote (funções `*_batch`, com LATERAL JOIN no banco) pra
// todo o lote de uma vez, em vez de N idas ao banco.
//
// Mesma lógica de resolução do classify-product (NCM -> CEST -> cClassTrib via
// Anexos da LC 214/2025 -> CSOSN) — duplicada aqui de propósito, não importada
// de um módulo compartilhado, pra não arriscar quebrar o classify-product
// (já testado e em uso) ao refatorar os dois juntos.
//
// Itens ambíguos (mais de um CEST ou cClassTrib candidato) não são decididos
// sozinhos: a planilha de saída marca "AMBÍGUO — revisar" com os candidatos
// listados, e o item não entra no acervo — quem resolve é a equipe.
//
// Gemini (22/09/2026, v1 — não funcionou): a primeira versão pedia pro Gemini
// escolher ENTRE os candidatos da busca textual (trigram). Descoberta na hora
// de testar: descrição oficial do NCM é hierárquica — o termo genérico
// ("peixe", "filé") só aparece no nível do capítulo/posição, não no código
// de 8 dígitos que classifica de fato ("Bagre americano" não menciona peixe).
// Mesmo concatenando a descrição com todos os ancestrais (ver
// refresh_ncm_descricao_hierarquica), a busca textual pura não supera nomes
// comerciais/de marca ("Filé Pescueiro Premium" não tem nenhuma palavra em
// comum com a nomenclatura oficial) — os "candidatos" viravam ruído
// (ex.: bateu com "Selos postais" por acaso de trigrama), e o Gemini
// corretamente devolvia null pra tudo.
//
// v2 (atual): não restringe mais o Gemini aos candidatos da busca textual.
// Ele PROPÕE o código NCM usando o próprio conhecimento de nomenclatura
// brasileira/Mercosul (reconhece que "Pescueiro" é peixe, por ex.), e a gente
// VALIDA o código proposto contra a tabela oficial (validar_ncm_leaf_batch)
// antes de aceitar — nunca grava um código que não exista na tabela do
// Siscomex, mesmo vindo da IA. Os candidatos da busca textual (FASE 3) ainda
// vão no prompt como pista opcional, não como restrição.
// Pra não reintroduzir o problema de N chamadas sequenciais que causou o
// timeout original, o lote inteiro vai em poucas chamadas ao Gemini (chunks
// de ~40 itens, com concorrência limitada), não uma por item. Sem
// GEMINI_API_KEY configurada, esses itens caem no comportamento antigo (vão
// pra revisão manual com os candidatos textuais, se houver).
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CFOP_REFERENCIA_CODIGO = "5102";
const MAX_ITENS = 3000;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TAMANHO_CHUNK = 40;
const GEMINI_CONCORRENCIA = 4;

function normalizar(txt: string): string {
  return txt.trim().toLowerCase().replace(/\s+/g, " ");
}

interface CandidatoNcm {
  codigo: string;
  descricao: string;
}

interface ItemParaGemini {
  idx: number;
  descricao: string;
  candidatosFracos: CandidatoNcm[];
}

interface PropostaGemini {
  idx: number;
  ncmProposto: string;
  justificativa: string;
}

/** Pede pro Gemini PROPOR o código NCM usando o próprio conhecimento de
 *  nomenclatura (não restrito a candidatos de busca textual — ver comentário
 *  no topo do arquivo sobre por que isso não funcionava). O código proposto
 *  ainda não é confiável por si só: quem chama isso tem que validar contra
 *  `validar_ncm_leaf_batch` antes de aceitar. */
async function proporNcmsComGemini(
  contexto: { segmento_atuacao?: string; setor_atuacao?: string },
  itens: ItemParaGemini[],
): Promise<PropostaGemini[]> {
  const propostas: PropostaGemini[] = [];
  if (!GEMINI_API_KEY) {
    console.log("[gemini] GEMINI_API_KEY não configurada — pulando IA");
    return propostas;
  }
  if (!itens.length) return propostas;
  console.log(`[gemini] ${itens.length} itens pra IA propor NCM`);

  const segmento = contexto.segmento_atuacao || contexto.setor_atuacao;
  const chunks: ItemParaGemini[][] = [];
  for (let i = 0; i < itens.length; i += GEMINI_TAMANHO_CHUNK) {
    chunks.push(itens.slice(i, i + GEMINI_TAMANHO_CHUNK));
  }

  async function processarChunk(chunk: ItemParaGemini[]) {
    const prompt = `Você é especialista em classificação fiscal NCM (Nomenclatura Comum do Mercosul/Sistema
Harmonizado) e conhece produtos e marcas comuns no comércio brasileiro.
Para cada produto abaixo (nome comercial dado pelo cliente, que pode ser uma marca ou nome
popular — ex.: "Pescueiro" é peixe), proponha o código NCM de 8 dígitos que melhor classifica o
produto, usando seu próprio conhecimento. Se não tiver confiança nenhuma, devolva ncm_proposto null.
Pistas de uma busca textual (podem não ser relevantes, use com cautela): quando existirem, aparecem
entre parênteses após o produto.
${segmento ? `Contexto: o cliente atua no segmento "${segmento}".` : ""}

Produtos:
${chunk.map((it) => {
      const pistas = it.candidatosFracos.length
        ? ` (pistas textuais: ${it.candidatosFracos.map((c) => `${c.codigo} - ${c.descricao}`).join(" | ")})`
        : "";
      return `${it.idx}. "${it.descricao}"${pistas}`;
    }).join("\n")}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY! },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  resultados: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        idx: { type: "integer" },
                        ncm_proposto: { type: "string", nullable: true },
                        justificativa: { type: "string" },
                      },
                      required: ["idx", "ncm_proposto", "justificativa"],
                    },
                  },
                },
                required: ["resultados"],
              },
            },
          }),
        },
      );
      if (!res.ok) {
        console.log(`[gemini] chunk falhou: HTTP ${res.status} — ${await res.text()}`);
        return;
      }
      const data = await res.json();
      const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) {
        console.log(`[gemini] chunk sem texto na resposta: ${JSON.stringify(data).slice(0, 500)}`);
        return;
      }
      const parsed = JSON.parse(texto) as {
        resultados: Array<{ idx: number; ncm_proposto: string | null; justificativa: string }>;
      };
      let propostasNoChunk = 0;
      for (const r of parsed.resultados ?? []) {
        if (!r.ncm_proposto) continue;
        propostas.push({ idx: r.idx, ncmProposto: r.ncm_proposto, justificativa: r.justificativa });
        propostasNoChunk += 1;
      }
      console.log(`[gemini] chunk de ${chunk.length} itens — ${propostasNoChunk} propostas (a validar)`);
    } catch (err) {
      console.log(`[gemini] chunk deu excecao: ${(err as Error).message}`);
    }
  }

  for (let i = 0; i < chunks.length; i += GEMINI_CONCORRENCIA) {
    await Promise.all(chunks.slice(i, i + GEMINI_CONCORRENCIA).map(processarChunk));
  }
  return propostas;
}

interface ItemEntrada {
  descricao?: string;
  ncm?: string;
  linha_original: Record<string, unknown>;
}

/** Agrupa linhas de uma função `*_batch` (todas têm query_idx 1-based) por índice. */
function agruparPorIdx<T extends { query_idx: number }>(rows: T[] | null): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const r of rows ?? []) {
    const arr = map.get(r.query_idx) ?? [];
    arr.push(r);
    map.set(r.query_idx, arr);
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response(JSON.stringify({ error: "não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // created_by referencia profiles(id), que é diferente de auth.users.id —
  // profiles tem seu próprio id e um user_id separado apontando pro auth.users.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  try {
    const body = await req.json().catch(() => ({}));
    const contactId: string | undefined = body.contact_id;
    const itens: ItemEntrada[] = Array.isArray(body.itens) ? body.itens : [];

    if (!contactId) {
      return new Response(JSON.stringify({ error: "informe 'contact_id'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!itens.length) {
      return new Response(JSON.stringify({ error: "lote vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (itens.length > MAX_ITENS) {
      return new Response(
        JSON.stringify({ error: `lote com ${itens.length} itens excede o limite de ${MAX_ITENS} por upload` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: companyId } = await supabase.rpc("get_user_company_id", {
      _user_id: userData.user.id,
    });

    const { data: contact } = await supabase
      .from("contacts")
      .select("name, tax_regime, setor_atuacao, segmento_atuacao, state")
      .eq("id", contactId)
      .maybeSingle();
    const regime = contact?.tax_regime as string | undefined;

    const { data: batch, error: batchErr } = await supabase
      .from("fiscal_classification_batches")
      .insert({
        company_id: companyId,
        contact_id: contactId,
        created_by: perfil?.id ?? null,
        status: "processando",
        total_itens: itens.length,
        contexto: contact ?? {},
      })
      .select("id")
      .single();
    if (batchErr) throw batchErr;
    const batchId = batch.id as string;

    // Estado por item, indexado pela posição original na planilha.
    interface EstadoItem {
      descricao?: string;
      ncmInformado?: string;
      ncmResolvido?: { codigo: string; descricao: string };
      fonteAcervo?: Record<string, unknown>;
      ncmCandidatos?: Array<{ codigo: string; descricao: string }>;
      semDescricaoNemNcm?: boolean;
      ncmNaoEncontrado?: boolean;
      motivoIa?: string;
    }
    const estados: EstadoItem[] = itens.map((item) => {
      const descricao = item.descricao?.trim() || undefined;
      const ncmInformado = item.ncm?.trim() || undefined;
      return { descricao, ncmInformado, semDescricaoNemNcm: !descricao && !ncmInformado };
    });

    // ---- FASE 1: valida os NCMs já informados (1 chamada pro lote todo) ----
    const idxComNcm: number[] = [];
    const ncmsInformados: string[] = [];
    estados.forEach((e, i) => {
      if (e.ncmInformado) {
        idxComNcm.push(i);
        ncmsInformados.push(e.ncmInformado);
      }
    });
    if (ncmsInformados.length) {
      const { data: rows } = await supabase.rpc("find_ncm_exact_batch", { p_ncms: ncmsInformados });
      const porIdx = agruparPorIdx(rows as Array<{ query_idx: number; codigo: string; descricao: string }>);
      idxComNcm.forEach((origIdx, pos) => {
        const match = porIdx.get(pos + 1)?.[0];
        if (match) estados[origIdx].ncmResolvido = { codigo: match.codigo, descricao: match.descricao };
        else estados[origIdx].ncmNaoEncontrado = true;
      });
    }

    // ---- FASE 2: acervo, pra quem só tem descrição (1 chamada pro lote todo) ----
    const idxSoDescricao: number[] = [];
    const descricoesSoDescricao: string[] = [];
    estados.forEach((e, i) => {
      if (!e.ncmInformado && e.descricao) {
        idxSoDescricao.push(i);
        descricoesSoDescricao.push(normalizar(e.descricao));
      }
    });
    if (idxSoDescricao.length && companyId) {
      const { data: rows } = await supabase.rpc("search_acervo_by_text_batch", {
        p_company_id: companyId,
        p_queries: descricoesSoDescricao,
        p_limit: 1,
      });
      const porIdx = agruparPorIdx(rows as Array<{ query_idx: number } & Record<string, unknown>>);
      idxSoDescricao.forEach((origIdx, pos) => {
        const hit = porIdx.get(pos + 1)?.[0] as { score: number } & Record<string, unknown> | undefined;
        if (hit && hit.score > 0.5) estados[origIdx].fonteAcervo = hit;
      });
    }

    // ---- FASE 3: candidatos de NCM por descrição, pra quem sobrou (1 chamada) ----
    const idxPrecisaCandidatos: number[] = [];
    const descricoesPrecisaCandidatos: string[] = [];
    idxSoDescricao.forEach((origIdx) => {
      if (!estados[origIdx].fonteAcervo) {
        idxPrecisaCandidatos.push(origIdx);
        descricoesPrecisaCandidatos.push(normalizar(estados[origIdx].descricao!));
      }
    });
    if (idxPrecisaCandidatos.length) {
      const { data: rows } = await supabase.rpc("search_ncm_by_text_batch", {
        p_queries: descricoesPrecisaCandidatos,
        p_limit: 3,
      });
      const porIdx = agruparPorIdx(rows as Array<{ query_idx: number; codigo: string; descricao: string }>);
      idxPrecisaCandidatos.forEach((origIdx, pos) => {
        estados[origIdx].ncmCandidatos = (porIdx.get(pos + 1) ?? []).map((c) => ({
          codigo: c.codigo,
          descricao: c.descricao,
        }));
      });
    }

    // ---- FASE 3.5: Gemini propõe o NCM (conhecimento próprio) e a gente valida contra a tabela oficial ----
    const itensParaGemini: ItemParaGemini[] = idxPrecisaCandidatos.map((origIdx) => ({
      idx: origIdx,
      descricao: estados[origIdx].descricao!,
      candidatosFracos: estados[origIdx].ncmCandidatos ?? [],
    }));
    const propostasGemini = await proporNcmsComGemini(
      { segmento_atuacao: contact?.segmento_atuacao, setor_atuacao: contact?.setor_atuacao },
      itensParaGemini,
    );
    if (propostasGemini.length) {
      const { data: validados } = await supabase.rpc("validar_ncm_leaf_batch", {
        p_ncms: propostasGemini.map((p) => p.ncmProposto),
      });
      const validadosPorPos = new Map(
        (validados as Array<{ query_idx: number; codigo: string; descricao: string }>).map((v) => [v.query_idx, v]),
      );
      let aceitos = 0;
      propostasGemini.forEach((p, pos) => {
        const validado = validadosPorPos.get(pos + 1);
        if (!validado) return;
        estados[p.idx].ncmResolvido = { codigo: validado.codigo, descricao: validado.descricao };
        estados[p.idx].motivoIa = p.justificativa;
        aceitos += 1;
      });
      console.log(`[gemini] ${propostasGemini.length} propostas, ${aceitos} validadas contra a tabela oficial`);
    }

    // ---- FASE 4: CEST + cClassTrib pra quem tem NCM resolvido (2 chamadas) ----
    const idxComNcmResolvido: number[] = [];
    const ncmsResolvidos: string[] = [];
    const queriesCest: string[] = [];
    estados.forEach((e, i) => {
      if (e.ncmResolvido) {
        idxComNcmResolvido.push(i);
        ncmsResolvidos.push(e.ncmResolvido.codigo);
        queriesCest.push(e.descricao ?? e.ncmResolvido.descricao);
      }
    });

    type CestHit = { query_idx: number; codigo: string; descricao: string };
    type CclasstribHit = {
      query_idx: number; cclasstrib_codigo: string; cclasstrib_nome: string; anexo: string; item_lei: string;
    };
    let cestPorIdx = new Map<number, CestHit[]>();
    let cclasstribPorIdx = new Map<number, CclasstribHit[]>();
    if (idxComNcmResolvido.length) {
      const [cestRes, ccRes] = await Promise.all([
        supabase.rpc("find_cest_by_ncm_batch", { p_ncms: ncmsResolvidos, p_queries: queriesCest, p_limit: 5 }),
        supabase.rpc("resolve_cclasstrib_by_ncm_batch", { p_ncms: ncmsResolvidos }),
      ]);
      cestPorIdx = agruparPorIdx(cestRes.data as CestHit[]);
      cclasstribPorIdx = agruparPorIdx(ccRes.data as CclasstribHit[]);
    }

    // cClassTrib padrão + CST de todas as hipóteses especiais com exatamente 1
    // hit — busca única em lote, feita aqui pra não precisar de mais uma
    // chamada sequencial por item dentro do loop de montagem abaixo.
    const codigosEspeciaisComHitUnico = Array.from(
      new Set(
        Array.from(cclasstribPorIdx.values())
          .filter((hits) => hits.length === 1)
          .map((hits) => hits[0].cclasstrib_codigo),
      ),
    );
    const { data: cclasstribInfoRows } = await supabase
      .from("cclasstrib_codes")
      .select("codigo, nome, cst_vinculado")
      .in("codigo", [...codigosEspeciaisComHitUnico, "000001"]);
    const cclasstribInfoPorCodigo = new Map((cclasstribInfoRows ?? []).map((r) => [r.codigo, r]));
    const padraoRow = cclasstribInfoPorCodigo.get("000001");

    // ---- Monta as linhas de saída, na ordem original da planilha ----
    const linhasResultado: Array<Record<string, unknown>> = [];
    const registrosParaGravar: Array<Record<string, unknown>> = [];
    let confirmaveis = 0;

    itens.forEach((item, i) => {
      const e = estados[i];
      const linha: Record<string, unknown> = { ...item.linha_original };

      if (e.semDescricaoNemNcm) {
        linha["Classificação — status"] = "sem descrição/NCM na linha";
        linhasResultado.push(linha);
        return;
      }

      if (e.fonteAcervo) {
        const fa = e.fonteAcervo;
        linha["Classificação — status"] = "reaproveitado do acervo";
        linha["NCM sugerido"] = fa.ncm;
        linha["CEST sugerido"] = fa.cest;
        linha["cClassTrib sugerido"] = fa.cclasstrib;
        linha["CST-IBS/CBS"] = fa.cst_ibs_cbs;
        linha["CSOSN sugerido"] = fa.csosn;
        linha["CFOP referência"] = fa.cfop_referencia;
        linhasResultado.push(linha);
        registrosParaGravar.push({
          company_id: companyId,
          batch_id: batchId,
          source_contact_id: contactId,
          descricao_produto: e.descricao ?? e.ncmInformado,
          descricao_normalizada: normalizar(e.descricao ?? e.ncmInformado ?? ""),
          ncm: fa.ncm,
          cest: fa.cest,
          cclasstrib: fa.cclasstrib,
          cst_ibs_cbs: fa.cst_ibs_cbs,
          csosn: fa.csosn,
          cfop_referencia: fa.cfop_referencia,
          status: "sugestao_ia",
          base_legal: { fonte: "acervo", acervo_id: fa.id },
        });
        confirmaveis += 1;
        return;
      }

      if (e.ncmNaoEncontrado) {
        linha["Classificação — status"] = `NCM "${e.ncmInformado}" não encontrado na base oficial`;
        linhasResultado.push(linha);
        return;
      }

      if (!e.ncmResolvido) {
        linha["Classificação — status"] = GEMINI_API_KEY
          ? "NCM não identificado com confiança (IA consultada, sem proposta válida)"
          : "NCM não identificado com confiança";
        linha["Classificação — candidatos NCM"] = (e.ncmCandidatos ?? [])
          .map((c) => `${c.codigo} — ${c.descricao}`)
          .join(" | ");
        linhasResultado.push(linha);
        return;
      }

      // NCM resolvido (informado ou validado) — CEST + cClassTrib.
      const cestCandidatos = cestPorIdx.get(i) ?? [];
      const cclasstribHits = cclasstribPorIdx.get(i) ?? [];

      let cclasstribCodigo: string | null = null;
      let cclasstribNome = "";
      let cstFinal: string | null = null;
      let baseLegal: Record<string, unknown> = {};
      let ambiguo = false;

      if (cclasstribHits.length === 1) {
        const hit = cclasstribHits[0];
        const info = cclasstribInfoPorCodigo.get(hit.cclasstrib_codigo);
        cclasstribCodigo = hit.cclasstrib_codigo;
        cclasstribNome = hit.cclasstrib_nome;
        cstFinal = info?.cst_vinculado ?? null;
        baseLegal = { anexo: hit.anexo, item: hit.item_lei };
      } else if (cclasstribHits.length > 1) {
        ambiguo = true;
        cclasstribNome = cclasstribHits.map((h) => `${h.cclasstrib_codigo} — ${h.cclasstrib_nome}`).join(" | ");
      } else {
        cclasstribCodigo = padraoRow?.codigo ?? "000001";
        cclasstribNome = padraoRow?.nome ?? "Tributação integral";
        cstFinal = padraoRow?.cst_vinculado ?? "000";
      }

      const cestAmbiguo = cestCandidatos.length > 1;
      const cestUnico = cestCandidatos.length === 1 ? cestCandidatos[0].codigo : null;
      const cestTexto = cestAmbiguo
        ? cestCandidatos.map((c) => `${c.codigo} — ${c.descricao}`).join(" | ")
        : cestUnico ?? "(sem CEST — não sujeito a ST)";

      let csosnSugerido: string | null = null;
      if (regime === "simples_nacional" || regime === "mei") {
        csosnSugerido = cestCandidatos.length > 0 ? "201" : "101";
      }

      linha["Classificação — status"] = ambiguo || cestAmbiguo
        ? "AMBÍGUO — revisar"
        : e.motivoIa ? "sugerido por IA (Gemini) — confirmar" : "ok";
      linha["NCM sugerido"] = e.ncmResolvido.codigo;
      linha["CEST sugerido"] = cestTexto;
      linha["cClassTrib sugerido"] = ambiguo ? cclasstribNome : `${cclasstribCodigo} — ${cclasstribNome}`;
      linha["CST-IBS/CBS"] = cstFinal ?? "";
      linha["CSOSN sugerido"] = csosnSugerido ?? "";
      linha["CFOP referência"] = `${CFOP_REFERENCIA_CODIGO} (referência — confirmar na emissão)`;
      if (e.motivoIa) linha["Classificação — IA (motivo)"] = e.motivoIa;
      linhasResultado.push(linha);

      if (!ambiguo && !cestAmbiguo) {
        registrosParaGravar.push({
          company_id: companyId,
          batch_id: batchId,
          source_contact_id: contactId,
          descricao_produto: e.descricao ?? e.ncmResolvido.codigo,
          descricao_normalizada: normalizar(e.descricao ?? e.ncmResolvido.codigo),
          ncm: e.ncmResolvido.codigo,
          cest: cestUnico,
          cclasstrib: cclasstribCodigo,
          cst_ibs_cbs: cstFinal,
          csosn: csosnSugerido,
          cfop_referencia: CFOP_REFERENCIA_CODIGO,
          status: "sugestao_ia",
          base_legal: e.motivoIa ? { ...baseLegal, ncm_fonte_ia: "gemini", ncm_motivo_ia: e.motivoIa } : baseLegal,
        });
        confirmaveis += 1;
      }
    });

    if (registrosParaGravar.length) {
      const TAMANHO_LOTE = 500;
      for (let i = 0; i < registrosParaGravar.length; i += TAMANHO_LOTE) {
        await supabase
          .from("fiscal_product_classifications")
          .insert(registrosParaGravar.slice(i, i + TAMANHO_LOTE));
      }
    }

    // ---- Gera a planilha de resultado e salva no Storage ----
    const worksheet = XLSX.utils.json_to_sheet(linhasResultado);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Classificação");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const path = `${companyId}/${batchId}.xlsx`;
    const { error: uploadErr } = await supabase.storage
      .from("fiscal-classifications")
      .upload(path, new Uint8Array(buffer), {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    if (uploadErr) throw uploadErr;

    await supabase
      .from("fiscal_classification_batches")
      .update({
        status: "concluido",
        itens_confirmados: 0,
        arquivo_resultado_path: path,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    return new Response(
      JSON.stringify({
        batch_id: batchId,
        total_itens: itens.length,
        resolvidos_automaticamente: confirmaveis,
        precisam_revisao: itens.length - confirmaveis,
        arquivo_resultado_path: path,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
