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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const COFRE_SECRET_KEY = Deno.env.get("COFRE_SECRET_KEY");
    if (!COFRE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "COFRE_SECRET_KEY não configurada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await perfilAtivo(authHeader, user.id, "id, role, is_super_admin, company_id, allowed_modules");

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: "Perfil não encontrado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasAcessosModule = Array.isArray(profile.allowed_modules) && profile.allowed_modules.includes("acessos");
    if (!profile.is_super_admin && profile.role !== "admin" && !hasAcessosModule) {
      return new Response(
        JSON.stringify({ success: false, error: "Você não tem permissão para gerenciar o cofre de senhas." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { acesso_id, contact_id, portal, portal_label, login, senha, validade_certificado, observacao } = body;

    if (!contact_id || !portal) {
      return new Response(
        JSON.stringify({ success: false, error: "contact_id e portal são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: contactData, error: contactError } = await supabaseAdmin
      .from("contacts")
      .select("company_id")
      .eq("id", contact_id)
      .single();

    if (contactError || !contactData) {
      return new Response(
        JSON.stringify({ success: false, error: "Cliente não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const company_id = contactData.company_id;

    if (company_id !== profile.company_id && !profile.is_super_admin) {
      return new Response(
        JSON.stringify({ success: false, error: "Sem permissão para este registro." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let senha_encrypted = undefined;
    if (senha) {
      const { data: encrypted, error: encryptError } = await supabaseAdmin.rpc("cofre_encrypt_internal", {
        p_plaintext: senha,
        p_key: COFRE_SECRET_KEY,
      });
      if (encryptError) {
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao criptografar senha do cofre." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      senha_encrypted = encrypted;
    }

    const payload: Record<string, unknown> = {
      contact_id,
      company_id,
      portal,
      portal_label: portal_label ?? null,
      login: login ?? null,
      observacao: observacao ?? null,
      validade_certificado: validade_certificado ?? null,
      atualizado_por: profile.id,
    };
    if (senha_encrypted !== undefined) payload.senha_encrypted = senha_encrypted;

    let result;
    if (acesso_id) {
      const { data, error } = await supabaseAdmin
        .from("acessos_portais")
        .update(payload)
        .eq("id", acesso_id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("acessos_portais")
        .insert(payload)
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          return new Response(
            JSON.stringify({ success: false, error: `Já existe um acesso para o portal ${portal} neste cliente.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw error;
      }
      result = data;
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message ?? "Erro interno." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
