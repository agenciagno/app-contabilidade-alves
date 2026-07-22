// send-push — ponto único de disparo de Web Push da plataforma.
// Chamado pela Central de Notificações (super admin / admin) e pelos gatilhos
// automáticos do N8N (service_role). NÃO duplicar lógica de disparo em outro lugar.
//
// Web Push no edge runtime: usa @negrel/webpush (Web Crypto + fetch), NÃO web-push
// do Node (que depende de node:https, o mesmo problema do mTLS Sicoob).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.3.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

interface Target {
  type: "all" | "company" | "user";
  companyId?: string;
  userId?: string;
}
interface Body {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  tag?: string;
  target: Target;
}

function decodeJwtRole(authHeader: string): string | null {
  try {
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const [, payload] = jwt.split(".");
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return decoded?.role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const VAPID_KEYS = Deno.env.get("VAPID_KEYS");
  const VAPID_SUBJECT =
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@contabilidadealves.com.br";

  if (!VAPID_KEYS) return json({ error: "vapid_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Autorização ───────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const isService = decodeJwtRole(authHeader) === "service_role";

  let isSuper = false;
  let callerCompany: string | null = null;
  if (!isService) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await admin
      .from("profiles")
      .select("company_id, role, is_super_admin")
      .eq("user_id", user.id)
      .single();
    isSuper = prof?.role === "super_admin" || prof?.is_super_admin === true;
    callerCompany = prof?.company_id ?? null;
  }

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const { title, body, url, icon, tag, target } = payload;
  if (!title || !target?.type) return json({ error: "missing_fields" }, 400);

  // ── Resolver destinatários e checar permissão ────────────────
  let query = admin.from("push_tokens").select("id, endpoint, subscription");
  if (target.type === "all") {
    if (!isService && !isSuper) return json({ error: "forbidden" }, 403);
    // todos os tokens da carteira (todas as empresas)
  } else if (target.type === "company") {
    if (!target.companyId) return json({ error: "missing_company" }, 400);
    if (!isService && !isSuper && callerCompany !== target.companyId) {
      return json({ error: "forbidden" }, 403);
    }
    query = query.eq("company_id", target.companyId);
  } else if (target.type === "user") {
    if (!target.userId) return json({ error: "missing_user" }, 400);
    if (!isService && !isSuper) {
      // admin comum só pode mirar usuário da própria empresa
      const { data: tgt } = await admin
        .from("profiles")
        .select("company_id")
        .eq("user_id", target.userId)
        .single();
      if (!tgt || tgt.company_id !== callerCompany) {
        return json({ error: "forbidden" }, 403);
      }
    }
    query = query.eq("user_id", target.userId);
  } else {
    return json({ error: "invalid_target" }, 400);
  }

  const { data: tokens, error } = await query;
  if (error) return json({ error: "query_failed", detail: error.message }, 500);
  if (!tokens || tokens.length === 0) {
    return json({ sent: 0, failed: 0, cleaned: 0, note: "no_tokens" });
  }

  // ── Preparar servidor de aplicação (VAPID) ───────────────────
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS), {
    extractable: false,
  });
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: VAPID_SUBJECT,
    vapidKeys,
  });

  const message = JSON.stringify({
    title,
    body: body ?? "",
    url: url ?? "/",
    icon: icon ?? "/icons/icon-192.png",
    tag: tag ?? "ca-notify",
  });

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  for (const t of tokens) {
    try {
      const subscriber = appServer.subscribe(t.subscription);
      await subscriber.pushTextMessage(message, {});
      sent++;
    } catch (e) {
      failed++;
      const status = (e as { response?: Response })?.response?.status;
      if (status === 404 || status === 410) staleIds.push(t.id);
    }
  }

  let cleaned = 0;
  if (staleIds.length > 0) {
    const { count } = await admin
      .from("push_tokens")
      .delete({ count: "exact" })
      .in("id", staleIds);
    cleaned = count ?? staleIds.length;
    // marca os que enviaram como usados recentemente
  }
  if (sent > 0) {
    const okIds = tokens.filter((t) => !staleIds.includes(t.id)).map((t) => t.id);
    await admin
      .from("push_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", okIds);
  }

  return json({ sent, failed, cleaned, total: tokens.length });
});
