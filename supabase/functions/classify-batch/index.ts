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
// Gemini (22/09/2026, v1 — não funcionou): a primeira versão pedia pro Gemini
// escolher ENTRE os candidatos da busca textual (trigram). Descoberta na hora
// de testar: descrição oficial do NCM é hierárquica — o termo genérico
// ("peixe", "filé") só aparece no nível do capítulo/posição, não no código
// de 8 dígitos que classifica de fato ("Bagre americano" não menciona peixe).
// v2: Gemini PROPÕE o código usando o próprio conhecimento, e a gente VALIDA
// contra a tabela oficial (validar_ncm_leaf_batch) antes de aceitar.
//
// Mapeamento de campos/colunas (23/09/2026): a planilha do cliente já vem com
// colunas reservadas pra NCM/CEST/CFOP etc — em vez de sempre criar colunas
// novas, cada campo pode ser mapeado pra uma coluna já existente
// (mapeamento_saida). Nem sempre o cliente quer processar todos os 6 campos
// (campos). Modo "conferir" não sobrescreve o valor original — só compara e
// sinaliza divergência (precisa de mapeamento pra todo campo selecionado,
// senão não tem o que comparar). CNAE do cliente (mais preciso que
// segmento_atuacao/setor_atuacao — já testado com caso real: segmento dizia
// "pecuária" pra um cliente cujo CNAE é "Criação de peixes em água doce") e
// pistas extras da própria planilha (categoria, marca, unidade) entram no
// prompt do Gemini quando disponíveis.
//
// Rate limit do Gemini (23/09/2026): lote real de 268 itens voltou "0
// resolvidos" — causa raiz não era mais o problema de nomenclatura hierárquica
// (já resolvido), era a chave estar no tier gratuito (5 requisições/minuto) e
// o código mandar até 4 chunks em paralelo: todo chunk voltava 429
// RESOURCE_EXHAUSTED ou 503 UNAVAILABLE, nenhuma proposta era aceita. Fix:
// chamadas ao Gemini agora são sequenciais (nunca em paralelo) com espera
// mínima entre elas pra respeitar 5 RPM, e com retry/backoff em 429/503 (lendo
// o retryDelay que a própria API sugere) antes de desistir do chunk.
//
// Cota DIÁRIA (23/09/2026, mesmo dia): o retry acima causou um problema pior —
// a mensagem de erro do Gemini revelou que o tier gratuito também tem uma cota
// de só 20 requisições/DIA (não é só 5/minuto). Ficar tentando de novo com
// espera de até 59s por tentativa, várias vezes, fez a função ultrapassar o
// tempo de execução permitido (erro 504/546 — timeout de infraestrutura, pior
// que simplesmente falhar rápido). Fix: quando o erro 429 é especificamente de
// cota diária (não de cota por minuto), não faz sentido esperar e tentar de
// novo — a cota só reseta no dia seguinte. Desiste imediatamente desse chunk
// E de todos os chunks restantes (circuit breaker), devolvendo o lote com o
// que já foi resolvido em vez de travar a função até dar timeout.
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
// Tier gratuito do Gemini = 5 requisições/minuto. Chunk maior => menos
// requisições no total; intervalo com margem de segurança sobre 60s/5=12s;
// SEM concorrência — chamadas em paralelo é o que causava o 429 em massa.
const GEMINI_TAMANHO_CHUNK = 80;
const GEMINI_INTERVALO_MS = 13_000;
const GEMINI_MAX_TENTATIVAS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A própria API do Gemini devolve o tempo de espera sugerido em erro 429
 *  (ex.: "retryDelay": "32s") — usa isso quando disponível, senão backoff fixo. */
function extrairRetryDelayMs(corpoErro: string): number | null {
  const match = corpoErro.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  return match ? Number(match[1]) * 1000 + 1000 : null;
}

/** 429 de cota DIÁRIA (quotaId contém "PerDay") não vale retry — só reseta no
 *  dia seguinte, e ficar esperando/tentando de novo é o que causou o timeout
 *  de infraestrutura (504/546). */
function eCotaDiariaEsgotada(corpoErro: string): boolean {
  return /PerDay/i.test(corpoErro);
}

type CampoKey = "ncm" | "cest" | "cclasstrib" | "cst" | "csosn" | "cfop";
const TODOS_CAMPOS: CampoKey[] = ["ncm", "cest", "cclasstrib", "cst", "csosn", "cfop"];
const NOME_COLUNA_PADRAO: Record<CampoKey, string> = {
  ncm: "NCM sugerido",
  cest: "CEST sugerido",
  cclasstrib: "cClassTrib sugerido",
  cst: "CST-IBS/CBS",
  csosn: "CSOSN sugerido",
  cfop: "CFOP referência",
};

function normalizar(txt: string): string {
  return txt.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normaliza pra comparação de códigos (modo conferência) — remove pontuação,
 *  maiúsculas, pra "2202.10.00" e "22021000" baterem. */
function compararCodigos(existente: unknown, calculado: unknown): boolean {
  const norm = (v: unknown) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const a = norm(existente);
  const b = norm(calculado);
  if (!a || !b) return false;
  return a === b;
}

interface CandidatoNcm {
  codigo: string;
  descricao: string;
}

interface PistasItem {
  categoria?: string;
  marca?: string;
  unidade?: string;
}

interface ItemParaGemini {
  idx: number;
  descricao: string;
  candidatosFracos: CandidatoNcm[];
  pistas?: PistasItem;
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
  contexto: { segmento_atuacao?: string; setor_atuacao?: string; cnae_descricao?: string },
  itens: ItemParaGemini[],
): Promise<PropostaGemini[]> {
  const propostas: PropostaGemini[] = [];
  if (!GEMINI_API_KEY) {
    console.log("[gemini] GEMINI_API_KEY não configurada — pulando IA");
    return propostas;
  }
  if (!itens.length) return propostas;
  console.log(`[gemini] ${itens.length} itens pra IA propor NCM`);

  const contextoPartes: string[] = [];
  if (contexto.cnae_descricao) contextoPartes.push(`atividade principal (CNAE): "${contexto.cnae_descricao}"`);
  const segmento = contexto.segmento_atuacao || contexto.setor_atuacao;
  if (segmento) contextoPartes.push(`segmento cadastrado: "${segmento}"`);
  const linhaContexto = contextoPartes.length ? `Contexto do cliente: ${contextoPartes.join("; ")}.` : "";

  const chunks: ItemParaGemini[][] = [];
  for (let i = 0; i < itens.length; i += GEMINI_TAMANHO_CHUNK) {
    chunks.push(itens.slice(i, i + GEMINI_TAMANHO_CHUNK));
  }

  function formatarItem(it: ItemParaGemini): string {
    const extras = [
      it.pistas?.categoria && `categoria: ${it.pistas.categoria}`,
      it.pistas?.marca && `marca: ${it.pistas.marca}`,
      it.pistas?.unidade && `unidade: ${it.pistas.unidade}`,
      it.candidatosFracos.length
        ? `pistas textuais: ${it.candidatosFracos.map((c) => `${c.codigo} - ${c.descricao}`).join(" | ")}`
        : null,
    ].filter(Boolean).join(", ");
    return `${it.idx}. "${it.descricao}"${extras ? ` (${extras})` : ""}`;
  }

  /** Devolve true se a cota DIÁRIA esgotou — sinal pra quem chama parar de
   *  tentar chunks seguintes (retry não ajuda, só atrasa até dar timeout). */
  async function processarChunk(chunk: ItemParaGemini[]): Promise<{ cotaDiariaEsgotada: boolean }> {
    const prompt = `Você é especialista em classificação fiscal NCM (Nomenclatura Comum do Mercosul/Sistema
Harmonizado) e conhece produtos e marcas comuns no comércio brasileiro.
Para cada produto abaixo (nome comercial dado pelo cliente), proponha o código NCM de 8 dígitos que
melhor classifica o produto, usando seu próprio conhecimento. Se não tiver confiança nenhuma, devolva
ncm_proposto null pra esse item.
${linhaContexto}

Produtos:
${chunk.map(formatarItem).join("\n")}`;

    for (let tentativa = 1; tentativa <= GEMINI_MAX_TENTATIVAS; tentativa++) {
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
          const corpoErro = await res.text();
          if (res.status === 429 && eCotaDiariaEsgotada(corpoErro)) {
            console.log(`[gemini] cota DIÁRIA esgotada — parando de tentar (só reseta no dia seguinte): ${corpoErro}`);
            return { cotaDiariaEsgotada: true };
          }
          if ((res.status === 429 || res.status === 503) && tentativa < GEMINI_MAX_TENTATIVAS) {
            // Cap no tempo de espera — a função tem orçamento de execução
            // limitado; esperar o retryDelay integral (podia passar de 1 min)
            // foi o que causou o timeout de infraestrutura (504/546).
            const espera = Math.min(extrairRetryDelayMs(corpoErro) ?? tentativa * 8_000, 15_000);
            console.log(`[gemini] chunk HTTP ${res.status} (tentativa ${tentativa}/${GEMINI_MAX_TENTATIVAS}) — aguardando ${espera}ms e tentando de novo`);
            await sleep(espera);
            continue;
          }
          console.log(`[gemini] chunk falhou definitivamente: HTTP ${res.status} — ${corpoErro}`);
          return { cotaDiariaEsgotada: false };
        }
        const data = await res.json();
        const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!texto) {
          console.log(`[gemini] chunk sem texto na resposta: ${JSON.stringify(data).slice(0, 500)}`);
          return { cotaDiariaEsgotada: false };
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
        return { cotaDiariaEsgotada: false };
      } catch (err) {
        console.log(`[gemini] chunk deu excecao: ${(err as Error).message}`);
        return { cotaDiariaEsgotada: false };
      }
    }
    return { cotaDiariaEsgotada: false };
  }

  // Sequencial, nunca em paralelo — tier gratuito só permite 5 req/min, e
  // rodar em paralelo foi exatamente o que causou o "0 resolvidos" em
  // produção (todo chunk batendo 429 de uma vez). Espera entre chunks pra
  // ficar com margem sobre o limite. Para na hora se a cota diária esgotar.
  for (let i = 0; i < chunks.length; i++) {
    const { cotaDiariaEsgotada } = await processarChunk(chunks[i]);
    if (cotaDiariaEsgotada) break;
    if (i < chunks.length - 1) await sleep(GEMINI_INTERVALO_MS);
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
    const camposArr: CampoKey[] = Array.isArray(body.campos) && body.campos.length ? body.campos : TODOS_CAMPOS;
    const camposSet = new Set(camposArr);
    const mapeamentoSaida: Partial<Record<CampoKey, string>> = body.mapeamento_saida ?? {};
    const mapeamentoPistas: PistasItem = body.mapeamento_pistas ?? {};
    const modo: "classificar" | "conferir" = body.modo === "conferir" ? "conferir" : "classificar";

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
    if (modo === "conferir") {
      const semMapeamento = camposArr.filter((c) => !mapeamentoSaida[c]);
      if (semMapeamento.length) {
        return new Response(
          JSON.stringify({
            error: `Modo conferência exige uma coluna mapeada pra cada campo selecionado — faltou: ${semMapeamento.join(", ")}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { data: companyId } = await supabase.rpc("get_user_company_id", {
      _user_id: userData.user.id,
    });

    const { data: contact } = await supabase
      .from("contacts")
      .select("name, tax_regime, setor_atuacao, segmento_atuacao, state, cnae_principal")
      .eq("id", contactId)
      .maybeSingle();
    const regime = contact?.tax_regime as string | undefined;
    const cnaeDescricao = (contact?.cnae_principal as { descricao?: string } | null)?.descricao;

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

    // Se só CFOP foi selecionado, pula toda a resolução de NCM/CEST/cClassTrib/
    // CSOSN — CFOP é sempre o mesmo valor de referência, não depende de nada.
    const soCfop = camposSet.size === 1 && camposSet.has("cfop");

    // Estado por item, indexado pela posição original na planilha.
    interface EstadoItem {
      descricao?: string;
      ncmInformado?: string;
      ncmResolvido?: { codigo: string; descricao: string };
      fonteAcervoId?: string;
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

    let cestPorIdx = new Map<number, Array<{ query_idx: number; codigo: string; descricao: string }>>();
    let cclasstribPorIdx = new Map<
      number,
      Array<{ query_idx: number; cclasstrib_codigo: string; cclasstrib_nome: string; anexo: string; item_lei: string }>
    >();
    let cclasstribInfoPorCodigo = new Map<string, { codigo: string; nome: string | null; cst_vinculado: string | null }>();
    let padraoRow: { codigo: string; nome: string | null; cst_vinculado: string | null } | undefined;

    if (!soCfop) {
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
      // Não é mais um atalho visível — só dá a fonte do NCM, que entra no
      // mesmo pipeline de CEST/cClassTrib da FASE 4 junto com todo mundo
      // (evita herdar CEST/cClassTrib desatualizado, e não expõe "acervo"
      // na planilha de saída).
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
        const idxComAcervoHit: number[] = [];
        const ncmsAcervoHit: string[] = [];
        const acervoIdPorOrigIdx = new Map<number, string>();
        idxSoDescricao.forEach((origIdx, pos) => {
          const hit = porIdx.get(pos + 1)?.[0] as { score: number; ncm: string; id: string } & Record<string, unknown> | undefined;
          if (hit && hit.score > 0.5) {
            idxComAcervoHit.push(origIdx);
            ncmsAcervoHit.push(hit.ncm);
            acervoIdPorOrigIdx.set(origIdx, hit.id);
          }
        });
        if (ncmsAcervoHit.length) {
          const { data: validados } = await supabase.rpc("find_ncm_exact_batch", { p_ncms: ncmsAcervoHit });
          const validadosPorIdx = agruparPorIdx(validados as Array<{ query_idx: number; codigo: string; descricao: string }>);
          idxComAcervoHit.forEach((origIdx, pos) => {
            const match = validadosPorIdx.get(pos + 1)?.[0];
            if (match) {
              estados[origIdx].ncmResolvido = { codigo: match.codigo, descricao: match.descricao };
              estados[origIdx].fonteAcervoId = acervoIdPorOrigIdx.get(origIdx);
            }
          });
        }
      }

      // ---- FASE 3: candidatos de NCM por descrição, pra quem sobrou (1 chamada) ----
      const idxPrecisaCandidatos: number[] = [];
      const descricoesPrecisaCandidatos: string[] = [];
      idxSoDescricao.forEach((origIdx) => {
        if (!estados[origIdx].ncmResolvido) {
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
        pistas: {
          categoria: mapeamentoPistas.categoria
            ? String(itens[origIdx].linha_original[mapeamentoPistas.categoria] ?? "").trim() || undefined
            : undefined,
          marca: mapeamentoPistas.marca
            ? String(itens[origIdx].linha_original[mapeamentoPistas.marca] ?? "").trim() || undefined
            : undefined,
          unidade: mapeamentoPistas.unidade
            ? String(itens[origIdx].linha_original[mapeamentoPistas.unidade] ?? "").trim() || undefined
            : undefined,
        },
      }));
      const propostasGemini = await proporNcmsComGemini(
        { segmento_atuacao: contact?.segmento_atuacao, setor_atuacao: contact?.setor_atuacao, cnae_descricao: cnaeDescricao },
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

      if (idxComNcmResolvido.length) {
        const [cestRes, ccRes] = await Promise.all([
          supabase.rpc("find_cest_by_ncm_batch", { p_ncms: ncmsResolvidos, p_queries: queriesCest, p_limit: 5 }),
          supabase.rpc("resolve_cclasstrib_by_ncm_batch", { p_ncms: ncmsResolvidos }),
        ]);
        cestPorIdx = agruparPorIdx(cestRes.data as Array<{ query_idx: number; codigo: string; descricao: string }>);
        cclasstribPorIdx = agruparPorIdx(
          ccRes.data as Array<{ query_idx: number; cclasstrib_codigo: string; cclasstrib_nome: string; anexo: string; item_lei: string }>,
        );
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
      cclasstribInfoPorCodigo = new Map((cclasstribInfoRows ?? []).map((r) => [r.codigo, r]));
      padraoRow = cclasstribInfoPorCodigo.get("000001");
    }

    /** Escreve (ou compara, em modo conferência) um campo de saída — só se
     *  ele estiver selecionado em `campos`. */
    function escreverCampo(
      linha: Record<string, unknown>,
      linhaOriginal: Record<string, unknown>,
      campo: CampoKey,
      valor: unknown,
      opts?: { ambiguo?: boolean },
    ) {
      if (!camposSet.has(campo)) return;
      const label = NOME_COLUNA_PADRAO[campo];
      if (modo === "conferir") {
        if (opts?.ambiguo) {
          linha[`${label} — conferência`] = `Múltiplos candidatos — revisar manualmente: ${valor}`;
          return;
        }
        const existente = linhaOriginal[mapeamentoSaida[campo]!];
        linha[`${label} — conferência`] = compararCodigos(existente, valor)
          ? "OK"
          : `Divergente — sistema sugere: ${valor}`;
      } else {
        linha[mapeamentoSaida[campo] || label] = valor;
      }
    }

    // ---- Monta as linhas de saída, na ordem original da planilha ----
    const linhasResultado: Array<Record<string, unknown>> = [];
    const registrosParaGravar: Array<Record<string, unknown>> = [];
    let confirmaveis = 0;

    itens.forEach((item, i) => {
      const linha: Record<string, unknown> = { ...item.linha_original };

      if (soCfop) {
        escreverCampo(linha, item.linha_original, "cfop", CFOP_REFERENCIA_CODIGO);
        linhasResultado.push(linha);
        confirmaveis += 1;
        return;
      }

      const e = estados[i];

      if (e.semDescricaoNemNcm) {
        linhasResultado.push(linha);
        return;
      }

      if (e.ncmNaoEncontrado) {
        linhasResultado.push(linha);
        return;
      }

      if (!e.ncmResolvido) {
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

      escreverCampo(linha, item.linha_original, "ncm", e.ncmResolvido.codigo);
      escreverCampo(linha, item.linha_original, "cest", cestTexto, { ambiguo: cestAmbiguo });
      escreverCampo(
        linha,
        item.linha_original,
        "cclasstrib",
        ambiguo ? cclasstribNome : `${cclasstribCodigo} — ${cclasstribNome}`,
        { ambiguo },
      );
      escreverCampo(linha, item.linha_original, "cst", cstFinal ?? "");
      escreverCampo(linha, item.linha_original, "csosn", csosnSugerido ?? "");
      escreverCampo(linha, item.linha_original, "cfop", CFOP_REFERENCIA_CODIGO);
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
          base_legal: {
            ...baseLegal,
            ...(e.motivoIa ? { ncm_fonte_ia: "gemini", ncm_motivo_ia: e.motivoIa } : {}),
            ...(e.fonteAcervoId ? { ncm_fonte_acervo: true, acervo_id: e.fonteAcervoId } : {}),
          },
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
