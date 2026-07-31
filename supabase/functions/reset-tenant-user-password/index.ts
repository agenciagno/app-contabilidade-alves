// Gera uma nova senha provisória para um usuário de cliente externo e devolve na tela.
// Existe porque o reset por e-mail depende de SMTP transacional: se o envio falhar, o
// cliente fica sem acesso e a tela não tem como saber. Aqui a senha volta na resposta.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({ user_id: z.string().uuid() });

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let p = '';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (const n of arr) p += chars[n % chars.length];
  return p + '@9';
}

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
      return json({ error: 'Apenas super admin (GNO) pode reemitir senha de cliente.' }, 403);
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Dados inválidos' }, 400);
    const { user_id } = parsed.data;

    const { data: target } = await admin
      .from('profiles').select('user_id, full_name, email, company_id').eq('user_id', user_id).single();
    if (!target) return json({ error: 'Usuário não encontrado.' }, 404);

    const password = genPassword();
    const { error: pwErr } = await admin.auth.admin.updateUserById(user_id, { password });
    if (pwErr) throw new Error('Falha ao definir a senha: ' + pwErr.message);

    const { error: pfErr } = await admin
      .from('profiles')
      .update({ force_password_change: true, password_changed_at: null })
      .eq('user_id', user_id);
    if (pfErr) throw new Error('Senha trocada, mas falhou marcar troca obrigatória: ' + pfErr.message);

    // Derruba as sessões abertas: a senha antiga não deve continuar valendo em outro device.
    await admin.from('active_sessions').delete().eq('user_id', user_id);

    if (caller.company_id) {
      await admin.from('global_logs').insert({
        company_id: caller.company_id,
        user_id: user.id,
        user_name: caller.full_name,
        action: 'reemitir_senha_cliente',
        module: 'clientes_externos',
        entity_id: target.company_id,
        entity_name: target.full_name ?? target.email,
        details: 'Nova senha provisória gerada; troca obrigatória no próximo acesso.',
      });
    }

    return json({ success: true, email: target.email, provisional_password: password });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
