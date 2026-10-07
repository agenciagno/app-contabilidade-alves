import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { acessosDe, empresaDoAlvo, perfilAtivo } from "../_shared/acesso.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Empresa do acesso a excluir (um login pode ter vários). Opcional se a pessoa tiver um só.
const BodySchema = z.object({ user_id: z.string().uuid(), company_id: z.string().uuid().optional() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data: { user }, error: ue } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (ue || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data: caller } = await perfilAtivo(authHeader, user.id, 'is_super_admin, role');
    if (!caller || (!caller.is_super_admin && caller.role !== 'super_admin')) {
      return new Response(JSON.stringify({ error: 'Apenas super admin (GNO) pode excluir usuario.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new Response(JSON.stringify({ error: 'Dados invalidos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { user_id, company_id } = parsed.data;

    if (user_id === user.id) return new Response(JSON.stringify({ error: 'Voce nao pode excluir a si mesmo.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const acessos = await acessosDe<{ company_id: string; is_super_admin: boolean }>(admin, user_id, 'company_id, is_super_admin');
    if (acessos.some((a) => a.is_super_admin)) return new Response(JSON.stringify({ error: 'Nao e permitido excluir um super admin.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const empresa = empresaDoAlvo(acessos, company_id);
    if (!empresa) return new Response(JSON.stringify({ error: 'Usuario com mais de um acesso: informe a empresa.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { error: pe } = await admin.from('profiles').delete().eq('user_id', user_id).eq('company_id', empresa);
    if (pe) throw new Error('Falha ao excluir o acesso: ' + pe.message);
    // O login (e-mail e senha) só é apagado se a pessoa não tiver outro acesso.
    if (acessos.length === 1) {
      await admin.from('active_sessions').delete().eq('user_id', user_id);
      const { error: de } = await admin.auth.admin.deleteUser(user_id);
      if (de) throw new Error('Falha ao excluir usuario do auth: ' + de.message);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
