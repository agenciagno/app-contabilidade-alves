import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { perfilAtivo } from "../_shared/acesso.ts";

const ALLOWED_ORIGINS = ["https://app.contabilidadealves.com.br"];
function corsFor(origin: string | null) {
  const ok = !!origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.sandbox\.lovable\.dev$/.test(origin)
  );
  return {
    "Access-Control-Allow-Origin": ok ? (origin as string) : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  const corsHeaders = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const COFRE_SECRET_KEY = Deno.env.get("COFRE_SECRET_KEY");
    if (!COFRE_SECRET_KEY) return json({ success: false, error: "COFRE_SECRET_KEY não configurada." }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Não autorizado." }, 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return json({ success: false, error: "Usuário não autenticado." }, 401);

    const { data: profile } = await perfilAtivo(authHeader, user.id, "id, role, is_super_admin, company_id, allowed_modules");
    if (!profile) return json({ success: false, error: "Perfil não encontrado." }, 403);

    const hasCadastroModule = Array.isArray(profile.allowed_modules) && profile.allowed_modules.includes("cadastro");
    if (!profile.is_super_admin && profile.role !== "admin" && !hasCadastroModule) {
      return json({ success: false, error: "Você não tem permissão para gerenciar certificados." }, 403);
    }

    const body = await req.json();
    const {
      certificate_id,
      renovar_de_id,
      contact_id,
      partner_id,
      tipo_pessoa,
      modelo,
      autoridade_certificadora,
      data_emissao,
      data_validade,
      observacao,
      senha,
      anexo_url,
      anexo_file_name,
      anexo_size,
    } = body;

    // Update parcial: só grava o que o front realmente mandou nesta chamada.
    // A tela faz 2 chamadas em sequência ao anexar arquivo (salva o registro,
    // sobe o storage, salva de novo só com os campos do anexo) — sem essa
    // checagem, a 2ª chamada (que não manda autoridade/emissão/observação)
    // apagava esses campos, e uma edição sem trocar o arquivo apagava o
    // anexo_url existente (achado 28/08/2026, Gabriel: certificado vencido
    // ficava sem conseguir baixar o comprovante depois de editado).
    const isUpdate = !!certificate_id && !renovar_de_id;
    const incluiu = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    if (!isUpdate) {
      if (!contact_id) return json({ success: false, error: "contact_id é obrigatório." }, 400);
      if (!data_validade) return json({ success: false, error: "data_validade é obrigatória." }, 400);
      if (!["PF", "PJ"].includes(tipo_pessoa)) return json({ success: false, error: "tipo_pessoa inválido." }, 400);
      if (!["A1", "A3"].includes(modelo)) return json({ success: false, error: "modelo inválido." }, 400);
      if (tipo_pessoa === "PF" && !partner_id) return json({ success: false, error: "partner_id é obrigatório para certificado PF." }, 400);
      if (tipo_pessoa === "PJ" && partner_id) return json({ success: false, error: "Certificado PJ não deve ter partner_id." }, 400);
    }

    const contactIdParaChecagem = contact_id ?? null;
    let company_id: string | null = null;
    if (contactIdParaChecagem) {
      const { data: contactData, error: contactError } = await supabaseAdmin
        .from("contacts").select("company_id").eq("id", contactIdParaChecagem).single();
      if (contactError || !contactData) return json({ success: false, error: "Cliente não encontrado." }, 404);
      company_id = contactData.company_id;
      if (company_id !== profile.company_id && !profile.is_super_admin) {
        return json({ success: false, error: "Sem permissão para este cliente." }, 403);
      }
    }

    if (partner_id) {
      const { data: partner, error: partnerError } = await supabaseAdmin
        .from("contact_partners").select("id, contact_id").eq("id", partner_id).single();
      if (partnerError || !partner || (contact_id && partner.contact_id !== contact_id)) {
        return json({ success: false, error: "Sócio não pertence ao cliente informado." }, 400);
      }
    }

    let senha_encrypted: string | undefined;
    if (senha) {
      const { data: encrypted, error: encryptError } = await supabaseAdmin.rpc("cofre_encrypt_internal", {
        p_plaintext: senha,
        p_key: COFRE_SECRET_KEY,
      });
      if (encryptError) return json({ success: false, error: "Falha ao criptografar senha." }, 400);
      senha_encrypted = encrypted;
    }

    // Renovação: fecha o registro antigo e cria um novo linkado — nunca sobrescreve o histórico.
    if (renovar_de_id) {
      const { data: antigo, error: antigoErr } = await supabaseAdmin
        .from("certificates").select("*").eq("id", renovar_de_id).single();
      if (antigoErr || !antigo) return json({ success: false, error: "Certificado a renovar não encontrado." }, 404);
      if (antigo.company_id !== profile.company_id && !profile.is_super_admin) {
        return json({ success: false, error: "Sem permissão para este registro." }, 403);
      }

      const { error: closeErr } = await supabaseAdmin
        .from("certificates").update({ status: "renovado" }).eq("id", renovar_de_id);
      if (closeErr) throw closeErr;

      const payload: Record<string, unknown> = {
        company_id: antigo.company_id,
        contact_id: antigo.contact_id,
        partner_id: antigo.partner_id,
        tipo_pessoa: antigo.tipo_pessoa,
        modelo: modelo ?? antigo.modelo,
        autoridade_certificadora: autoridade_certificadora ?? antigo.autoridade_certificadora,
        data_emissao: data_emissao ?? new Date().toISOString().slice(0, 10),
        data_validade,
        status: "ativo",
        observacao: observacao ?? null,
        anexo_url: anexo_url ?? null,
        anexo_file_name: anexo_file_name ?? null,
        anexo_size: anexo_size ?? null,
        responsavel_renovacao: profile.id,
        renewed_from_id: renovar_de_id,
      };
      if (senha_encrypted !== undefined) payload.senha_encrypted = senha_encrypted;

      const { data, error } = await supabaseAdmin.from("certificates").insert(payload).select().single();
      if (error) throw error;
      return json({ success: true, data });
    }

    if (isUpdate) {
      const payload: Record<string, unknown> = {};
      if (incluiu("contact_id")) payload.contact_id = contact_id;
      if (incluiu("partner_id")) payload.partner_id = partner_id ?? null;
      if (incluiu("tipo_pessoa")) payload.tipo_pessoa = tipo_pessoa;
      if (incluiu("modelo")) payload.modelo = modelo;
      if (incluiu("autoridade_certificadora")) payload.autoridade_certificadora = autoridade_certificadora ?? null;
      if (incluiu("data_emissao")) payload.data_emissao = data_emissao ?? null;
      if (incluiu("data_validade")) payload.data_validade = data_validade;
      if (incluiu("observacao")) payload.observacao = observacao ?? null;
      if (incluiu("anexo_url")) payload.anexo_url = anexo_url ?? null;
      if (incluiu("anexo_file_name")) payload.anexo_file_name = anexo_file_name ?? null;
      if (incluiu("anexo_size")) payload.anexo_size = anexo_size ?? null;
      if (senha_encrypted !== undefined) payload.senha_encrypted = senha_encrypted;

      const { data, error } = await supabaseAdmin
        .from("certificates").update(payload).eq("id", certificate_id).select().single();
      if (error) throw error;
      return json({ success: true, data });
    }

    const payload: Record<string, unknown> = {
      contact_id,
      company_id,
      partner_id: partner_id ?? null,
      tipo_pessoa,
      modelo,
      autoridade_certificadora: autoridade_certificadora ?? null,
      data_emissao: data_emissao ?? null,
      data_validade,
      observacao: observacao ?? null,
      anexo_url: anexo_url ?? null,
      anexo_file_name: anexo_file_name ?? null,
      anexo_size: anexo_size ?? null,
      status: "ativo",
      responsavel_renovacao: profile.id,
    };
    if (senha_encrypted !== undefined) payload.senha_encrypted = senha_encrypted;

    const { data, error } = await supabaseAdmin.from("certificates").insert(payload).select().single();
    if (error) throw error;
    return json({ success: true, data });
  } catch (error) {
    return json({ success: false, error: (error as Error).message ?? "Erro interno." }, 400);
  }
});
