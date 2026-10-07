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

const ALLOWED_BUCKETS = ["contact-documents", "transaction-attachments"];

serve(async (req) => {
  const corsHeaders = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Não autorizado." }, 401);

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
    if (userErr || !user) return json({ success: false, error: "Sessão inválida." }, 401);

    const { data: profile } = await perfilAtivo(authHeader, user.id, "company_id, is_super_admin");
    if (!profile) return json({ success: false, error: "Perfil não encontrado." }, 403);

    const { bucket, path } = await req.json();
    if (!bucket || !path) return json({ success: false, error: "bucket e path são obrigatórios." }, 400);
    if (!ALLOWED_BUCKETS.includes(bucket)) return json({ success: false, error: "Bucket inválido." }, 400);

    const segments = String(path).split("/");
    let targetCompany: string | null = null;
    let titularId: string | null = null;

    if (bucket === "contact-documents") {
      titularId = segments[0] ?? null;
      if (!titularId) return json({ success: false, error: "Path inválido." }, 400);
      const { data: contact } = await supabaseAdmin
        .from("contacts").select("company_id").eq("id", titularId).single();
      targetCompany = contact?.company_id ?? null;
    } else {
      // transaction-attachments: company_id está em algum segmento do path
      targetCompany = segments.find((s) => s === profile.company_id) ?? null;
    }

    if (!profile.is_super_admin && targetCompany !== profile.company_id) {
      return json({ success: false, error: "Sem permissão para este arquivo." }, 403);
    }

    const { data: signed, error: signErr } = await supabaseAdmin
      .storage.from(bucket).createSignedUrl(path, 60);
    if (signErr || !signed) return json({ success: false, error: "Falha ao gerar link." }, 400);

    await supabaseAdmin.from("data_access_log").insert({
      company_id: profile.is_super_admin ? (targetCompany ?? profile.company_id) : profile.company_id,
      usuario_id: user.id,
      titular_tipo: bucket === "contact-documents" ? "contato" : null,
      titular_id: bucket === "contact-documents" ? titularId : null,
      recurso: "documento",
      recurso_id: `${bucket}/${path}`,
      acao: "download",
      ip_address: req.headers.get("x-forwarded-for") ?? null,
    });

    return json({ success: true, url: signed.signedUrl });
  } catch (err) {
    return json({ success: false, error: (err as Error).message ?? "Erro interno." }, 400);
  }
});
