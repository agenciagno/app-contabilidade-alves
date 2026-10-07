import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { acessosDe, perfilAtivo } from "../_shared/acesso.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(2).max(255),
  email: z.string().email().optional(),
  role: z.string().min(1),
  statusActive: z.boolean(),
  allowedModules: z.array(z.string()),
  department: z.string().nullable().optional(),
  // Empresa do acesso a editar. Opcional: sem ela vale a do admin (ou a única da pessoa).
  companyId: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerUserId = claims.claims.sub as string;

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { userId, fullName, email, role, statusActive, allowedModules, department, companyId } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerProfile, error: callerErr } = await perfilAtivo(authHeader, callerUserId, 'role, is_super_admin, company_id');
    if (callerErr || !callerProfile) {
      return new Response(JSON.stringify({ error: 'Perfil do solicitante não encontrado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const isAdmin = callerProfile.is_super_admin || callerProfile.role === 'admin' || callerProfile.role === 'super_admin';
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Permissão negada' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Um login pode ter vários acessos: edita só o da empresa certa.
    const acessos = await acessosDe(admin, userId);
    if (acessos.length === 0) {
      return new Response(JSON.stringify({ error: 'Usuário alvo não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let empresaAlvo: string | null = null;
    if (callerProfile.is_super_admin) {
      empresaAlvo = companyId
        ?? (acessos.some((a) => a.company_id === callerProfile.company_id) ? callerProfile.company_id : null)
        ?? (acessos.length === 1 ? acessos[0].company_id : null);
      if (empresaAlvo && !acessos.some((a) => a.company_id === empresaAlvo)) empresaAlvo = null;
      if (!empresaAlvo) {
        return new Response(JSON.stringify({ error: 'Usuário com mais de um acesso: informe a empresa.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      if (!acessos.some((a) => a.company_id === callerProfile.company_id) || (companyId && companyId !== callerProfile.company_id)) {
        return new Response(JSON.stringify({ error: 'Usuário de outra empresa' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      empresaAlvo = callerProfile.company_id;
    }

    const callerIsSuper = !!callerProfile.is_super_admin || callerProfile.role === 'super_admin';

    // Trava de escalonamento: só super admin concede/mantém super_admin em outro usuário
    // (mesma regra do create-user-v2, replicada aqui pro fluxo de edição).
    if (role === 'super_admin' && !callerIsSuper) {
      return new Response(JSON.stringify({ error: 'Apenas super admin pode conceder super_admin.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Trocar e-mail muda a credencial de login de alguém — só super admin, mesmo que o
    // caller seja admin da própria empresa (cliente abre chamado em Suporte pra isso).
    if (email && !callerIsSuper) {
      return new Response(JSON.stringify({ error: 'Apenas super admin pode alterar e-mail.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updatePayload: Record<string, unknown> = {
      full_name: fullName,
      role,
      status_active: statusActive,
      is_super_admin: role === 'super_admin',
      allowed_modules: allowedModules,
    };
    if (department !== undefined) {
      updatePayload.department = department;
    }

    if (email) {
      const { error: authEmailErr } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (authEmailErr) {
        return new Response(JSON.stringify({ error: 'Falha ao atualizar e-mail de login: ' + authEmailErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      updatePayload.email = email;
    }

    const { error: updErr } = await admin
      .from('profiles')
      .update(updatePayload)
      .eq('user_id', userId)
      .eq('company_id', empresaAlvo);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // E-mail é do login, não do acesso: vale em todas as linhas da pessoa.
    if (email && acessos.length > 1) {
      const { error: emailErr } = await admin.from('profiles').update({ email }).eq('user_id', userId);
      if (emailErr) {
        return new Response(JSON.stringify({ error: 'Acesso salvo, mas falhou repetir o e-mail nos outros acessos: ' + emailErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
