-- Sem conta escolhida na sessão, o acesso padrão passa a preferir um acesso ativo
-- (bloqueado num cliente não deve ser a conta de entrada). Só troca funções;
-- com 1 acesso por login o resultado é o mesmo.

create or replace function public.contexto_sessao(out o_uid uuid, out o_company uuid, out o_super boolean, out o_admin boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sid text;
begin
  if v_claims <> '' and current_setting('ca.ctx_chave', true) = v_claims then
    o_uid := nullif(current_setting('ca.ctx_uid', true), '')::uuid;
    o_company := nullif(current_setting('ca.ctx_company', true), '')::uuid;
    o_super := current_setting('ca.ctx_super', true) = 't';
    o_admin := current_setting('ca.ctx_admin', true) = 't';
    return;
  end if;
  o_uid := auth.uid();
  if o_uid is not null then
    v_sid := auth.jwt() ->> 'session_id';
    if v_sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select s.company_id into o_company
        from public.sessao_conta s
        join public.profiles p on p.user_id = s.user_id and p.company_id = s.company_id and p.status_active
       where s.session_id = v_sid::uuid and s.user_id = o_uid;
    end if;
    if o_company is null then
      select p.company_id into o_company from public.profiles p
       where p.user_id = o_uid order by status_active desc, acesso_padrao desc, created_at limit 1;
    end if;
    select coalesce(p.is_super_admin, false), coalesce(p.is_super_admin = true or p.role in ('admin','super_admin'), false)
      into o_super, o_admin
      from public.profiles p where p.user_id = o_uid and p.company_id = o_company;
  end if;
  o_super := coalesce(o_super, false);
  o_admin := coalesce(o_admin, false);
  if v_claims <> '' then
    perform set_config('ca.ctx_chave', v_claims, true);
    perform set_config('ca.ctx_uid', coalesce(o_uid::text, ''), true);
    perform set_config('ca.ctx_company', coalesce(o_company::text, ''), true);
    perform set_config('ca.ctx_super', case when o_super then 't' else 'f' end, true);
    perform set_config('ca.ctx_admin', case when o_admin then 't' else 'f' end, true);
  end if;
end;
$$;

create or replace function public.active_company_id()
returns uuid language sql stable security definer set search_path to 'public'
as $$ select (public.contexto_sessao()).o_company $$;

create or replace function public.get_user_company_id(_user_id uuid)
returns uuid language plpgsql stable security definer set search_path to 'public'
as $$
declare c record;
begin
  c := public.contexto_sessao();
  if _user_id is not distinct from c.o_uid and c.o_uid is not null then
    return c.o_company;
  end if;
  return (select company_id from public.profiles where user_id = _user_id order by status_active desc, acesso_padrao desc, created_at limit 1);
end $$;

create or replace function public.is_super_admin(_user_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $$
declare c record;
begin
  c := public.contexto_sessao();
  if _user_id is not distinct from c.o_uid and c.o_uid is not null then
    return c.o_super;
  end if;
  return coalesce((select is_super_admin from public.profiles where user_id = _user_id order by status_active desc, acesso_padrao desc, created_at limit 1), false);
end $$;

create or replace function public.is_company_admin(_user_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $$
declare c record;
begin
  c := public.contexto_sessao();
  if _user_id is not distinct from c.o_uid and c.o_uid is not null then
    return c.o_admin;
  end if;
  return coalesce((select (is_super_admin = true or role in ('admin','super_admin')) from public.profiles where user_id = _user_id order by status_active desc, acesso_padrao desc, created_at limit 1), false);
end $$;
