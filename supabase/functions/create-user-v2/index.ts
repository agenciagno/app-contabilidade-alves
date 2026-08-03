import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) throw new Error('No auth header')

    const { data: { user }, error: ue } = await admin.auth.getUser(auth.replace('Bearer ', ''))
    if (ue || !user) throw new Error('Invalid token')

    const { data: caller, error: pe } = await admin
      .from('profiles')
      .select('role, is_super_admin, company_id')
      .eq('user_id', user.id)
      .single()

    const callerIsSuper = !!caller?.is_super_admin || caller?.role === 'super_admin'
    const callerIsAdmin = callerIsSuper || caller?.role === 'admin'

    // Admin do tenant OU super_admin podem criar usuarios (na propria empresa)
    if (pe || !callerIsAdmin) {
      throw new Error('Forbidden')
    }

    const body = await req.json()
    const { full_name, name, email, password, role, allowed_modules, department } = body
    const displayName = full_name || name || null

    // Trava de escalonamento: so super_admin concede super_admin
    let newRole = role || 'user'
    if (newRole === 'super_admin' && !callerIsSuper) {
      throw new Error('Apenas super admin pode conceder super_admin.')
    }

    const { data: created, error: ce } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (ce) throw new Error('Create failed: ' + ce.message)

    const { error: ie } = await admin.from('profiles').insert({
      user_id: created.user.id,
      full_name: displayName,
      email,
      role: newRole,
      is_super_admin: false,
      company_id: caller.company_id,
      allowed_modules: allowed_modules || [],
      department: department || null,
      status_active: true,
      force_password_change: true,
      password_changed_at: null,
    })

    if (ie) {
      await admin.auth.admin.deleteUser(created.user.id)
      throw new Error('Insert failed: ' + ie.message)
    }

    return new Response(
      JSON.stringify({ success: true, user_id: created.user.id }),
      { headers: { ...cors, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (e) {
    console.error('error:', e.message)
    return new Response(
      JSON.stringify({ error: e.message }),
      { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
