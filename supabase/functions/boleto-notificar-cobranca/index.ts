// Dispara UM e-mail de cobrança cobrindo 1+ boletos (aba Cobrança) e grava o histórico —
// mesmo padrão de boleto-notificar-cliente, mas esse aceita boleto_ids[] e um destino
// explícito em vez de derivar sempre do e-mail cadastrado no contato (a aba Cobrança permite
// digitar o destino na hora, inclusive quando 2+ clientes da mesma pessoa responsável são
// cobrados juntos e não têm o mesmo e-mail cadastrado).
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
    const boletoIds = Array.isArray(body?.boleto_ids) ? (body.boleto_ids as string[]) : [];
    const destino = (body?.destino as string | undefined)?.trim();
    const assunto = (body?.assunto as string | undefined)?.trim();
    const mensagem = (body?.mensagem as string | undefined)?.trim();
    if (boletoIds.length === 0 || !destino || !assunto || !mensagem) {
      return json({ error: 'boleto_ids, destino, assunto e mensagem são obrigatórios.' }, 400);
    }

    const { data: boletos, error: boletosErr } = await admin
      .from('boleto_controls')
      .select('id, company_id')
      .in('id', boletoIds);
    if (boletosErr) throw boletosErr;
    if (!boletos || boletos.length !== boletoIds.length) {
      return json({ error: 'Um ou mais boletos não foram encontrados.' }, 404);
    }
    const companyId = boletos[0].company_id;
    const mesmaEmpresa = boletos.every((b) => b.company_id === companyId);
    if (!mesmaEmpresa) return json({ error: 'Os boletos selecionados pertencem a empresas diferentes.' }, 400);
    if (companyId !== profile.company_id && !profile.is_super_admin) {
      return json({ error: 'Sem permissão para estes registros.' }, 403);
    }

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

    const rows = boletoIds.map((boletoId) => ({
      boleto_id: boletoId,
      company_id: companyId,
      canal: 'email',
      destino,
      mensagem,
      enviado_por: profile.id,
    }));
    const { error: logErr } = await admin.from('boleto_client_notifications').insert(rows);
    if (logErr) throw logErr;

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
