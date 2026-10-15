-- 15/10/2026 (pedido de Gabriel): na lista "Portal" de "Adicionar acesso", poder renomear e excluir itens,
-- e cadastrar vários acessos do mesmo item para o mesmo cliente.
--   · Os 9 portais fixos (enum portal_tipo) passam a ter uma linha própria em acesso_tipos por empresa
--     (coluna nova `portal` = chave do portal fixo; nula = tipo criado pela equipe). Lista única.
--   · Todo acesso passa a ter tipo_id (backfill). acessos_portais.portal continua existindo e segue o tipo
--     (tipo fixo -> o próprio portal; tipo da equipe -> 'outros'), então nada que lê `portal` quebra.
--   · Renomear: update só da coluna nome. Excluir: não vale para Certificado Digital e Outros (o sistema depende deles).
--   · Índice único cliente+portal+tipo cai: o mesmo item pode ter vários acessos no cliente.
--   · excluir_tipo_acesso(): exclui o tipo e, se pedido, move antes os acessos para outro tipo (uma transação).
set local lock_timeout = '3s';

-- 1) Coluna e chave única do portal fixo
alter table public.acesso_tipos add column portal public.portal_tipo;
comment on column public.acesso_tipos.portal is 'Chave do portal fixo que esta linha representa (enum portal_tipo); nula = tipo criado pela equipe.';
create unique index acesso_tipos_empresa_portal_idx on public.acesso_tipos (company_id, portal) where portal is not null;

-- 2) Cria as linhas dos portais fixos de uma empresa (idempotente; nome ocupado por tipo da equipe ganha sufixo)
create or replace function public.garantir_tipos_fixos_acesso(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select * from (values
      ('gov_br'::public.portal_tipo, 'GOV.BR'),
      ('siare', 'SIARE (MG)'),
      ('ecac', 'eCac'),
      ('prefeitura_nfse', 'Prefeitura / NFS-e'),
      ('sefaz_estadual', 'SEFAZ Estadual'),
      ('certificado_digital', 'Certificado Digital'),
      ('esocial', 'e-Social'),
      ('conectividade_social', 'Conectividade Social'),
      ('outros', 'Outros')
    ) as v(portal, nome)
  loop
    continue when exists (select 1 from public.acesso_tipos where company_id = p_company and portal = r.portal);
    begin
      insert into public.acesso_tipos (company_id, nome, portal) values (p_company, r.nome, r.portal);
    exception when unique_violation then
      insert into public.acesso_tipos (company_id, nome, portal) values (p_company, r.nome || ' (padrão)', r.portal)
      on conflict do nothing;
    end;
  end loop;
end $$;
revoke all on function public.garantir_tipos_fixos_acesso(uuid) from public, anon, authenticated;

-- 3) Backfill: todas as empresas + acessos existentes apontam para o tipo do seu portal
select public.garantir_tipos_fixos_acesso(id) from public.companies;

update public.acessos_portais ap
   set tipo_id = t.id
  from public.acesso_tipos t
 where ap.tipo_id is null
   and t.company_id = ap.company_id
   and t.portal = ap.portal;

-- 4) Vários acessos do mesmo item por cliente
drop index public.acessos_portais_contact_portal_tipo_key;
create index acessos_portais_contact_tipo_idx on public.acessos_portais (contact_id, tipo_id);

-- 5) portal e tipo_id sempre alinhados (qualquer escritor: edge function, script, tela antiga)
create or replace function public.acessos_portais_alinha_tipo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tipo record;
  v_id uuid;
begin
  if new.tipo_id is not null then
    select t.company_id, t.portal into v_tipo from public.acesso_tipos t where t.id = new.tipo_id;
    if not found or v_tipo.company_id <> new.company_id then
      raise exception 'Tipo de acesso inválido.' using errcode = '23503';
    end if;
    new.portal := coalesce(v_tipo.portal, 'outros');
  else
    select t.id into v_id from public.acesso_tipos t where t.company_id = new.company_id and t.portal = new.portal;
    if v_id is null then
      perform public.garantir_tipos_fixos_acesso(new.company_id);
      select t.id into v_id from public.acesso_tipos t where t.company_id = new.company_id and t.portal = new.portal;
    end if;
    new.tipo_id := v_id;
  end if;
  return new;
end $$;
revoke all on function public.acessos_portais_alinha_tipo() from public, anon, authenticated;

create trigger trg_acessos_portais_alinha_tipo
  before insert or update of tipo_id, portal on public.acessos_portais
  for each row execute function public.acessos_portais_alinha_tipo();

-- 6) Empresa nova já nasce com a lista de portais
create or replace function public.companies_semeia_tipos_acesso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.garantir_tipos_fixos_acesso(new.id);
  return new;
end $$;
revoke all on function public.companies_semeia_tipos_acesso() from public, anon, authenticated;

create trigger trg_companies_semeia_tipos_acesso
  after insert on public.companies
  for each row execute function public.companies_semeia_tipos_acesso();

-- 7) Renomear e excluir (mesma regra do cofre; Certificado Digital e Outros não saem)
grant update (nome), delete on public.acesso_tipos to authenticated;

create policy "acesso_tipos update quem gerencia acessos" on public.acesso_tipos for update to authenticated
using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = acesso_tipos.company_id
            and (p.is_super_admin = true or p.role = 'admin' or 'acessos' = any (p.allowed_modules)))
) with check (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = acesso_tipos.company_id
            and (p.is_super_admin = true or p.role = 'admin' or 'acessos' = any (p.allowed_modules)))
);

create policy "acesso_tipos delete quem gerencia acessos" on public.acesso_tipos for delete to authenticated
using (
  (portal is null or portal not in ('certificado_digital', 'outros'))
  and exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = acesso_tipos.company_id
            and (p.is_super_admin = true or p.role = 'admin' or 'acessos' = any (p.allowed_modules)))
);

-- 8) Excluir tipo, movendo antes os acessos para outro tipo quando pedido. Roda com a permissão de quem chama (RLS).
create or replace function public.excluir_tipo_acesso(p_tipo uuid, p_mover_para uuid default null) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_tipo public.acesso_tipos;
  v_movidos integer := 0;
begin
  select * into v_tipo from public.acesso_tipos where id = p_tipo;
  if not found then
    raise exception 'Tipo de acesso não encontrado.' using errcode = 'P0002';
  end if;
  if v_tipo.portal in ('certificado_digital', 'outros') then
    raise exception 'Este tipo é usado pelo sistema e não pode ser excluído.' using errcode = '42501';
  end if;

  if p_mover_para is not null then
    if p_mover_para = p_tipo then
      raise exception 'Escolha outro tipo para receber os acessos.' using errcode = '22023';
    end if;
    perform 1 from public.acesso_tipos where id = p_mover_para and company_id = v_tipo.company_id;
    if not found then
      raise exception 'Tipo de destino inválido.' using errcode = '22023';
    end if;
    update public.acessos_portais set tipo_id = p_mover_para where tipo_id = p_tipo;
    get diagnostics v_movidos = row_count;
  end if;

  delete from public.acesso_tipos where id = p_tipo;
  if not found then
    raise exception 'Sem permissão para excluir este tipo.' using errcode = '42501';
  end if;
  return v_movidos;
end $$;
revoke all on function public.excluir_tipo_acesso(uuid, uuid) from public, anon;
grant execute on function public.excluir_tipo_acesso(uuid, uuid) to authenticated, service_role;
