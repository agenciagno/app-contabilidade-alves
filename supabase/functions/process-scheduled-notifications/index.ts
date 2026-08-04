// process-scheduled-notifications — varre scheduled_notifications vencidas (scheduled_at <= now())
// e dispara cada uma. Chamado pelo job pg_cron "process-scheduled-notifications" a cada minuto
// (net.http_post com a anon key, mesmo padrão do job "calcular-fiscal-calendar-mensal").
//
// Canal push: NÃO reimplementa o envio — chama a própria send-push (server-to-server, com o
// service role desta function) pra manter "ponto único de disparo de Web Push" válido.
// Canal popup: insere direto em `notifications` (mesma tabela que já alimenta o sino), uma
// linha por usuário-alvo, com type='popup'.
//
// Envio imediato (sem agendamento) não passa por aqui — a Central de Notificações despacha
// direto (push via send-push, popup via insert direto), síncrono, como sempre foi.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

interface ScheduledRow {
  id: string;
  title: string;
  body: string | null;
  action_url: string | null;
  button_label: string | null;
  channel: "push" | "popup" | "both";
  target_type: "all" | "company" | "user";
  target_company_id: string | null;
  target_user_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: due, error: dueErr } = await admin
    .from("scheduled_notifications")
    .select(
      "id, title, body, action_url, button_label, channel, target_type, target_company_id, target_user_id",
    )
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (dueErr) return json({ error: "query_failed", detail: dueErr.message }, 500);
  if (!due || due.length === 0) return json({ processed: 0, sent: 0, failed: 0 });

  let sent = 0;
  let failed = 0;

  for (const row of due as ScheduledRow[]) {
    try {
      const target = {
        type: row.target_type,
        companyId: row.target_company_id ?? undefined,
        userId: row.target_user_id ?? undefined,
      };

      if (row.channel === "push" || row.channel === "both") {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: row.title,
            body: row.body ?? "",
            url: row.action_url ?? "/",
            target,
          }),
        });
        if (!res.ok) {
          throw new Error(`send-push falhou (${res.status}): ${await res.text()}`);
        }
      }

      if (row.channel === "popup" || row.channel === "both") {
        let recipients: { user_id: string; company_id: string | null }[] = [];

        if (row.target_type === "user" && row.target_user_id) {
          const { data: prof } = await admin
            .from("profiles")
            .select("user_id, company_id")
            .eq("user_id", row.target_user_id)
            .maybeSingle();
          if (prof) recipients = [prof];
        } else {
          let q = admin.from("profiles").select("user_id, company_id");
          if (row.target_type === "company" && row.target_company_id) {
            q = q.eq("company_id", row.target_company_id);
          }
          const { data: profs, error: profErr } = await q;
          if (profErr) throw profErr;
          recipients = profs ?? [];
        }

        if (recipients.length > 0) {
          const rows = recipients.map((r) => ({
            user_id: r.user_id,
            company_id: r.company_id,
            type: "popup",
            title: row.title,
            body: row.body,
            action_url: row.action_url,
            button_label: row.button_label,
          }));
          const { error: insErr } = await admin.from("notifications").insert(rows);
          if (insErr) throw insErr;
        }
      }

      await admin
        .from("scheduled_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      await admin
        .from("scheduled_notifications")
        .update({
          status: "failed",
          error: (e as Error)?.message ?? String(e),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return json({ processed: due.length, sent, failed });
});
