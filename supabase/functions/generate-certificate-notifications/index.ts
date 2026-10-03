// Roda 1x/dia via pg_cron. Varre certificates ativos, dispara due_alert + popup
// internos nos limiares 30/15/7/0 dias (uma vez cada) e diariamente quando vencido,
// e cria a tarefa de renovação em fiscal_tasks na primeira vez que entra na janela.
// So interno por decisao do Gabriel (27/08/2026) — sem envio automatico ao cliente aqui.
// Copiado do Supabase em 03/10/2026 (estava só em produção, fora do repositório). Sem alteração.
import { createClient } from 'npm:@supabase/supabase-js@2';

const THRESHOLDS = [30, 15, 7, 0];

Deno.serve(async (req) => {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: certs, error: certsErr } = await admin
      .from('certificates')
      .select('id, company_id, contact_id, partner_id, data_validade, last_alert_days, renewal_task_id, contacts:contact_id (name, display_name), contact_partners:partner_id (name)')
      .eq('status', 'ativo');
    if (certsErr) throw certsErr;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let notificados = 0;
    let tarefasCriadas = 0;

    for (const cert of certs ?? []) {
      const validade = new Date((cert as any).data_validade + 'T00:00:00');
      const diasParaVencer = Math.round((validade.getTime() - hoje.getTime()) / 86400000);

      if (diasParaVencer > 30) continue;

      const vencido = diasParaVencer < 0;
      const threshold = vencido ? -1 : (THRESHOLDS.find((t) => diasParaVencer >= t) ?? 0);
      const jaAlertadoNesseLimiar = !vencido && cert.last_alert_days === threshold;
      if (jaAlertadoNesseLimiar) continue;

      const titular = (cert as any).contact_partners?.name
        ?? (cert as any).contacts?.display_name
        ?? (cert as any).contacts?.name
        ?? 'Cliente';

      const titulo = vencido ? `Certificado vencido — ${titular}` : `Certificado vence em ${diasParaVencer} dias — ${titular}`;
      const corpo = vencido
        ? `O certificado digital de ${titular} venceu em ${(cert as any).data_validade}. Providencie a renovação.`
        : `O certificado digital de ${titular} vence em ${diasParaVencer} dia(s) (${(cert as any).data_validade}).`;

      const { data: alvos, error: alvosErr } = await admin
        .from('profiles')
        .select('id, user_id')
        .eq('company_id', cert.company_id)
        .or('is_super_admin.eq.true,role.eq.admin,allowed_modules.cs.{cadastro}');
      if (alvosErr) throw alvosErr;

      const actionUrl = `/cadastros/certificados?highlight=${cert.id}`;
      const rows = (alvos ?? []).flatMap((p) => ([
        {
          user_id: p.user_id,
          company_id: cert.company_id,
          type: 'due_alert',
          title: titulo,
          body: corpo,
          action_url: actionUrl,
          reference_type: 'certificate',
          reference_id: cert.id,
          show_on_login_only: false,
        },
        {
          user_id: p.user_id,
          company_id: cert.company_id,
          type: 'popup',
          title: titulo,
          body: corpo,
          action_url: actionUrl,
          button_label: 'Ver certificado',
          reference_type: 'certificate',
          reference_id: cert.id,
          show_on_login_only: false,
        },
      ]));

      if (rows.length > 0) {
        const { error: notifErr } = await admin.from('notifications').insert(rows);
        if (notifErr) throw notifErr;
        notificados += 1;
      }

      if (!vencido) {
        await admin.from('certificates').update({ last_alert_days: threshold }).eq('id', cert.id);
      }

      if (!cert.renewal_task_id) {
        const { data: tarefa, error: tarefaErr } = await admin
          .from('fiscal_tasks')
          .insert({
            company_id: cert.company_id,
            contact_id: cert.contact_id,
            title: `Renovar certificado digital — ${titular}`,
            description: `Certificado vence em ${(cert as any).data_validade}. Gerado automaticamente pelo módulo de Certificados.`,
            status: 'a_fazer',
            due_date: (cert as any).data_validade,
            department: 'geral',
            is_auto_generated: true,
          })
          .select('id')
          .single();
        if (tarefaErr) throw tarefaErr;
        await admin.from('certificates').update({ renewal_task_id: tarefa.id }).eq('id', cert.id);
        tarefasCriadas += 1;
      }
    }

    return new Response(JSON.stringify({ success: true, notificados, tarefasCriadas }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
