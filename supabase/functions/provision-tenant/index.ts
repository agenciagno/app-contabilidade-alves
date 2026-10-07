import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { perfilAtivo } from "../_shared/acesso.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Fallback só pra chamada antiga sem `modules` (nenhum front atual manda mais
// sem isso, mas evita provisionar um tenant zerado se algo ficar pra trás).
const DEFAULT_MODULES = [
  'home', 'financeiro',
  'financeiro_dashboard', 'financeiro_lancamentos', 'financeiro_pagar_receber',
  'financeiro_conta_corrente', 'financeiro_dre',
  'configuracoes',
];

// Seed enxuto de plano de contas (flat, editavel pelo cliente)
const SEED_CATEGORIES: { name: string; type: 'receita' | 'despesa' }[] = [
  { name: 'Vendas', type: 'receita' },
  { name: 'Servicos', type: 'receita' },
  { name: 'Outras Receitas', type: 'receita' },
  { name: 'Fornecedores / Mercadorias', type: 'despesa' },
  { name: 'Salarios', type: 'despesa' },
  { name: 'Pro-labore', type: 'despesa' },
  { name: 'Encargos (INSS/FGTS)', type: 'despesa' },
  { name: 'Impostos (DAS/Simples)', type: 'despesa' },
  { name: 'Aluguel', type: 'despesa' },
  { name: 'Energia Eletrica', type: 'despesa' },
  { name: 'Agua', type: 'despesa' },
  { name: 'Internet / Telefone', type: 'despesa' },
  { name: 'Material de Escritorio', type: 'despesa' },
  { name: 'Tarifas Bancarias', type: 'despesa' },
  { name: 'Manutencao', type: 'despesa' },
  { name: 'Marketing', type: 'despesa' },
  { name: 'Frete / Entregas', type: 'despesa' },
  { name: 'Despesas Diversas', type: 'despesa' },
];

const BodySchema = z.object({
  cnpj: z.string().min(1).max(20),
  name: z.string().min(2).max(255),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  admin_email: z.string().email(),
  admin_name: z.string().min(2).max(255),
  admin_password: z.string().min(8).max(128).optional(),
  // Vinculo opcional com o cliente contabil da CA (contacts) — preenchido pelo
  // front quando o CPF/CNPJ digitado ja bate com um contato existente.
  contact_id: z.string().uuid().optional(),
  // Modulos escolhidos na Etapa 2 do cadastro (front). Empresa e admin nascem
  // com o MESMO array — nao ha mais dois arrays hardcoded que podem divergir.
  modules: z.array(z.string()).min(1).optional(),
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
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let companyId: string | null = null;
  let adminUserId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const { data: { user }, error: ue } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (ue || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: caller } = await perfilAtivo(authHeader, user.id, 'is_super_admin, role');
    if (!caller || (!caller.is_super_admin && caller.role !== 'super_admin')) {
      return new Response(JSON.stringify({ error: 'Apenas super admin (GNO) pode provisionar cliente.' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const { cnpj, name, phone, email, admin_email, admin_name, contact_id, modules } = parsed.data;
    const provisionalPassword = parsed.data.admin_password || genPassword();
    const planModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;

    // 1) Empresa (tenant)
    const { data: company, error: ce } = await admin.from('companies')
      .insert({ cnpj, name, phone: phone || null, email: email || null, status: 'active', plan_modules: planModules, contact_id: contact_id || null })
      .select('id').single();
    if (ce || !company) throw new Error('Falha ao criar empresa: ' + (ce?.message || 'desconhecido'));
    companyId = company.id;

    // 2) Seed de categorias
    const { error: cate } = await admin.from('categories')
      .insert(SEED_CATEGORIES.map((c) => ({ company_id: companyId, name: c.name, type: c.type, show_in_dre: true })));
    if (cate) throw new Error('Falha ao semear categorias: ' + cate.message);

    // 3) Usuario admin (auth)
    const { data: created, error: cue } = await admin.auth.admin.createUser({ email: admin_email, password: provisionalPassword, email_confirm: true });
    if (cue || !created?.user) throw new Error('Falha ao criar usuario admin: ' + (cue?.message || 'desconhecido'));
    adminUserId = created.user.id;

    // 4) Profile do admin (senha provisoria -> troca obrigatoria). Mesmo array
    // do plano da empresa — admin nasce enxergando exatamente o que a empresa contratou.
    const { error: pe } = await admin.from('profiles').insert({
      user_id: adminUserId,
      full_name: admin_name,
      email: admin_email,
      role: 'admin',
      is_super_admin: false,
      company_id: companyId,
      allowed_modules: planModules,
      status_active: true,
      force_password_change: true,
      password_changed_at: null,
    });
    if (pe) throw new Error('Falha ao criar perfil do admin: ' + pe.message);

    return new Response(JSON.stringify({
      success: true,
      company_id: companyId,
      admin_user_id: adminUserId,
      admin_email,
      provisional_password: provisionalPassword,
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    try { if (adminUserId) await admin.auth.admin.deleteUser(adminUserId); } catch (_) {}
    try { if (companyId) { await admin.from('categories').delete().eq('company_id', companyId); await admin.from('companies').delete().eq('id', companyId); } } catch (_) {}
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
