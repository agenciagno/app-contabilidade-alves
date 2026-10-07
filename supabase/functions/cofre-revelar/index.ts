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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado.");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("Sessão inválida.");

    const { data: profile } = await perfilAtivo(authHeader, user.id, "id, role, is_super_admin, company_id, allowed_modules");

    if (!profile) throw new Error("Perfil não encontrado.");

    const hasAcessosModule = Array.isArray(profile.allowed_modules) && profile.allowed_modules.includes("acessos");
    if (!profile.is_super_admin && profile.role !== "admin" && !hasAcessosModule) {
      throw new Error("Você não tem permissão para revelar senhas do cofre.");
    }

    const { acesso_id, acao = "REVELAR" } = await req.json();
    if (!acesso_id) throw new Error("acesso_id é obrigatório.");

    const { data: acesso, error: acessoErr } = await supabaseAdmin
      .from("acessos_portais")
      .select("senha_encrypted, company_id, contact_id, portal")
      .eq("id", acesso_id)
      .single();

    if (acessoErr || !acesso) throw new Error("Acesso não encontrado.");
    if (acesso.company_id !== profile.company_id && !profile.is_super_admin) {
      throw new Error("Sem permissão para este registro.");
    }

    if (!acesso.senha_encrypted) {
      return new Response(
        JSON.stringify({ success: true, senha: null, message: "Senha não cadastrada." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const secret = Deno.env.get("COFRE_SECRET_KEY");
    if (!secret) throw new Error("COFRE_SECRET_KEY não configurada.");

    const { data: decrypted, error: decryptErr } = await supabaseAdmin.rpc(
      "cofre_decrypt_internal",
      { p_encrypted: acesso.senha_encrypted, p_key: secret }
    );

    if (decryptErr) throw new Error("Falha ao descriptografar: " + decryptErr.message);

    await supabaseAdmin.from("cofre_acessos_log").insert({
      acesso_id,
      usuario_id: user.id,
      usuario_nome: profile.id,
      acao: acao === "COPIAR" ? "COPIAR" : "REVELAR",
      ip_address: req.headers.get("x-forwarded-for") ?? null,
    });

    return new Response(
      JSON.stringify({ success: true, senha: decrypted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
