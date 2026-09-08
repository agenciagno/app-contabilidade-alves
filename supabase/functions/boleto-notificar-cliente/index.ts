// Dispara e-mail de cobrança pro cliente e grava no histórico
// (boleto_client_notifications). Mesmo padrão de certificado-notificar-cliente —
// API de e-mail da Hostinger (não SMTP), token/mailbox em secrets já configurados.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, is_super_admin, company_id, allowed_modules')
      .eq('user_id', user.id)
      .single();
    if (!profile) return json({ error: 'Perfil não encontrado.' }, 403);

    const hasFinanceiroModule = Array.isArray(profile.allowed_modules)
      && (profile.allowed_modules.includes('financeiro') || profile.allowed_modules.includes('financeiro_boletos'));
    if (!profile.is_super_admin && profile.role !== 'admin' && !hasFinanceiroModule) {
      return json({ error: 'Você não tem permissão para cobrar clientes.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const boletoId = body?.boleto_id as string | undefined;
    const assunto = (body?.assunto as string | undefined)?.trim();
    const mensagem = (body?.mensagem as string | undefined)?.trim();
    if (!boletoId || !assunto || !mensagem) {
      return json({ error: 'boleto_id, assunto e mensagem são obrigatórios.' }, 400);
    }

    const { data: boleto, error: boletoErr } = await admin
      .from('boleto_controls')
      .select('id, company_id, contact_id, contacts:contact_id (email, name, display_name)')
      .eq('id', boletoId)
      .single();
    if (boletoErr || !boleto) return json({ error: 'Boleto não encontrado.' }, 404);
    if (boleto.company_id !== profile.company_id && !profile.is_super_admin) {
      return json({ error: 'Sem permissão para este registro.' }, 403);
    }

    const destino = (boleto as any).contacts?.email as string | null;
    if (!destino) return json({ error: 'Cliente não tem e-mail cadastrado.' }, 400);

    const token = Deno.env.get('HOSTINGER_MAIL_API_TOKEN');
    const resourceId = Deno.env.get('HOSTINGER_MAIL_RESOURCE_ID');
    if (!token || !resourceId) {
      return json({ error: 'E-mail não configurado (faltam secrets da Hostinger).' }, 500);
    }

    const res = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${resourceId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: [destino], subject: assunto, text: mensagem }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json({ error: `Falha ao enviar e-mail (${res.status}): ${detail}` }, 502);
    }

    const { error: logErr } = await admin.from('boleto_client_notifications').insert({
      boleto_id: boletoId,
      company_id: boleto.company_id,
      canal: 'email',
      destino,
      mensagem,
      enviado_por: profile.id,
    });
    if (logErr) throw logErr;

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
