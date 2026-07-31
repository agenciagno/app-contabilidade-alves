// Cria um usuário dentro de um cliente externo (tenant).
// A trava de quantidade vive aqui, e não só na tela: a tela pode ficar
// desatualizada e o limite é o que foi vendido no plano.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  company_id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(255),
  role: z.enum(['admin', 'colaborador']),
  allowed_modules: z.array(z.string()).optional(),
  password: z.string().min(8).max(128).optional(),
});

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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  let createdUserId: string | null = null;
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data: { user }, error: ue } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (ue || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data: caller } = await admin.from('profiles').select('is_super_admin, role').eq('user_id', user.id).single();
    if (!caller || (!caller.is_super_admin && caller.role !== 'super_admin')) {
      return new Response(JSON.stringify({ error: 'Apenas super admin (GNO) pode adicionar usuario de cliente.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new Response(JSON.stringify({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { company_id, email, name, role } = parsed.data;
    const provisionalPassword = parsed.data.password || genPassword();

    const { data: comp } = await admin
      .from('companies').select('name, plan_modules, max_users').eq('id', company_id).single();
    if (!comp) return new Response(JSON.stringify({ error: 'Cliente nao encontrado.' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Teto do plano. NULL = ilimitado.
    if (comp.max_users != null) {
      const { count, error: ce } = await admin
        .from('profiles').select('user_id', { count: 'exact', head: true }).eq('company_id', company_id);
      if (ce) throw new Error('Falha ao contar usuarios: ' + ce.message);
      if ((count ?? 0) >= comp.max_users) {
        return new Response(
          JSON.stringify({
            error: `Limite do plano atingido: ${comp.max_users} usuario(s). Aumente o limite em Clientes Externos > ${comp.name} > Visao geral para adicionar mais.`,
          }),
          { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } },
        );
      }
    }

    // modulos padrao = plan_modules do tenant (se nao informado)
    let allowedModules = parsed.data.allowed_modules;
    if (!allowedModules) {
      allowedModules = (comp.plan_modules as string[] | null) ?? ['home'];
    }

    const { data: created, error: cue } = await admin.auth.admin.createUser({ email, password: provisionalPassword, email_confirm: true });
    if (cue || !created?.user) throw new Error('Falha ao criar usuario: ' + (cue?.message || 'desconhecido'));
    createdUserId = created.user.id;

    const { error: pe } = await admin.from('profiles').insert({
      user_id: createdUserId,
      full_name: name,
      email,
      role,
      is_super_admin: false,
      company_id,
      allowed_modules: allowedModules,
      status_active: true,
      force_password_change: true,
      password_changed_at: null,
    });
    if (pe) { await admin.auth.admin.deleteUser(createdUserId); throw new Error('Falha ao criar perfil: ' + pe.message); }

    return new Response(JSON.stringify({ success: true, user_id: createdUserId, email, provisional_password: provisionalPassword }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
