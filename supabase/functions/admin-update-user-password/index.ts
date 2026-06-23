import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BodySchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8).max(128),
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

    // Verify caller
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
    const { userId, newPassword } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify caller is admin/super_admin in same company as target user
    const { data: callerProfile, error: callerErr } = await admin
      .from('profiles')
      .select('role, is_super_admin, company_id')
      .eq('user_id', callerUserId)
      .single();
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

    if (!callerProfile.is_super_admin) {
      const { data: targetProfile, error: targetErr } = await admin
        .from('profiles')
        .select('company_id')
        .eq('user_id', userId)
        .single();
      if (targetErr || !targetProfile) {
        return new Response(JSON.stringify({ error: 'Usuário alvo não encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (targetProfile.company_id !== callerProfile.company_id) {
        return new Response(JSON.stringify({ error: 'Usuário de outra empresa' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
