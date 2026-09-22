// Motor de Classificação Fiscal: dado um NCM (ou descrição de produto), devolve
// NCM validado, CEST candidato(s), cClassTrib/CST-IBS/CBS sugerido, CSOSN (se
// Simples/MEI) e CFOP de referência.
//
// Como decide o cClassTrib (a parte não óbvia): não existe tabela oficial que
// ligue NCM -> cClassTrib direto. As ~164 hipóteses da reforma são definidas por
// artigo de lei, e ~19 delas remetem a Anexos da LC 214/2025 que listam os NCMs
// beneficiados (cesta básica, saúde, dispositivos médicos, insumos agropecuários
// etc. — ver `lc214_anexos_produtos` + `resolve_cclasstrib_by_ncm`). Se o NCM bate
// em exatamente um desses anexos, a sugestão é de alta confiança (é a lei, não
// palpite). Se bate em mais de um (ex.: arroz é cesta básica E insumo
// agropecuário, dependendo do uso), devolve os candidatos — quem decide é o
// humano, com o contexto real do produto. Se não bate em nenhum, a sugestão é o
// código padrão "000001 - Tributação integral", que é a regra geral da reforma.
//
// Busca por descrição livre (sem NCM), v1 — não funcionou: pedia pro Gemini
// escolher ENTRE os candidatos da busca textual (trigram). Descoberta na hora
// de testar: descrição oficial do NCM é hierárquica — o termo genérico
// ("peixe", "filé") só aparece no nível do capítulo/posição, não no código de
// 8 dígitos que classifica de fato ("Bagre americano" não menciona peixe).
// Mesmo concatenando com os ancestrais (ver refresh_ncm_descricao_hierarquica),
// nome comercial/marca ("Filé Pescueiro Premium") não tem palavra em comum
// com a nomenclatura oficial — os candidatos viravam ruído e o Gemini
// corretamente devolvia null pra tudo.
//
// v2 (atual): não restringe mais o Gemini aos candidatos textuais. Ele PROPÕE
// o código usando o próprio conhecimento de nomenclatura (reconhece que
// "Pescueiro" é peixe, por ex.), e a gente VALIDA o código proposto contra a
// tabela oficial (validar_ncm_leaf_batch) antes de aceitar — nunca grava um
// código que não exista na tabela do Siscomex, mesmo vindo da IA. Sem
// GEMINI_API_KEY configurada, cai pro comportamento antigo (candidatos
// textuais fracos, humano decide).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-latest";

interface NcmCandidato {
  codigo: string;
  descricao: string;
  score: number;
}

/** Pede pro Gemini PROPOR o código NCM usando o próprio conhecimento (não
 *  restrito a candidatos de busca textual). Só retorna a proposta bruta —
 *  quem chama tem que validar contra `validar_ncm_leaf_batch` antes de
 *  aceitar, já que o Gemini pode propor um código que não existe. */
async function proporNcmComGemini(
  descricao: string,
  candidatosFracos: NcmCandidato[],
  contexto: { segmento_atuacao?: string; setor_atuacao?: string },
): Promise<{ codigo: string; justificativa: string } | null> {
  if (!GEMINI_API_KEY) {
    console.log("[gemini] GEMINI_API_KEY não configurada — pulando IA");
    return null;
  }

  const segmento = contexto.segmento_atuacao || contexto.setor_atuacao;
  const pistas = candidatosFracos.length
    ? `\nPistas de uma busca textual (podem não ser relevantes, use com cautela): ${candidatosFracos.map((c) => `${c.codigo} - ${c.descricao}`).join(" | ")}`
    : "";
  const prompt = `Você é especialista em classificação fiscal NCM (Nomenclatura Comum do Mercosul/Sistema
Harmonizado) e conhece produtos e marcas comuns no comércio brasileiro.
Proponha o código NCM de 8 dígitos que melhor classifica o produto abaixo (nome comercial dado pelo
cliente, que pode ser uma marca ou nome popular — ex.: "Pescueiro" é peixe), usando seu próprio
conhecimento. Se não tiver confiança nenhuma, devolva ncm_proposto null.
${segmento ? `Contexto: o cliente atua no segmento "${segmento}".` : ""}

Produto (nome comercial): "${descricao}"${pistas}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                ncm_proposto: { type: "string", nullable: true },
                justificativa: { type: "string" },
              },
              required: ["ncm_proposto", "justificativa"],
            },
          },
        }),
      },
    );
    if (!res.ok) {
      console.log(`[gemini] falhou: HTTP ${res.status} — ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      console.log(`[gemini] sem texto na resposta: ${JSON.stringify(data).slice(0, 500)}`);
      return null;
    }
    const parsed = JSON.parse(texto) as { ncm_proposto: string | null; justificativa: string };
    if (!parsed.ncm_proposto) return null;
    return { codigo: parsed.ncm_proposto, justificativa: parsed.justificativa };
  } catch (err) {
    console.log(`[gemini] deu excecao: ${(err as Error).message}`);
    return null;
  }
}

const CFOP_REFERENCIA = {
  codigo: "5102",
  descricao: "Venda de mercadoria adquirida ou recebida de terceiros (dentro do estado)",
  aviso:
    "CFOP é atributo da operação (venda interna, interestadual, devolução...), não do produto. " +
    "Este é só um valor de referência para o caso mais comum — confirme o CFOP real na emissão da nota.",
};

function normalizar(txt: string): string {
  return txt.trim().toLowerCase().replace(/\s+/g, " ");
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

  try {
    const body = await req.json().catch(() => ({}));
    const ncmInformado: string | undefined = body.ncm?.trim();
    const descricao: string | undefined = body.descricao?.trim();
    const contactId: string | undefined = body.contact_id;
    const gravar: boolean = body.gravar !== false;

    if (!ncmInformado && !descricao) {
      return new Response(
        JSON.stringify({ error: "informe 'ncm' ou 'descricao'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: companyId } = await supabase.rpc("get_user_company_id", {
      _user_id: userData.user.id,
    });

    let contexto: Record<string, unknown> = {};
    if (contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("tax_regime, setor_atuacao, segmento_atuacao, state")
        .eq("id", contactId)
        .maybeSingle();
      if (contact) contexto = contact;
    }

    const avisos: string[] = [];

    // ---- 1. Resolve NCM ----
    let ncm: { codigo: string; descricao: string } | null = null;
    let ncmCandidatos: Array<{ codigo: string; descricao: string; score: number }> = [];
    let fonteAcervo: Record<string, unknown> | null = null;
    let ncmFonteIa: string | null = null;

    if (ncmInformado) {
      const { data: rows } = await supabase.rpc("find_ncm_exact", { p_ncm: ncmInformado });
      const match = rows?.[0];
      if (match) {
        ncm = { codigo: match.codigo, descricao: match.descricao };
        if (match.data_fim) avisos.push(`NCM ${match.codigo} tem vigência encerrada em ${match.data_fim}.`);
      } else {
        avisos.push(`NCM "${ncmInformado}" não encontrado na base oficial (Siscomex). Verifique o código.`);
      }
    } else if (descricao) {
      const descNorm = normalizar(descricao);
      if (companyId) {
        const { data: acervo } = await supabase.rpc("search_acervo_by_text", {
          p_company_id: companyId,
          p_query: descNorm,
          p_limit: 1,
        });
        if (acervo?.length && acervo[0].score > 0.5) {
          fonteAcervo = acervo[0];
          ncm = { codigo: acervo[0].ncm, descricao: "" };
        }
      }
      if (!ncm) {
        const { data: candidatos } = await supabase.rpc("search_ncm_by_text", {
          p_query: descNorm,
          p_limit: 8,
        });
        ncmCandidatos = candidatos ?? [];

        const proposta = await proporNcmComGemini(descricao, ncmCandidatos, contexto);
        let ncmValidado: { codigo: string; descricao: string } | null = null;
        if (proposta) {
          const { data: validados } = await supabase.rpc("validar_ncm_leaf_batch", {
            p_ncms: [proposta.codigo],
          });
          const validado = (validados as Array<{ codigo: string; descricao: string }> | null)?.[0];
          if (validado) ncmValidado = { codigo: validado.codigo, descricao: validado.descricao };
          else console.log(`[gemini] proposta "${proposta.codigo}" não existe na tabela oficial — descartada`);
        }
        if (ncmValidado) {
          ncm = ncmValidado;
          ncmFonteIa = proposta!.justificativa;
          avisos.push(`NCM sugerido por IA (Gemini) a partir da descrição — confira antes de confirmar: ${proposta!.justificativa}`);
        } else {
          avisos.push(
            "NCM sugerido por descrição ainda é baixa confiança (busca textual, não entende sinônimo/marca). " +
              "Revise os candidatos ou informe o NCM diretamente.",
          );
        }
      }
    }

    if (!ncm) {
      return new Response(
        JSON.stringify({ ncm: null, ncm_candidatos: ncmCandidatos, avisos, contexto }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- 2. Se veio do acervo, devolve direto (já confirmado antes) ----
    if (fonteAcervo) {
      let classificationId: string | null = null;
      if (gravar) {
        const { data: inserted } = await supabase
          .from("fiscal_product_classifications")
          .insert({
            company_id: companyId,
            source_contact_id: contactId ?? null,
            descricao_produto: descricao ?? ncmInformado,
            descricao_normalizada: normalizar(descricao ?? ncmInformado ?? ""),
            ncm: fonteAcervo.ncm,
            cest: fonteAcervo.cest,
            cclasstrib: fonteAcervo.cclasstrib,
            cst_ibs_cbs: fonteAcervo.cst_ibs_cbs,
            csosn: fonteAcervo.csosn,
            cfop_referencia: fonteAcervo.cfop_referencia,
            status: "sugestao_ia",
            base_legal: { fonte: "acervo", acervo_id: fonteAcervo.id },
          })
          .select("id")
          .single();
        classificationId = inserted?.id ?? null;
      }
      return new Response(
        JSON.stringify({ fonte: "acervo", resultado: fonteAcervo, contexto, avisos, classification_id: classificationId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- 3. CEST candidatos (por correlação com NCM) ----
    const { data: cestCandidatos } = await supabase.rpc("find_cest_by_ncm", {
      p_ncm: ncm.codigo,
      p_query: descricao ?? ncm.descricao,
      p_limit: 5,
    });

    // ---- 4. cClassTrib: resolve pelos Anexos da LC 214/2025 (determinístico) ----
    const { data: cclasstribHits } = await supabase.rpc("resolve_cclasstrib_by_ncm", {
      p_ncm: ncm.codigo,
    });

    let cclasstribSugerido: Record<string, unknown> | null = null;
    let cclasstribCandidatos: Array<Record<string, unknown>> = [];
    let baseLegal: Record<string, unknown> = {};

    if (cclasstribHits?.length === 1) {
      const hit = cclasstribHits[0];
      const { data: full } = await supabase
        .from("cclasstrib_codes")
        .select("*")
        .eq("codigo", hit.cclasstrib_codigo)
        .maybeSingle();
      cclasstribSugerido = { ...full, confianca: "alta", fonte: `Anexo ${hit.anexo} da LC 214/2025, item ${hit.item_lei}` };
      baseLegal = { anexo: hit.anexo, item: hit.item_lei, descricao_lei: hit.descricao_lei };
    } else if (cclasstribHits?.length && cclasstribHits.length > 1) {
      cclasstribCandidatos = cclasstribHits;
      avisos.push(
        `Este NCM aparece em ${cclasstribHits.length} hipóteses diferentes da reforma (ex.: mesmo produto pode ser ` +
          `cesta básica ou insumo agropecuário dependendo do uso) — escolha manualmente.`,
      );
    } else {
      const { data: padrao } = await supabase
        .from("cclasstrib_codes")
        .select("*")
        .eq("codigo", "000001")
        .maybeSingle();
      cclasstribSugerido = { ...padrao, confianca: "padrão", fonte: "Nenhuma hipótese especial da reforma encontrada para este NCM — tributação integral (regra geral)." };
    }

    // ---- 5. CSOSN (só se Simples Nacional / MEI) ----
    let csosnSugerido: Array<Record<string, unknown>> = [];
    const regime = contexto.tax_regime as string | undefined;
    if (regime === "simples_nacional" || regime === "mei") {
      const temST = (cestCandidatos ?? []).length > 0;
      const codigosSugeridos = temST ? ["201", "202", "203"] : ["101", "102", "103"];
      const { data: csosnRows } = await supabase
        .from("csosn_codes")
        .select("*")
        .in("codigo", codigosSugeridos);
      csosnSugerido = csosnRows ?? [];
      if (temST) {
        avisos.push("Produto tem CEST associado (possível Substituição Tributária) — CSOSN sugerido considera isso.");
      }
    }

    let classificationId: string | null = null;
    if (gravar) {
      const { data: inserted } = await supabase
        .from("fiscal_product_classifications")
        .insert({
          company_id: companyId,
          source_contact_id: contactId ?? null,
          descricao_produto: descricao ?? ncmInformado,
          descricao_normalizada: normalizar(descricao ?? ncmInformado ?? ""),
          ncm: ncm.codigo,
          cest: cestCandidatos?.length === 1 ? cestCandidatos[0].codigo : null,
          cclasstrib: cclasstribSugerido?.codigo ?? null,
          cst_ibs_cbs: cclasstribSugerido?.cst_vinculado ?? null,
          cfop_referencia: CFOP_REFERENCIA.codigo,
          status: "sugestao_ia",
          base_legal: ncmFonteIa ? { ...baseLegal, ncm_fonte_ia: "gemini", ncm_motivo_ia: ncmFonteIa } : baseLegal,
        })
        .select("id")
        .single();
      classificationId = inserted?.id ?? null;
    }

    const resultado = {
      classification_id: classificationId,
      ncm,
      ncm_via_ia: !!ncmFonteIa,
      cest_candidatos: cestCandidatos ?? [],
      cclasstrib_sugerido: cclasstribSugerido,
      cclasstrib_candidatos: cclasstribCandidatos,
      cst_ibs_cbs: cclasstribSugerido?.cst_vinculado ?? null,
      csosn_sugerido: csosnSugerido,
      cfop_referencia: CFOP_REFERENCIA,
      contexto,
      avisos,
    };

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
