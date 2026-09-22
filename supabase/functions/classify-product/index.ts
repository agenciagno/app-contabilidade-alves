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
// Busca por descrição livre (sem NCM) ainda é fraca — trigram não entende que
// "Coca-Cola" é um "refrigerante". Funciona (retorna candidatos rankeados), mas
// com aviso de baixa confiança até integrar um LLM restrito à base oficial.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
        avisos.push(
          "NCM sugerido por descrição ainda é baixa confiança (busca textual, não entende sinônimo/marca). " +
            "Revise os candidatos ou informe o NCM diretamente.",
        );
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
          base_legal: baseLegal,
        })
        .select("id")
        .single();
      classificationId = inserted?.id ?? null;
    }

    const resultado = {
      classification_id: classificationId,
      ncm,
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
