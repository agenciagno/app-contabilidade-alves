// Bloqueia ou libera o acesso de um usuário de cliente externo.
// Escreve `profiles.status` (que é o campo que o login checa) e mantém `status_active`
// em sincronia — os dois viviam divergentes: a tela mostrava um, o login olhava o outro.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { acessosDe, empresaDoAlvo, perfilAtivo } from "../_shared/acesso.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  user_id: z.string().uuid(),
  blocked: z.boolean(),
  // Empresa do acesso (um login pode ter vários). Opcional se a pessoa tiver um só.
  company_id: z.string().uuid().optional(),
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

    const { data: caller } = await perfilAtivo(authHeader, user.id, 'is_super_admin, role, company_id, full_name');
    if (!caller || (!caller.is_super_admin && caller.role !== 'super_admin')) {
      return json({ error: 'Apenas super admin (GNO) pode bloquear usuário de cliente.' }, 403);
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, 400);
    const { user_id, blocked, company_id } = parsed.data;

    if (user_id === user.id) return json({ error: 'Você não pode bloquear o próprio acesso.' }, 400);

    const acessos = await acessosDe<{ user_id: string; full_name: string | null; email: string; company_id: string; status_active: boolean }>(
      admin, user_id, 'user_id, full_name, email, company_id, status_active');
    if (acessos.length === 0) return json({ error: 'Usuário não encontrado.' }, 404);
    const empresa = empresaDoAlvo(acessos, company_id);
    if (!empresa) return json({ error: 'Usuário com mais de um acesso: informe a empresa.' }, 400);
    const target = acessos.find((a) => a.company_id === empresa)!;

    const { error: upErr } = await admin
      .from('profiles')
      .update({ status: blocked ? 'blocked' : 'active', status_active: !blocked })
      .eq('user_id', user_id)
      .eq('company_id', empresa);
    if (upErr) throw new Error('Falha ao atualizar usuário: ' + upErr.message);

    let revoked = 0;
    // Derruba as sessões só se a pessoa não tiver outro acesso ativo: o bloqueio
    // deste acesso já vale na hora (o banco confere o acesso a cada consulta).
    const temOutroAcesso = acessos.some((a) => a.company_id !== empresa && a.status_active);
    if (blocked && !temOutroAcesso) {
      const { data: killed } = await admin
        .from('active_sessions').delete().eq('user_id', user_id).select('id');
      revoked = killed?.length ?? 0;
    }

    if (caller.company_id) {
      await admin.from('global_logs').insert({
        company_id: caller.company_id,
        user_id: user.id,
        user_name: caller.full_name,
        action: blocked ? 'bloquear_usuario_cliente' : 'liberar_usuario_cliente',
        module: 'clientes_externos',
        entity_id: target.company_id,
        entity_name: target.full_name ?? target.email,
        details: blocked
          ? `Acesso bloqueado. ${revoked} sessão(ões) encerrada(s).`
          : 'Acesso liberado.',
      });
    }

    return json({ success: true, blocked, sessions_revoked: revoked });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
