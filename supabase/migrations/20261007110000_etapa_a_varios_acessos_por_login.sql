-- Etapa (a) da troca de conta: um login com vários acessos (um por empresa).
-- Desenho: _context/roadmap.md ("Trocar de conta") e reports/trocar-conta-auditoria-out2026.md.
--
-- A empresa ativa é amarrada à SESSÃO de login (auth.sessions), não ao usuário:
-- outro aparelho/navegador não muda no meio do uso. É lida no banco pelo
-- session_id do token e conferida contra profiles a cada consulta (acesso
-- revogado cai na hora). Sem escolha gravada, vale o acesso padrão.
--
-- Com 1 acesso por login (todos hoje), o comportamento é idêntico ao anterior.

-- 1. profiles vira "acessos": uma linha por (pessoa, empresa) -----------------
-- add column com default true marca as linhas atuais sem disparar UPDATE.
alter table public.profiles add column if not exists acesso_padrao boolean not null default true;
alter table public.profiles alter column acesso_padrao set default false;
create unique index if not exists profiles_um_acesso_padrao on public.profiles (user_id) where acesso_padrao;

alter table public.profiles drop constraint if exists profiles_user_id_key;
alter table public.profiles add constraint profiles_user_company_key unique (user_id, company_id);

-- 2. Empresa ativa por sessão ------------------------------------------------
create table if not exists public.sessao_conta (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists sessao_conta_user_idx on public.sessao_conta (user_id);
alter table public.sessao_conta enable row level security;
-- Sem policies: só as funções abaixo (security definer) leem e gravam.
revoke all on public.sessao_conta from anon, authenticated;

-- session_id do token, só se for um uuid válido (claim nunca quebra a consulta).
create or replace function public.jwt_session_id()
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select case
    when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (auth.jwt() ->> 'session_id')::uuid
  end
$$;

-- Contexto da sessão calculado 1x por requisição e guardado em variável local
-- da transação (chave = claims do token). As regras chamam estas funções linha
-- a linha; sem o cache o app ficava 8–20x mais lento (medido 06/10/2026).
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
       where p.user_id = o_uid order by acesso_padrao desc, created_at limit 1;
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

-- 3. Núcleo: as 135 regras que usam estas funções não mudam --------------------
-- Papel vale só na empresa ativa: a conta PF de um super admin não herda o poder.
create or replace function public.get_user_company_id(_user_id uuid)
returns uuid language plpgsql stable security definer set search_path to 'public'
as $$
declare c record;
begin
  c := public.contexto_sessao();
  if _user_id is not distinct from c.o_uid and c.o_uid is not null then
    return c.o_company;
  end if;
  return (select company_id from public.profiles where user_id = _user_id order by acesso_padrao desc, created_at limit 1);
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
  return coalesce((select is_super_admin from public.profiles where user_id = _user_id order by acesso_padrao desc, created_at limit 1), false);
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
  return coalesce((select (is_super_admin = true or role in ('admin','super_admin')) from public.profiles where user_id = _user_id order by acesso_padrao desc, created_at limit 1), false);
end $$;

create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select role from public.profiles
   where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid())
$$;

-- 4. profiles: cada pessoa só enxerga a própria linha da empresa ativa ---------
-- É isso que mantém certas as ~90 regras que consultam profiles direto.
drop policy if exists "Users can view profiles from their company" on public.profiles;
create policy "Users can view profiles from their company" on public.profiles
  for select
  using (
    (user_id = (select auth.uid()) and company_id = public.get_user_company_id((select auth.uid())))
    or (user_id <> (select auth.uid())
        and (company_id = public.get_user_company_id((select auth.uid()))
             or public.is_super_admin((select auth.uid()))))
  );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update
  using (user_id = (select auth.uid()) and company_id = public.get_user_company_id((select auth.uid())))
  with check (user_id = (select auth.uid()) and company_id = public.get_user_company_id((select auth.uid())));

-- Dados da pessoa (não do acesso) ficam iguais em todas as linhas dela.
create or replace function public.fn_sync_identidade_perfil()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if (new.full_name, new.first_name, new.last_name, new.avatar_url, new.phone, new.cpf)
     is distinct from
     (old.full_name, old.first_name, old.last_name, old.avatar_url, old.phone, old.cpf) then
    update public.profiles
       set full_name = new.full_name, first_name = new.first_name, last_name = new.last_name,
           avatar_url = new.avatar_url, phone = new.phone, cpf = new.cpf
     where user_id = new.user_id and id <> new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sync_identidade_perfil on public.profiles;
create trigger trg_sync_identidade_perfil
  after update on public.profiles
  for each row execute function public.fn_sync_identidade_perfil();

-- 4b. Notificações: cada conta vê só as suas --------------------------------
-- As "tarefa concluída" eram gravadas sem company_id (corrigido abaixo em
-- notify_task_completed); preenche as antigas pela tarefa.
update public.notifications n
   set company_id = t.company_id
  from public.fiscal_tasks t
 where n.company_id is null and n.task_id = t.id;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select
  using (user_id = (select auth.uid())
         and (company_id is null or company_id = public.get_user_company_id((select auth.uid()))));
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update
  using (user_id = (select auth.uid())
         and (company_id is null or company_id = public.get_user_company_id((select auth.uid()))));
drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete
  using (user_id = (select auth.uid())
         and (company_id is null or company_id = public.get_user_company_id((select auth.uid()))));

-- 5. Portal do Cliente (F6): estrutura pronta, ainda sem uso -------------------
-- Tabela própria, fora de profiles: um acesso de Portal nunca pode ser lido
-- como membro da empresa da CA pelas regras existentes.
create table if not exists public.portal_acessos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade, -- escritório
  contact_id uuid not null references public.contacts(id) on delete cascade,  -- cliente
  status_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, contact_id)
);
alter table public.portal_acessos enable row level security;
drop policy if exists "portal_acessos proprio" on public.portal_acessos;
create policy "portal_acessos proprio" on public.portal_acessos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_super_admin((select auth.uid())));
drop policy if exists "portal_acessos super admin escreve" on public.portal_acessos;
create policy "portal_acessos super admin escreve" on public.portal_acessos
  for all to authenticated
  using (public.is_super_admin((select auth.uid())))
  with check (public.is_super_admin((select auth.uid())));

-- 6. RPCs do seletor ------------------------------------------------------------
create or replace function public.meus_acessos()
returns table (tipo text, company_id uuid, contact_id uuid, nome text, documento text, papel text, atual boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select 'empresa'::text, c.id, c.contact_id, c.name::text, c.cnpj::text, p.role,
         c.id = public.active_company_id()
    from public.profiles p
    join public.companies c on c.id = p.company_id
   where p.user_id = auth.uid() and p.status_active and c.status = 'active'
  union all
  select 'portal'::text, pa.company_id, pa.contact_id, ct.name::text, ct.document::text, 'portal'::text, false
    from public.portal_acessos pa
    join public.contacts ct on ct.id = pa.contact_id
   where pa.user_id = auth.uid() and pa.status_active
  order by 1, 4
$$;

create or replace function public.trocar_conta(p_company_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := public.jwt_session_id();
begin
  if v_uid is null or v_sid is null then
    raise exception 'Sessão inválida.';
  end if;
  if not exists (select 1 from auth.sessions s where s.id = v_sid and s.user_id = v_uid) then
    raise exception 'Sessão inválida.';
  end if;
  if not exists (
    select 1 from public.profiles p
      join public.companies c on c.id = p.company_id
     where p.user_id = v_uid and p.company_id = p_company_id
       and p.status_active and coalesce(p.status, 'active') <> 'blocked'
       and c.status = 'active'
  ) then
    raise exception 'Você não tem acesso a esta conta.';
  end if;
  insert into public.sessao_conta (session_id, user_id, company_id, updated_at)
  values (v_sid, v_uid, p_company_id, now())
  on conflict (session_id) do update set company_id = excluded.company_id, updated_at = now();
  perform set_config('ca.ctx_chave', '', true);
  return p_company_id;
end;
$$;

revoke all on function public.jwt_session_id() from public, anon;
revoke all on function public.active_company_id() from public, anon;
revoke all on function public.contexto_sessao() from public, anon;
revoke all on function public.meus_acessos() from public, anon;
revoke all on function public.trocar_conta(uuid) from public, anon;
revoke all on function public.fn_sync_identidade_perfil() from public, anon, authenticated;
grant execute on function public.jwt_session_id() to authenticated, service_role;
grant execute on function public.active_company_id() to authenticated, service_role;
grant execute on function public.contexto_sessao() to authenticated, service_role;
grant execute on function public.meus_acessos() to authenticated;
grant execute on function public.trocar_conta(uuid) to authenticated;

-- 7. Funções que liam "meu perfil" com LIMIT 1 passam a ler o acesso ativo -----
-- agenda_receita_aprovar
CREATE OR REPLACE FUNCTION public.agenda_receita_aprovar(p_importacao_id uuid, p_tarefas integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super
  from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then
    raise exception 'Só administradores aprovam a agenda';
  end if;
  insert into public.agenda_receita_aprovacoes (importacao_id, company_id, aprovado_por, tarefas_criadas)
  values (p_importacao_id, v_company, auth.uid(), greatest(coalesce(p_tarefas, 0), 0))
  on conflict (importacao_id, company_id) do update
    set aprovado_por = excluded.aprovado_por, aprovado_em = now(),
        tarefas_criadas = public.agenda_receita_aprovacoes.tarefas_criadas + excluded.tarefas_criadas;
  return jsonb_build_object('ok', true);
end $function$;

-- agenda_receita_aprovar_e_lancar
CREATE OR REPLACE FUNCTION public.agenda_receita_aprovar_e_lancar(p_importacao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid; v_role text; v_super boolean; v_ano smallint; v_mes smallint; v_res jsonb; v_n integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores aprovam a agenda'; end if;
  select ano, mes into v_ano, v_mes from public.agenda_receita_importacoes where id = p_importacao_id;
  if v_ano is null then raise exception 'Agenda não encontrada'; end if;

  v_res := public.generate_monthly_fiscal_tasks(v_ano, v_mes, null, null, null);
  if coalesce((v_res->>'success')::boolean, false) is not true then raise exception 'Falha ao lançar: %', coalesce(v_res->>'error', 'erro desconhecido'); end if;
  v_n := coalesce((v_res->>'tasks_created')::integer, 0);

  insert into public.agenda_receita_aprovacoes (importacao_id, company_id, aprovado_por, tarefas_criadas)
  values (p_importacao_id, v_company, auth.uid(), v_n)
  on conflict (importacao_id, company_id) do update
    set aprovado_por = excluded.aprovado_por, aprovado_em = now(),
        tarefas_criadas = public.agenda_receita_aprovacoes.tarefas_criadas + excluded.tarefas_criadas;

  -- Cada responsável é avisado de quantas tarefas novas recebeu (tarefas criadas nesta transação).
  insert into public.notifications (user_id, company_id, type, title, body, action_url, reference_type)
  select p.user_id, v_company, 'calendar_generated', 'Calendário fiscal lançado',
         'Você recebeu ' || x.n || ' nova' || case when x.n = 1 then '' else 's' end || ' tarefa' || case when x.n = 1 then '' else 's' end
           || ' para ' || lpad(v_mes::text, 2, '0') || '/' || v_ano::text,
         '/fiscal/tarefas', 'fiscal_calendar'
  from (select ft.responsible_id, count(*) n from public.fiscal_tasks ft
        where ft.company_id = v_company and ft.created_at = now()
          and ft.calendar_id in (select id from public.fiscal_calendar where year = v_ano and month = v_mes)
        group by ft.responsible_id) x
  join public.profiles p on p.id = x.responsible_id
  where p.user_id is not null;

  return jsonb_build_object('ok', true, 'tarefas', v_n, 'ano', v_ano, 'mes', v_mes);
end $function$;

-- agenda_receita_desfazer
CREATE OR REPLACE FUNCTION public.agenda_receita_desfazer(p_importacao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid; v_role text; v_super boolean; v_ano smallint; v_mes smallint; v_removidas integer; v_preservadas integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores desfazem o lançamento'; end if;
  select ano, mes into v_ano, v_mes from public.agenda_receita_importacoes where id = p_importacao_id;
  if v_ano is null then raise exception 'Agenda não encontrada'; end if;

  with del as (
    delete from public.fiscal_tasks t
    where t.company_id = v_company and t.is_auto_generated = true and t.status = 'a_fazer'
      and t.updated_at - t.created_at < interval '2 seconds'
      and t.calendar_id in (select id from public.fiscal_calendar where year = v_ano and month = v_mes)
    returning 1)
  select count(*) into v_removidas from del;
  select count(*) into v_preservadas from public.fiscal_tasks t
    where t.company_id = v_company and t.calendar_id in (select id from public.fiscal_calendar where year = v_ano and month = v_mes);

  delete from public.agenda_receita_aprovacoes where importacao_id = p_importacao_id and company_id = v_company;
  return jsonb_build_object('ok', true, 'removidas', v_removidas, 'preservadas', v_preservadas);
end $function$;

-- agenda_receita_mapeamento_salvar
CREATE OR REPLACE FUNCTION public.agenda_receita_mapeamento_salvar(p_obligation_id uuid, p_tipo text, p_valor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_ok boolean; v_cod text[];
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores'; end if;
  select exists (select 1 from public.fiscal_obligations_catalog o where o.id = p_obligation_id and (o.company_id = v_company or v_super)) into v_ok;
  if not v_ok then raise exception 'Obrigação não encontrada'; end if;

  if p_tipo = 'regra' then
    delete from public.agenda_receita_mapeamento where obligation_id = p_obligation_id;
  elsif p_tipo = 'declaracao' then
    if coalesce(trim(p_valor), '') = '' then raise exception 'Informe como começa o nome da declaração na planilha (ex.: EFD-Reinf)'; end if;
    insert into public.agenda_receita_mapeamento (obligation_id, aba, campo, padrao, codigos, observacao)
    values (p_obligation_id, 'declaracoes', 'descricao', '^' || regexp_replace(trim(p_valor), '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), null, 'Declaração: ' || trim(p_valor))
    on conflict (obligation_id) do update set aba = excluded.aba, campo = excluded.campo, padrao = excluded.padrao, codigos = null, observacao = excluded.observacao;
  elsif p_tipo = 'codigos' then
    v_cod := array(select trim(x) from unnest(regexp_split_to_array(coalesce(p_valor, ''), '[,; ]+')) x where trim(x) <> '');
    if coalesce(array_length(v_cod, 1), 0) = 0 then raise exception 'Informe ao menos um código de receita (ex.: 8109, 2172)'; end if;
    insert into public.agenda_receita_mapeamento (obligation_id, aba, campo, padrao, codigos, observacao)
    values (p_obligation_id, 'tributos', 'codigo_receita', null, v_cod, 'Códigos de receita: ' || array_to_string(v_cod, ', '))
    on conflict (obligation_id) do update set aba = excluded.aba, campo = excluded.campo, padrao = null, codigos = excluded.codigos, observacao = excluded.observacao;
  else
    raise exception 'Tipo inválido';
  end if;
  return jsonb_build_object('ok', true);
end $function$;

-- fiscal_calendario_resumo
CREATE OR REPLACE FUNCTION public.fiscal_calendario_resumo(p_ano integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_obrig jsonb; v_clientes integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('obligation_id', x.obligation_id, 'lancadas', x.lancadas, 'a_lancar', x.a_lancar, 'sem_responsavel', x.sem_resp)), '[]'::jsonb)
    into v_obrig
  from (
    select fc.obligation_id,
      (select count(*) from public.fiscal_tasks ft where ft.company_id = v_company and ft.calendar_id = fc.id) as lancadas,
      (select count(*) from public.client_obligations co join public.contacts c on c.id = co.contact_id
        where co.obligation_id = fc.obligation_id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
          and public.fiscal_resp_do_setor(c, foc.department) is not null
          and not exists (select 1 from public.fiscal_tasks ft where ft.contact_id = c.id and ft.obligation_id = co.obligation_id
                          and ft.competence_year = fc.competence_year and ft.competence_month = fc.competence_month)) as a_lancar,
      (select count(*) from public.client_obligations co join public.contacts c on c.id = co.contact_id
        where co.obligation_id = fc.obligation_id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
          and public.fiscal_resp_do_setor(c, foc.department) is null
          and not exists (select 1 from public.fiscal_tasks ft where ft.contact_id = c.id and ft.obligation_id = co.obligation_id
                          and ft.competence_year = fc.competence_year and ft.competence_month = fc.competence_month)) as sem_resp
    from public.fiscal_calendar fc join public.fiscal_obligations_catalog foc on foc.id = fc.obligation_id
    where fc.year = p_ano and fc.month = p_mes
  ) x;

  select count(distinct c.id) into v_clientes
  from public.fiscal_calendar fc
  join public.fiscal_obligations_catalog foc on foc.id = fc.obligation_id
  join public.client_obligations co on co.obligation_id = fc.obligation_id
  join public.contacts c on c.id = co.contact_id
  where fc.year = p_ano and fc.month = p_mes and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
    and public.fiscal_resp_do_setor(c, foc.department) is not null
    and not exists (select 1 from public.fiscal_tasks ft where ft.contact_id = c.id and ft.obligation_id = co.obligation_id
                    and ft.competence_year = fc.competence_year and ft.competence_month = fc.competence_month);

  return jsonb_build_object('obrigacoes', v_obrig, 'clientes_a_lancar', v_clientes);
end $function$;

-- fiscal_cliente_obrigacao_alterar
CREATE OR REPLACE FUNCTION public.fiscal_cliente_obrigacao_alterar(p_contact_id uuid, p_obligation_id uuid, p_marcar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_ok boolean;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;
  select exists (select 1 from public.contacts c where c.id = p_contact_id and c.company_id = v_company) into v_ok;
  if not v_ok then raise exception 'Cliente não encontrado'; end if;
  select exists (select 1 from public.fiscal_obligations_catalog o where o.id = p_obligation_id and (o.company_id = v_company or o.company_id is null)) into v_ok;
  if not v_ok then raise exception 'Obrigação não encontrada'; end if;

  if p_marcar then
    insert into public.client_obligations (company_id, contact_id, obligation_id)
    select v_company, p_contact_id, p_obligation_id
    where not exists (select 1 from public.client_obligations co where co.contact_id = p_contact_id and co.obligation_id = p_obligation_id);
  else
    delete from public.client_obligations where contact_id = p_contact_id and obligation_id = p_obligation_id;
  end if;
  return jsonb_build_object('ok', true, 'card', public.fiscal_cliente_tarefas(p_contact_id, true));
end $function$;

-- fiscal_cliente_tarefas
CREATE OR REPLACE FUNCTION public.fiscal_cliente_tarefas(p_contact_id uuid, p_aplicar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid; v_role text; v_super boolean; v_c public.contacts;
  v_cal uuid[]; v_criar jsonb; v_remover jsonb; v_preservadas integer; v_datas jsonb;
  v_criadas integer := 0; v_removidas integer := 0; v_atualizadas integer := 0; m record; v_res jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;
  select * into v_c from public.contacts where id = p_contact_id;
  if v_c.id is null or v_c.company_id is distinct from v_company then raise exception 'Cliente não encontrado'; end if;

  select coalesce(array_agg(fc.id), array[]::uuid[]) into v_cal
  from public.fiscal_calendar fc
  join public.agenda_receita_importacoes i on i.ano = fc.year and i.mes = fc.month
  join public.agenda_receita_aprovacoes a on a.importacao_id = i.id and a.company_id = v_company
  where i.ano * 12 + i.mes >= extract(year from current_date)::int * 12 + extract(month from current_date)::int;

  if coalesce(array_length(v_cal, 1), 0) = 0 then
    return jsonb_build_object('mes_aprovado', false, 'ativo', v_c.is_active, 'criar', '[]'::jsonb, 'remover', '[]'::jsonb, 'datas', '[]'::jsonb,
                              'criadas', 0, 'removidas', 0, 'atualizadas', 0, 'preservadas', 0);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('obrigacao', foc.name, 'ano', fce.year, 'mes', fce.month, 'vencimento', fce.effective_due_date,
           'sem_responsavel', public.fiscal_resp_do_setor(v_c, foc.department) is null, 'setor', foc.department) order by fce.effective_due_date, foc.name), '[]'::jsonb)
    into v_criar
  from public.client_obligations co
  join public.fiscal_obligations_catalog foc on foc.id = co.obligation_id
  join public.fiscal_calendar_effective fce on fce.obligation_id = co.obligation_id and fce.id = any(v_cal)
  where co.contact_id = p_contact_id
    and not exists (select 1 from public.fiscal_tasks ft where ft.contact_id = co.contact_id and ft.obligation_id = co.obligation_id
                    and ft.competence_year = fce.competence_year and ft.competence_month = fce.competence_month);

  select coalesce(jsonb_agg(jsonb_build_object('obrigacao', foc.name, 'status', t.status, 'intocada', t.status = 'a_fazer' and t.updated_at - t.created_at < interval '2 seconds')), '[]'::jsonb)
    into v_remover
  from public.fiscal_tasks t join public.fiscal_obligations_catalog foc on foc.id = t.obligation_id
  where t.contact_id = p_contact_id and t.calendar_id = any(v_cal) and t.status <> 'concluido'
    and not exists (select 1 from public.client_obligations co where co.contact_id = t.contact_id and co.obligation_id = t.obligation_id);

  select coalesce(jsonb_agg(jsonb_build_object('obrigacao', foc.name, 'de', t.fiscal_due_date, 'para', fce.effective_due_date)), '[]'::jsonb)
    into v_datas
  from public.fiscal_tasks t
  join public.fiscal_calendar_effective fce on fce.id = t.calendar_id
  join public.fiscal_obligations_catalog foc on foc.id = t.obligation_id
  where t.contact_id = p_contact_id and t.calendar_id = any(v_cal) and t.status = 'a_fazer'
    and (t.due_date is distinct from fce.effective_delivery_date or t.fiscal_due_date is distinct from fce.effective_due_date)
    and exists (select 1 from public.client_obligations co where co.contact_id = t.contact_id and co.obligation_id = t.obligation_id);

  if p_aplicar then
    for m in select distinct fc.year, fc.month from public.fiscal_calendar fc where fc.id = any(v_cal) loop
      v_res := public.generate_monthly_fiscal_tasks(m.year, m.month, null, null, array[p_contact_id]);
      v_criadas := v_criadas + coalesce((v_res->>'tasks_created')::integer, 0);
    end loop;

    with del as (
      delete from public.fiscal_tasks t
      where t.contact_id = p_contact_id and t.calendar_id = any(v_cal) and t.status = 'a_fazer' and t.updated_at - t.created_at < interval '2 seconds'
        and not exists (select 1 from public.client_obligations co where co.contact_id = t.contact_id and co.obligation_id = t.obligation_id)
      returning 1)
    select count(*) into v_removidas from del;

    with upd as (
      update public.fiscal_tasks t
         set due_date = fce.effective_delivery_date, delivery_date = fce.effective_delivery_date, fiscal_due_date = fce.effective_due_date
        from public.fiscal_calendar_effective fce
       where fce.id = t.calendar_id and t.contact_id = p_contact_id and t.calendar_id = any(v_cal) and t.status = 'a_fazer'
         and (t.due_date is distinct from fce.effective_delivery_date or t.fiscal_due_date is distinct from fce.effective_due_date)
         and exists (select 1 from public.client_obligations co where co.contact_id = t.contact_id and co.obligation_id = t.obligation_id)
      returning 1)
    select count(*) into v_atualizadas from upd;
  end if;

  select count(*) into v_preservadas from jsonb_array_elements(v_remover) e where (e->>'intocada')::boolean is not true;

  return jsonb_build_object('mes_aprovado', true, 'ativo', v_c.is_active, 'criar', v_criar, 'remover', v_remover, 'datas', v_datas,
                            'preservadas', v_preservadas, 'aplicado', p_aplicar, 'criadas', v_criadas, 'removidas', v_removidas, 'atualizadas', v_atualizadas);
end $function$;

-- fiscal_clientes_sem_tarefas
CREATE OR REPLACE FUNCTION public.fiscal_clientes_sem_tarefas(p_ano integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('contact_id', x.id, 'nome', x.name, 'regime', x.tax_regime, 'faltando', x.faltando, 'sem_responsavel', x.sem_resp) order by x.name), '[]'::jsonb) into v_out
  from (
    select c.id, c.name, c.tax_regime,
      coalesce(array_agg(foc.name order by foc.name) filter (where public.fiscal_resp_do_setor(c, foc.department) is not null), array[]::text[]) faltando,
      coalesce(array_agg(foc.name order by foc.name) filter (where public.fiscal_resp_do_setor(c, foc.department) is null), array[]::text[]) sem_resp
    from public.contacts c
    join public.client_obligations co on co.contact_id = c.id
    join public.fiscal_obligations_catalog foc on foc.id = co.obligation_id
    join public.fiscal_calendar_effective fce on fce.obligation_id = co.obligation_id and fce.year = p_ano and fce.month = p_mes
    where c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
      and not exists (select 1 from public.fiscal_tasks ft where ft.contact_id = c.id and ft.obligation_id = co.obligation_id
                      and ft.competence_year = fce.competence_year and ft.competence_month = fce.competence_month)
    group by c.id, c.name, c.tax_regime
  ) x;
  return v_out;
end $function$;

-- fiscal_divergencias_receita
CREATE OR REPLACE FUNCTION public.fiscal_divergencias_receita()
 RETURNS TABLE(c_id uuid, o_id uuid, tipo text, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_iss uuid; v_icms uuid; v_sint uuid; v_sedif uuid; v_dm uuid;
begin
  select p.company_id into v_company from public.profiles p where p.user_id = auth.uid() and p.company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null then raise exception 'Sem permissão'; end if;
  select o.id into v_iss  from public.fiscal_obligations_catalog o where o.name = 'ISS' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_icms from public.fiscal_obligations_catalog o where o.name = 'ICMS' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_sint from public.fiscal_obligations_catalog o where o.name = 'SINTEGRA' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_sedif from public.fiscal_obligations_catalog o where o.name = 'SEDIF' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_dm   from public.fiscal_obligations_catalog o where o.name = 'Declaração Municipal' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;

  return query
  with base as (
    select c.id as cid,
      case when (c.cnae_principal->>'codigo') ~ '^[0-9]{2}' then left(c.cnae_principal->>'codigo', 2)::int end as dv,
      coalesce((select bool_or(left(s->>'codigo', 2)::int between 45 and 47 or left(s->>'codigo', 2)::int between 10 and 33 or left(s->>'codigo', 2)::int = 56)
                from jsonb_array_elements(coalesce(c.cnaes_secundarios, '[]'::jsonb)) s where (s->>'codigo') ~ '^[0-9]{2}'), false) as sec_merc,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_iss)   as m_iss,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_icms)  as m_icms,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_sint)  as m_sint,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_sedif) as m_sedif,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_dm)    as m_dm
    from public.contacts c
    where c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[])) and c.tax_regime = 'simples_nacional'
  ), ult as (
    select distinct on (f.contact_id) f.contact_id as cid, f.periodo_apuracao, f.rpa_total, f.dados
    from public.serpro_faturamento f where f.company_id = v_company and f.confiavel
    order by f.contact_id, f.periodo_apuracao desc
  ), ev as (
    select u.cid, to_char(u.periodo_apuracao, 'MM/YYYY') as mes,
      coalesce(bool_or(coalesce((x->'tributos'->>'iss')::numeric, 0) > 0 or (x->>'iss_retido') = 'true'), false) as tem_iss,
      coalesce(bool_or(coalesce((x->'tributos'->>'icms')::numeric, 0) > 0 or (x->>'st_ou_monofasico') = 'true'
                       or ((x->>'tipo') = 'outro' and (x->>'descricao') ilike '%transporte%')), false) as tem_icms,
      coalesce(bool_or((x->>'tipo') in ('revenda', 'industrializacao')), false) as tem_merc
    from ult u cross join lateral jsonb_array_elements(coalesce(u.dados->'atividades', '[]'::jsonb)) x
    where u.rpa_total > 0
    group by u.cid, u.periodo_apuracao
  ), r as (
    select b.cid, v_iss as oid,
      case when b.m_iss and not e.tem_iss then 'sobra' when not b.m_iss and e.tem_iss then 'falta' end as tipo,
      case when b.m_iss and not e.tem_iss then 'Sem ISS na declaração de ' || e.mes else 'Paga ou tem ISS retido na declaração de ' || e.mes end as motivo
    from base b join ev e on e.cid = b.cid
    union all
    select b.cid, v_icms,
      case when b.m_icms and not e.tem_icms then (case when b.dv in (45, 46, 47, 56) or b.dv between 10 and 33 or b.sec_merc or e.tem_merc then 'revisar' else 'sobra' end)
           when not b.m_icms and e.tem_icms then 'falta' end,
      case when b.m_icms and not e.tem_icms then 'Sem ICMS nem substituição tributária na declaração de ' || e.mes
                                                  || case when b.dv in (45, 46, 47, 56) or b.dv between 10 and 33 or b.sec_merc or e.tem_merc then ' (CNAE ou venda de mercadoria: confira)' else '' end
           else 'ICMS ou substituição tributária na declaração de ' || e.mes end
    from base b join ev e on e.cid = b.cid
    union all
    select b.cid, v_sint,
      case when b.m_sint and not b.m_icms then 'sobra' when b.m_icms and not b.m_sint then 'falta' end,
      case when b.m_sint and not b.m_icms then 'Cliente sem a obrigação ICMS' else 'Cliente com ICMS e sem SINTEGRA' end
    from base b
    union all
    select b.cid, v_sedif,
      case when b.m_sedif and not b.m_icms then 'sobra' when b.m_icms and not b.m_sedif then 'falta' end,
      case when b.m_sedif and not b.m_icms then 'Cliente sem a obrigação ICMS' else 'Cliente com ICMS e sem SEDIF' end
    from base b
    union all
    select b.cid, v_dm,
      case when b.m_dm and not b.m_iss then 'sobra' when b.m_iss and not b.m_dm then 'falta' end,
      case when b.m_dm and not b.m_iss then 'Cliente sem a obrigação ISS' else 'Cliente com ISS e sem Declaração Municipal' end
    from base b
  )
  select r.cid, r.oid, r.tipo, r.motivo from r where r.tipo is not null and r.oid is not null;
end $function$;

-- fiscal_lancar_candidatos
CREATE OR REPLACE FUNCTION public.fiscal_lancar_candidatos(p_ano integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores lançam tarefas'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', x.id, 'nome', x.nome, 'documento', x.document, 'regime', x.tax_regime, 'status_cliente', x.status_cliente, 'obrigacoes', x.obrigacoes
         ) order by x.nome), '[]'::jsonb) into v_out
  from (
    select c.id, c.document, c.tax_regime, c.status_cliente,
      coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(c.nome_fantasia), ''), nullif(btrim(c.razao_social), ''), c.name) as nome,
      jsonb_agg(jsonb_build_object(
        'obligation_id', foc.id, 'nome', foc.name, 'vencimento', fce.effective_due_date,
        'lancada', exists (select 1 from public.fiscal_tasks ft where ft.contact_id = c.id and ft.obligation_id = co.obligation_id
                           and ft.competence_year = fce.competence_year and ft.competence_month = fce.competence_month),
        'sem_responsavel', public.fiscal_resp_do_setor(c, foc.department) is null
      ) order by fce.effective_due_date, foc.name) as obrigacoes
    from public.contacts c
    join public.client_obligations co on co.contact_id = c.id
    join public.fiscal_obligations_catalog foc on foc.id = co.obligation_id
    join public.fiscal_calendar_effective fce on fce.obligation_id = co.obligation_id and fce.year = p_ano and fce.month = p_mes
    where c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
    group by c.id, c.document, c.tax_regime, c.status_cliente, c.display_name, c.nome_fantasia, c.razao_social, c.name
  ) x;
  return v_out;
end $function$;

-- fiscal_lancar_tarefas_clientes
CREATE OR REPLACE FUNCTION public.fiscal_lancar_tarefas_clientes(p_ano integer, p_mes integer, p_contact_ids uuid[], p_obligation_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_res jsonb; v_n integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores lançam tarefas'; end if;
  if coalesce(array_length(p_contact_ids, 1), 0) = 0 or coalesce(array_length(p_obligation_ids, 1), 0) = 0 then
    raise exception 'Escolha ao menos um cliente e uma obrigação';
  end if;

  v_res := public.generate_monthly_fiscal_tasks(p_ano, p_mes, null, null, p_contact_ids, p_obligation_ids);
  if coalesce((v_res->>'success')::boolean, false) is not true then raise exception 'Falha ao lançar: %', coalesce(v_res->>'error', 'erro desconhecido'); end if;
  v_n := coalesce((v_res->>'tasks_created')::integer, 0);

  insert into public.notifications (user_id, company_id, type, title, body, action_url, reference_type)
  select p.user_id, v_company, 'calendar_generated', 'Novas tarefas fiscais',
         'Você recebeu ' || x.n || ' nova' || case when x.n = 1 then '' else 's' end || ' tarefa' || case when x.n = 1 then '' else 's' end
           || ' para ' || lpad(p_mes::text, 2, '0') || '/' || p_ano::text,
         '/fiscal/tarefas', 'fiscal_calendar'
  from (select ft.responsible_id, count(*) n from public.fiscal_tasks ft
        where ft.company_id = v_company and ft.created_at = now()
          and ft.calendar_id in (select id from public.fiscal_calendar where year = p_ano and month = p_mes)
        group by ft.responsible_id) x
  join public.profiles p on p.id = x.responsible_id
  where p.user_id is not null;

  return jsonb_build_object('ok', true, 'criadas', v_n);
end $function$;

-- fiscal_obrigacao_clientes
CREATE OR REPLACE FUNCTION public.fiscal_obrigacao_clientes(p_obligation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb; v_div jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;

  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_div from public.fiscal_divergencias_receita() d where d.o_id = p_obligation_id;

  select coalesce(jsonb_agg(jsonb_build_object('contact_id', x.id, 'nome', x.name, 'regime', x.tax_regime, 'marcada', x.marcada, 'divergencia', x.tipo, 'motivo', x.motivo)
           order by (x.tipo is null), x.name), '[]'::jsonb) into v_out
  from (
    select c.id, c.name, c.tax_regime, true as marcada, d.tipo, d.motivo
    from public.client_obligations co join public.contacts c on c.id = co.contact_id
    left join jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) on d.c_id = c.id
    where co.obligation_id = p_obligation_id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
    union all
    select c.id, c.name, c.tax_regime, false, d.tipo, d.motivo
    from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) join public.contacts c on c.id = d.c_id
    where d.tipo = 'falta' and not exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = p_obligation_id)
  ) x;
  return v_out;
end $function$;

-- fiscal_obrigacoes_resumo
CREATE OR REPLACE FUNCTION public.fiscal_obrigacoes_resumo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb; v_cli_div integer; v_receita integer; v_sem integer; v_div jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;

  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_div from public.fiscal_divergencias_receita() d;

  select coalesce(jsonb_agg(jsonb_build_object(
      'obligation_id', o.id,
      'clientes', (select count(*) from public.client_obligations co join public.contacts c on c.id = co.contact_id
                    where co.obligation_id = o.id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))),
      'abertas', (select count(*) from public.fiscal_tasks t where t.company_id = v_company and t.obligation_id = o.id and t.status in ('a_fazer', 'em_progresso', 'aguardando_cliente')),
      'divergencias', (select count(*) from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) where d.o_id = o.id and d.tipo in ('falta', 'sobra')),
      'revisar', (select count(*) from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) where d.o_id = o.id and d.tipo = 'revisar'),
      'proximo_data', (select min(fce.effective_due_date) from public.fiscal_calendar_effective fce where fce.obligation_id = o.id and fce.effective_due_date >= current_date),
      'proximo_fonte', (select fce.fonte from public.fiscal_calendar_effective fce where fce.obligation_id = o.id and fce.effective_due_date >= current_date order by fce.effective_due_date limit 1),
      'tem_mapeamento', exists (select 1 from public.agenda_receita_mapeamento m where m.obligation_id = o.id)
    )), '[]'::jsonb) into v_out
  from public.fiscal_obligations_catalog o where o.company_id = v_company or o.company_id is null;

  select count(distinct d.c_id) into v_cli_div from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) where d.tipo in ('falta', 'sobra');
  select count(*) into v_receita from public.fiscal_obligations_catalog o where o.active and (o.company_id = v_company or o.company_id is null)
    and exists (select 1 from public.agenda_receita_mapeamento m where m.obligation_id = o.id);
  select count(*) into v_sem from public.fiscal_obligations_catalog o where o.active and (o.company_id = v_company or o.company_id is null)
    and not exists (select 1 from public.client_obligations co join public.contacts c on c.id = co.contact_id
                    where co.obligation_id = o.id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[])));

  return jsonb_build_object('obrigacoes', v_out, 'clientes_com_divergencia', v_cli_div, 'com_data_receita', v_receita, 'sem_clientes', v_sem);
end $function$;

-- fn_audit_trigger
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_campos text[];
  v_nome   text;
BEGIN
  SELECT full_name INTO v_nome
  FROM public.profiles WHERE user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_eventos
      (tabela, registro_id, operacao, dados_anteriores, dados_novos, campos_alterados, usuario_id, usuario_nome)
    VALUES
      (TG_TABLE_NAME, NEW.id, 'INSERT', NULL, to_jsonb(NEW), NULL, auth.uid(), COALESCE(v_nome, 'sistema'));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key) INTO v_campos
    FROM jsonb_each(to_jsonb(NEW)) n
    WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
      AND n.key <> 'updated_at';

    IF v_campos IS NOT NULL AND array_length(v_campos, 1) > 0 THEN
      INSERT INTO public.historico_eventos
        (tabela, registro_id, operacao, dados_anteriores, dados_novos, campos_alterados, usuario_id, usuario_nome)
      VALUES
        (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_campos, auth.uid(), COALESCE(v_nome, 'sistema'));
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.historico_eventos
      (tabela, registro_id, operacao, dados_anteriores, dados_novos, campos_alterados, usuario_id, usuario_nome)
    VALUES
      (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), NULL, NULL, auth.uid(), COALESCE(v_nome, 'sistema'));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

-- fn_block_email_change
CREATE OR REPLACE FUNCTION public.fn_block_email_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid())
        AND (is_super_admin = true OR role = 'admin')
    ) THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o e-mail de acesso.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- generate_monthly_fiscal_tasks
CREATE OR REPLACE FUNCTION public.generate_monthly_fiscal_tasks(p_year integer, p_month integer, p_tax_regimes text[] DEFAULT NULL::text[], p_responsible_ids uuid[] DEFAULT NULL::uuid[], p_contact_ids uuid[] DEFAULT NULL::uuid[], p_obligation_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_tasks_created int := 0;
BEGIN
  SELECT company_id INTO v_company_id FROM public.profiles WHERE user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) LIMIT 1;
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário sem empresa associada');
  END IF;

  INSERT INTO public.fiscal_tasks (
    company_id, contact_id, obligation_id, calendar_id, competence_year, competence_month, title,
    due_date, delivery_date, fiscal_due_date, responsible_id, department, is_auto_generated, status
  )
  SELECT
    v_company_id, src.contact_id, src.obligation_id, src.calendar_id, src.competence_year, src.competence_month, src.title,
    src.due_date, src.delivery_date, src.fiscal_due_date, src.effective_responsible_id, src.department, true, 'a_fazer'
  FROM (
    SELECT
      co.contact_id, co.obligation_id, fce.id AS calendar_id, fce.competence_year, fce.competence_month,
      foc.name || ' - Competência ' || LPAD(fce.competence_month::text, 2, '0') || '/' || fce.competence_year::text AS title,
      fce.effective_delivery_date AS due_date,
      fce.effective_delivery_date AS delivery_date,
      fce.effective_due_date      AS fiscal_due_date,
      foc.department              AS department,
      CASE foc.department
        WHEN 'pessoal'    THEN c.dp_responsible_id
        WHEN 'financeiro' THEN c.financeiro_responsible_id
        WHEN 'contabil'   THEN c.contabil_responsible_id
        WHEN 'comercial'  THEN c.comercial_responsible_id
        ELSE c.responsible_id
      END AS dept_responsible_id,
      public.get_effective_responsible(
        CASE foc.department
          WHEN 'pessoal'    THEN c.dp_responsible_id
          WHEN 'financeiro' THEN c.financeiro_responsible_id
          WHEN 'contabil'   THEN c.contabil_responsible_id
          WHEN 'comercial'  THEN c.comercial_responsible_id
          ELSE c.responsible_id
        END,
        CURRENT_DATE
      ) AS effective_responsible_id
    FROM public.client_obligations co
    JOIN public.contacts c
      ON c.id = co.contact_id AND c.company_id = v_company_id AND c.is_active = true
     AND 'cliente' = ANY (COALESCE(c.categorias, ARRAY['outros']::text[]))
     AND (p_tax_regimes IS NULL OR c.tax_regime = ANY(p_tax_regimes))
     AND (p_contact_ids IS NULL OR c.id = ANY(p_contact_ids))
    JOIN public.fiscal_obligations_catalog foc ON foc.id = co.obligation_id AND (p_obligation_ids IS NULL OR co.obligation_id = ANY(p_obligation_ids))
    JOIN public.fiscal_calendar_effective fce
      ON fce.obligation_id = co.obligation_id AND fce.year = p_year AND fce.month = p_month
  ) src
  WHERE src.dept_responsible_id IS NOT NULL
    AND (p_responsible_ids IS NULL OR src.effective_responsible_id = ANY(p_responsible_ids))
    AND NOT EXISTS (
      SELECT 1 FROM public.fiscal_tasks ft
      WHERE ft.contact_id = src.contact_id AND ft.obligation_id = src.obligation_id
        AND ft.competence_year = src.competence_year AND ft.competence_month = src.competence_month
    );

  GET DIAGNOSTICS v_tasks_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true, 'tasks_created', v_tasks_created,
    'period', LPAD(p_month::text, 2, '0') || '/' || p_year::text,
    'tax_regimes', p_tax_regimes, 'responsible_ids', p_responsible_ids, 'contact_ids', p_contact_ids, 'obligation_ids', p_obligation_ids
  );
END;
$function$;

-- gestao360_indicadores_mensais
CREATE OR REPLACE FUNCTION public.gestao360_indicadores_mensais(p_meses integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_ini date;
  r jsonb;
begin
  select p.company_id into v_company from public.profiles p
  where p.user_id = (select auth.uid()) and p.company_id = public.get_user_company_id(auth.uid()) and (p.is_super_admin = true or p.role in ('admin', 'colaborador')) limit 1;
  if v_company is null then return null; end if;
  v_ini := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - make_interval(months => greatest(p_meses, 1) - 1))::date;

  select coalesce(jsonb_agg(jsonb_build_object('metrica', u.metrica, 'mes', u.mes, 'sub', u.sub, 'n', u.n)), '[]'::jsonb) into r from (
    select 'auto_concluidas' as metrica, to_char(t.updated_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, null::text as sub, count(*) as n
    from public.fiscal_tasks t
    where t.company_id = v_company and t.status = 'concluido' and t.completion_notes like 'Concluída automaticamente%' and t.updated_at >= v_ini
    group by 2
    union all
    select 'auto_criadas', to_char(t.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM'), null, count(*)
    from public.fiscal_tasks t
    where t.company_id = v_company and t.is_auto_generated = true and (t.title like 'Receita Federal —%' or t.title like 'Parcelamento —%') and t.created_at >= v_ini
    group by 2
    union all
    select 'alertas', to_char(a.enviado_em at time zone 'America/Sao_Paulo', 'YYYY-MM'), null, count(*)
    from public.alerta_enviados a where a.company_id = v_company and a.enviado_em >= v_ini group by 2
    union all
    select 'envios', to_char(e.enviado_em at time zone 'America/Sao_Paulo', 'YYYY-MM'), e.canal, count(*)
    from public.client_envios e where e.company_id = v_company and e.enviado_em >= v_ini group by 2, 3
    union all
    select 'relatorios', to_char(g.gerado_em at time zone 'America/Sao_Paulo', 'YYYY-MM'), g.tipo, count(*)
    from public.client_relatorios g where g.company_id = v_company and g.gerado_em >= v_ini group by 2, 3
  ) u;
  return r;
end;
$function$;

-- revert_transfer
CREATE OR REPLACE FUNCTION public.revert_transfer(p_transfer_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_log          public.transfer_log%ROWTYPE;
  v_reverted_by  uuid;
  v_company_id   uuid;
  v_is_admin     boolean;
BEGIN
  SELECT id, company_id, (is_super_admin OR role IN ('admin','super_admin'))
  INTO v_reverted_by, v_company_id, v_is_admin
  FROM public.profiles WHERE user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) LIMIT 1;

  IF v_company_id IS NULL OR NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem reverter transferências.');
  END IF;

  SELECT * INTO v_log FROM public.transfer_log WHERE id = p_transfer_log_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Log de transferência não encontrado');
  END IF;

  IF v_log.company_id <> v_company_id AND NOT public.is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transferência de outra empresa');
  END IF;

  IF v_log.reverted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta transferência já foi revertida');
  END IF;

  UPDATE public.contacts SET responsible_id = v_log.from_profile_id WHERE id = ANY(v_log.contact_ids);
  UPDATE public.fiscal_tasks SET responsible_id = v_log.from_profile_id
  WHERE id = ANY(v_log.task_ids) AND status != 'concluido';
  UPDATE public.transfer_log SET reverted_at = now(), reverted_by = v_reverted_by WHERE id = p_transfer_log_id;

  RETURN jsonb_build_object('success', true, 'contacts_reverted', coalesce(array_length(v_log.contact_ids, 1), 0));
END;
$function$;

-- transfer_clients_with_log
CREATE OR REPLACE FUNCTION public.transfer_clients_with_log(p_from_profile_id uuid, p_to_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id      uuid;
  v_transferred_by  uuid;
  v_is_admin        boolean;
  v_contact_ids     uuid[];
  v_task_ids        uuid[];
BEGIN
  SELECT id, company_id, (is_super_admin OR role IN ('admin','super_admin'))
  INTO v_transferred_by, v_company_id, v_is_admin
  FROM public.profiles
  WHERE user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid())
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário sem empresa associada');
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem transferir carteira.');
  END IF;

  SELECT array_agg(id) INTO v_contact_ids
  FROM public.contacts
  WHERE responsible_id = p_from_profile_id AND is_active = true AND company_id = v_company_id;

  SELECT array_agg(id) INTO v_task_ids
  FROM public.fiscal_tasks
  WHERE responsible_id = p_from_profile_id AND status != 'concluido' AND company_id = v_company_id;

  UPDATE public.contacts SET responsible_id = p_to_profile_id
  WHERE responsible_id = p_from_profile_id AND is_active = true AND company_id = v_company_id;

  UPDATE public.fiscal_tasks SET responsible_id = p_to_profile_id
  WHERE responsible_id = p_from_profile_id AND status != 'concluido' AND company_id = v_company_id;

  INSERT INTO public.transfer_log (company_id, from_profile_id, to_profile_id, contact_ids, task_ids, transferred_by)
  VALUES (v_company_id, p_from_profile_id, p_to_profile_id,
          COALESCE(v_contact_ids, '{}'), COALESCE(v_task_ids, '{}'), v_transferred_by);

  RETURN jsonb_build_object('success', true,
    'contacts_transferred', coalesce(array_length(v_contact_ids, 1), 0),
    'tasks_transferred',    coalesce(array_length(v_task_ids, 1), 0));
END;
$function$;

-- notify_task_completed (grava company_id no aviso)
CREATE OR REPLACE FUNCTION public.notify_task_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  task_responsible_name text;
  contact_name text;
  obligation_code text;
begin
  if NEW.status = 'concluido' and OLD.status != 'concluido' then
    NEW.completed_at := now();

    if auth.uid() is null and coalesce(NEW.completion_notes, '') like 'Concluída automaticamente%' then
      return NEW;
    end if;

    select full_name into task_responsible_name from public.profiles where id = NEW.responsible_id;
    select name into contact_name from public.contacts where id = NEW.contact_id;
    select code into obligation_code from public.fiscal_obligations_catalog where id = NEW.obligation_id;

    insert into public.notifications (user_id, company_id, task_id, type, title, body, action_url)
    select
      p.user_id,
      NEW.company_id,
      NEW.id,
      'task_completed',
      '✅ Tarefa concluída',
      coalesce(obligation_code, NEW.title) || ' — ' || coalesce(contact_name, 'Cliente') ||
      case when auth.uid() is null then ' (automático: Receita)'
           else ' (por ' || coalesce(task_responsible_name, 'Colaborador') || ')' end,
      '/fiscal/tarefas'
    from public.profiles p
    where p.company_id = NEW.company_id
      and p.role = 'admin'
      and p.status_active = true;
  end if;
  return NEW;
end;
$function$;
