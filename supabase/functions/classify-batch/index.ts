// Upload em lote: classifica uma planilha inteira de produtos de uma vez.
// Mesma lógica de resolução do classify-product (NCM -> CEST -> cClassTrib via
// Anexos da LC 214/2025 -> CSOSN), repetida aqui em vez de importada de um
// módulo compartilhado — de propósito, pra não arriscar quebrar o
// classify-product (já testado e em uso) ao refatorar os dois juntos.
//
// Itens ambíguos (mais de um CEST ou cClassTrib candidato) não são decididos
// sozinhos: a planilha de saída marca "AMBÍGUO — revisar" com os candidatos
// listados, e o item entra no acervo como sugestão (não confirmado) — quem
// resolve é a equipe, na tela de Consulta ou direto na planilha.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CFOP_REFERENCIA_CODIGO = "5102";
const MAX_ITENS = 3000;

function normalizar(txt: string): string {
  return txt.trim().toLowerCase().replace(/\s+/g, " ");
}

interface ItemEntrada {
  descricao?: string;
  ncm?: string;
  linha_original: Record<string, unknown>;
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
        created_by: userData.user.id,
        status: "processando",
        total_itens: itens.length,
        contexto: contact ?? {},
      })
      .select("id")
      .single();
    if (batchErr) throw batchErr;
    const batchId = batch.id as string;

    const linhasResultado: Array<Record<string, unknown>> = [];
    const registrosParaGravar: Array<Record<string, unknown>> = [];
    let confirmaveis = 0;

    for (const item of itens) {
      const descricao = item.descricao?.trim();
      const ncmInformado = item.ncm?.trim();
      const linha: Record<string, unknown> = { ...item.linha_original };

      if (!descricao && !ncmInformado) {
        linha["Classificação — status"] = "sem descrição/NCM na linha";
        linhasResultado.push(linha);
        continue;
      }

      // ---- 1. Resolve NCM ----
      let ncm: { codigo: string; descricao: string } | null = null;
      let fonteAcervo: Record<string, unknown> | null = null;

      if (ncmInformado) {
        const { data: rows } = await supabase.rpc("find_ncm_exact", { p_ncm: ncmInformado });
        const match = rows?.[0];
        if (match) ncm = { codigo: match.codigo, descricao: match.descricao };
      } else if (descricao && companyId) {
        const descNorm = normalizar(descricao);
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

      if (!ncm && descricao) {
        const { data: candidatos } = await supabase.rpc("search_ncm_by_text", {
          p_query: normalizar(descricao),
          p_limit: 3,
        });
        linha["Classificação — status"] = "NCM não identificado com confiança";
        linha["Classificação — candidatos NCM"] = (candidatos ?? [])
          .map((c: { codigo: string; descricao: string }) => `${c.codigo} — ${c.descricao}`)
          .join(" | ");
        linhasResultado.push(linha);
        continue;
      }
      if (!ncm) {
        linha["Classificação — status"] = `NCM "${ncmInformado}" não encontrado na base oficial`;
        linhasResultado.push(linha);
        continue;
      }

      if (fonteAcervo) {
        linha["Classificação — status"] = "reaproveitado do acervo";
        linha["NCM sugerido"] = fonteAcervo.ncm;
        linha["CEST sugerido"] = fonteAcervo.cest;
        linha["cClassTrib sugerido"] = fonteAcervo.cclasstrib;
        linha["CST-IBS/CBS"] = fonteAcervo.cst_ibs_cbs;
        linha["CSOSN sugerido"] = fonteAcervo.csosn;
        linha["CFOP referência"] = fonteAcervo.cfop_referencia;
        linhasResultado.push(linha);
        registrosParaGravar.push({
          company_id: companyId,
          batch_id: batchId,
          source_contact_id: contactId,
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
        });
        confirmaveis += 1;
        continue;
      }

      // ---- 2. CEST ----
      const { data: cestCandidatos } = await supabase.rpc("find_cest_by_ncm", {
        p_ncm: ncm.codigo,
        p_query: descricao ?? ncm.descricao,
        p_limit: 5,
      });

      // ---- 3. cClassTrib (Anexos da LC 214/2025) ----
      const { data: cclasstribHits } = await supabase.rpc("resolve_cclasstrib_by_ncm", {
        p_ncm: ncm.codigo,
      });

      let cclasstribCodigo: string | null = null;
      let cclasstribNome = "";
      let cstFinal: string | null = null;
      let baseLegal: Record<string, unknown> = {};
      let ambiguo = false;

      if (cclasstribHits?.length === 1) {
        const hit = cclasstribHits[0];
        cclasstribCodigo = hit.cclasstrib_codigo;
        cclasstribNome = hit.cclasstrib_nome;
        baseLegal = { anexo: hit.anexo, item: hit.item_lei };
        const { data: full } = await supabase
          .from("cclasstrib_codes")
          .select("cst_vinculado")
          .eq("codigo", hit.cclasstrib_codigo)
          .maybeSingle();
        cstFinal = full?.cst_vinculado ?? null;
      } else if (cclasstribHits?.length && cclasstribHits.length > 1) {
        ambiguo = true;
        cclasstribNome = cclasstribHits
          .map((h: { cclasstrib_codigo: string; cclasstrib_nome: string }) => `${h.cclasstrib_codigo} — ${h.cclasstrib_nome}`)
          .join(" | ");
      } else {
        const { data: padrao } = await supabase
          .from("cclasstrib_codes")
          .select("codigo, nome, cst_vinculado")
          .eq("codigo", "000001")
          .maybeSingle();
        cclasstribCodigo = padrao?.codigo ?? "000001";
        cclasstribNome = padrao?.nome ?? "Tributação integral";
        cstFinal = padrao?.cst_vinculado ?? "000";
      }

      // ---- 4. CSOSN ----
      let csosnSugerido: string | null = null;
      if (regime === "simples_nacional" || regime === "mei") {
        const temST = (cestCandidatos ?? []).length > 0;
        csosnSugerido = temST ? "201" : "101";
      }

      const cestAmbiguo = (cestCandidatos ?? []).length > 1;
      const cestUnico = (cestCandidatos ?? []).length === 1 ? cestCandidatos[0].codigo : null;
      const cestTexto = cestAmbiguo
        ? (cestCandidatos ?? []).map((c: { codigo: string; descricao: string }) => `${c.codigo} — ${c.descricao}`).join(" | ")
        : cestUnico ?? "(sem CEST — não sujeito a ST)";

      linha["Classificação — status"] = ambiguo || cestAmbiguo ? "AMBÍGUO — revisar" : "ok";
      linha["NCM sugerido"] = ncm.codigo;
      linha["CEST sugerido"] = cestTexto;
      linha["cClassTrib sugerido"] = ambiguo ? cclasstribNome : `${cclasstribCodigo} — ${cclasstribNome}`;
      linha["CST-IBS/CBS"] = cstFinal ?? "";
      linha["CSOSN sugerido"] = csosnSugerido ?? "";
      linha["CFOP referência"] = `${CFOP_REFERENCIA_CODIGO} (referência — confirmar na emissão)`;
      linhasResultado.push(linha);

      if (!ambiguo && !cestAmbiguo) {
        registrosParaGravar.push({
          company_id: companyId,
          batch_id: batchId,
          source_contact_id: contactId,
          descricao_produto: descricao ?? ncm.codigo,
          descricao_normalizada: normalizar(descricao ?? ncm.codigo),
          ncm: ncm.codigo,
          cest: cestUnico,
          cclasstrib: cclasstribCodigo,
          cst_ibs_cbs: cstFinal,
          csosn: csosnSugerido,
          cfop_referencia: CFOP_REFERENCIA_CODIGO,
          status: "sugestao_ia",
          base_legal: baseLegal,
        });
        confirmaveis += 1;
      }
    }

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
