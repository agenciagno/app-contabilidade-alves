// Suspende ou reativa um cliente externo (tenant).
// Diferente do update direto na tabela: ao suspender, derruba as sessões abertas.
// O gate de `companies.status` só roda no login — sem isso, quem já está dentro continua.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  company_id: z.string().uuid(),
  status: z.enum(['active', 'suspended']),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: ue } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (ue || !user) return json({ error: 'Invalid token' }, 401);

    const { data: caller } = await admin
      .from('profiles').select('is_super_admin, role, company_id, full_name')
      .eq('user_id', user.id).single();
    if (!caller || (!caller.is_super_admin && caller.role !== 'super_admin')) {
      return json({ error: 'Apenas super admin (GNO) pode suspender ou reativar cliente.' }, 403);
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, 400);
    const { company_id, status } = parsed.data;

    const { data: company } = await admin
      .from('companies').select('id, name, is_internal').eq('id', company_id).single();
    if (!company) return json({ error: 'Cliente não encontrado.' }, 404);
    if (company.is_internal) return json({ error: 'A matriz da CA não pode ser suspensa.' }, 400);

    const { error: upErr } = await admin.from('companies').update({ status }).eq('id', company_id);
    if (upErr) throw new Error('Falha ao atualizar status: ' + upErr.message);

    // Ao suspender, apaga as sessões ativas — o app escuta o DELETE em realtime e desloga.
    let revoked = 0;
    if (status === 'suspended') {
      const { data: users } = await admin.from('profiles').select('user_id').eq('company_id', company_id);
      const ids = (users ?? []).map((u) => u.user_id);
      if (ids.length) {
        const { data: killed } = await admin
          .from('active_sessions').delete().in('user_id', ids).select('id');
        revoked = killed?.length ?? 0;
      }
    }

    if (caller.company_id) {
      await admin.from('global_logs').insert({
        company_id: caller.company_id,
        user_id: user.id,
        user_name: caller.full_name,
        action: status === 'suspended' ? 'suspender_cliente' : 'reativar_cliente',
        module: 'clientes_externos',
        entity_id: company_id,
        entity_name: company.name,
        details: status === 'suspended'
          ? `Cliente suspenso. ${revoked} sessão(ões) encerrada(s).`
          : 'Cliente reativado.',
      });
    }

    return json({ success: true, status, sessions_revoked: revoked });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
