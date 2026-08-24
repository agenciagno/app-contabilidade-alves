// Avisa suporte@contabilidadealves.com.br por e-mail quando um cliente abre um chamado.
// Envio via API de E-mail da Hostinger (não SMTP) — token/mailbox em Supabase Secrets
// (HOSTINGER_MAIL_API_TOKEN, HOSTINGER_MAIL_RESOURCE_ID). Falha aqui nunca derruba a
// criação do chamado: o front já salvou o registro antes de chamar esta function.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  ticketId: z.string().uuid(),
});

const CATEGORIA_LABEL: Record<string, string> = {
  tecnico: 'Suporte Técnico',
  financeiro: 'Financeiro',
  email: 'Alteração de E-mail',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: { user }, error: ue } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (ue || !user) return json({ error: 'Invalid token' }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Dados inválidos' }, 400);
    const { ticketId } = parsed.data;

    const { data: ticket, error: ticketErr } = await admin
      .from('support_tickets')
      .select('id, company_id, user_id, category, assunto, descricao, created_at')
      .eq('id', ticketId)
      .single();
    if (ticketErr || !ticket) return json({ error: 'Chamado não encontrado.' }, 404);

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('company_id, is_super_admin, full_name, email')
      .eq('user_id', user.id)
      .single();
    if (!callerProfile || (callerProfile.company_id !== ticket.company_id && !callerProfile.is_super_admin)) {
      return json({ error: 'Sem permissão para este chamado.' }, 403);
    }

    const token = Deno.env.get('HOSTINGER_MAIL_API_TOKEN');
    const resourceId = Deno.env.get('HOSTINGER_MAIL_RESOURCE_ID');
    if (!token || !resourceId) {
      return json({ error: 'E-mail de suporte não configurado (faltam secrets da Hostinger).' }, 500);
    }

    const { data: company } = await admin
      .from('companies')
      .select('name')
      .eq('id', ticket.company_id)
      .single();

    const categoriaLabel = CATEGORIA_LABEL[ticket.category] ?? ticket.category;
    const text = [
      'Novo chamado aberto no sistema.',
      '',
      `Empresa: ${company?.name ?? '—'}`,
      `Usuário: ${callerProfile.full_name ?? ''} <${callerProfile.email ?? ''}>`,
      `Categoria: ${categoriaLabel}`,
      `Assunto: ${ticket.assunto}`,
      '',
      'Descrição:',
      ticket.descricao,
      '',
      'Ver no sistema: https://app.contabilidadealves.com.br/suporte',
      `Chamado: ${ticket.id}`,
    ].join('\n');

    const res = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${resourceId}/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: ['suporte@contabilidadealves.com.br'],
        subject: `[Chamado] ${categoriaLabel} — ${ticket.assunto}`,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json({ error: `Falha ao enviar e-mail (${res.status}): ${detail}` }, 502);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
