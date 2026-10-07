import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { acessosDe, perfilAtivo } from "../_shared/acesso.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({ company_id: z.string().uuid() });

// Tabelas com company_id que NAO cascateiam (NO ACTION) ou nao tem FK (orfas) -> limpar explicito
const EXPLICIT_DELETE_TABLES = [
  'transaction_attachments', 'transfer_log', 'dre_budgets', 'boleto_controls',
  'honorarios_historico', 'acessos_portais', 'client_obligations', 'cnds',
  'collaborator_coverage', 'fiscal_obligations_catalog', 'monitor_cnpj', 'onboarding_steps',
];

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
    const { data: caller } = await perfilAtivo(authHeader, user.id, 'is_super_admin, role, company_id');
    if (!caller || (!caller.is_super_admin && caller.role !== 'super_admin')) {
      return new Response(JSON.stringify({ error: 'Apenas super admin (GNO) pode excluir empresa.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new Response(JSON.stringify({ error: 'Dados invalidos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { company_id } = parsed.data;

    if (company_id === caller.company_id) {
      return new Response(JSON.stringify({ error: 'Nao e permitido excluir a propria empresa (Matriz).' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 1) coletar usuarios do tenant
    const { data: profs } = await admin.from('profiles').select('user_id').eq('company_id', company_id);
    const userIds = (profs ?? []).map((p: { user_id: string }) => p.user_id);

    // 2) limpar tabelas que bloqueiam / orfas
    for (const t of EXPLICIT_DELETE_TABLES) {
      const { error } = await admin.from(t).delete().eq('company_id', company_id);
      if (error && !/column .*company_id.* does not exist/i.test(error.message)) {
        throw new Error(`Falha limpando ${t}: ${error.message}`);
      }
    }

    // 3) excluir usuarios do auth (profiles cascateiam ao excluir a company)
    for (const uid of userIds) {
      const acessos = await acessosDe(admin, uid);
      if (acessos.some((a) => a.company_id !== company_id)) continue; // tem outro acesso: mantém o login
      await admin.from('active_sessions').delete().eq('user_id', uid);
      try { await admin.auth.admin.deleteUser(uid); } catch (_) { /* segue */ }
    }

    // 4) excluir a empresa (cascata: banks, categories, transactions, recurring, profiles, contatos, etc.)
    const { error: ce } = await admin.from('companies').delete().eq('id', company_id);
    if (ce) throw new Error('Falha ao excluir empresa: ' + ce.message);

    return new Response(JSON.stringify({ success: true, deleted_users: userIds.length }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
