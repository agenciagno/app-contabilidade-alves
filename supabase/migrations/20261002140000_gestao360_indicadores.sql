-- Gestão 360° · Rodada 4 (02/10/2026): base de CA · Indicadores.
-- 1) carteira_snapshots: foto diária da carteira (contagens da empresa, sem custo no Serpro) para a evolução de 12 meses. Função SQL + pg_cron.
--    Só guarda o que o SQL calcula com a mesma regra do app (PGDAS-D em falta via serpro_pgdas_situacao, mensagens críticas, procuração, situação fiscal).
--    O histórico começa no dia em que a rotina foi ligada: nada é reconstruído para trás.
-- 2) metrica_mae: processos manuais eliminados no mês (métrica-mãe de operacao.md). Registrada à mão (o sistema não sabe contar sozinho): nada de número inventado.
-- 3) gestao360_indicadores_mensais(): quanto o sistema fez por mês no lugar da equipe (tarefas concluídas e criadas sozinhas, alertas, envios, relatórios).

create table public.carteira_snapshots (
  company_id uuid not null references public.companies(id) on delete cascade,
  dia date not null,
  monitorados integer not null,
  pgdas_clientes_em_falta integer not null,
  pgdas_competencias_em_falta integer not null,
  mensagens_clientes integer not null,
  sem_procuracao integer not null,
  sitfis_com_pendencia integer not null,
  criado_em timestamptz not null default now(),
  primary key (company_id, dia)
);
alter table public.carteira_snapshots enable row level security;
create policy "carteira_snapshots select equipe" on public.carteira_snapshots
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = carteira_snapshots.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
comment on table public.carteira_snapshots is 'Foto diária da carteira (contagens), gerada por gestao360_foto_diaria. Só a função grava.';

create or replace function public.gestao360_foto_diaria(p_hoje date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  v_fim date := (date_trunc('month', v_hoje) - interval '1 month')::date;     -- competência em aberto (mês anterior)
  v_ano integer := extract(year from v_fim)::integer;
  v_mes integer := extract(month from v_fim)::integer;
  v_da_ca text[] := array['26764962000100', '08801596000130'];
  v_monit integer; v_cli_falta integer; v_comp_falta integer; v_msgs integer; v_semproc integer; v_sitfis integer;
  v_total integer := 0;
begin
  for cfg in select company_id from public.serpro_config loop
    select count(*) into v_monit from public.contacts c
    where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and length(regexp_replace(c.document, '\D', '', 'g')) = 14
      and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca);

    select count(distinct x.id), count(*) into v_cli_falta, v_comp_falta from (
      select c.id from public.contacts c cross join generate_series(1, v_mes) m
      where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and c.tax_regime = 'simples_nacional'
        and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
        and public.serpro_pgdas_situacao(c.id, make_date(v_ano, m, 1), v_hoje) = 'em_falta'
    ) x;

    select count(distinct m.contact_id) into v_msgs
    from public.serpro_caixa_postal_mensagens m join public.contacts c on c.id = m.contact_id
    where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
      and m.categoria in ('intimacao', 'malha', 'exclusao_simples', 'maed', 'cobranca', 'processo') and m.situacao in ('nova', 'em_tratamento');

    select count(*) into v_semproc from public.contacts c
    where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and length(regexp_replace(c.document, '\D', '', 'g')) = 14
      and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
      and not exists (select 1 from public.serpro_procuracoes p where p.contact_id = c.id and p.codigo_procuracao = '00006' and p.status = 'ativa');

    select count(*) into v_sitfis from (
      select distinct on (s.contact_id) s.contact_id, s.resultado, s.confiavel
      from public.serpro_sitfis s join public.contacts c on c.id = s.contact_id
      where s.company_id = cfg.company_id and s.status = 'pronto' and c.status_cliente = 'Ativo'
      order by s.contact_id, s.gerado_em desc
    ) u where u.resultado = 'com_pendencias' and u.confiavel = true;

    insert into public.carteira_snapshots (company_id, dia, monitorados, pgdas_clientes_em_falta, pgdas_competencias_em_falta, mensagens_clientes, sem_procuracao, sitfis_com_pendencia)
    values (cfg.company_id, v_hoje, v_monit, v_cli_falta, v_comp_falta, v_msgs, v_semproc, v_sitfis)
    on conflict (company_id, dia) do update set monitorados = excluded.monitorados, pgdas_clientes_em_falta = excluded.pgdas_clientes_em_falta,
      pgdas_competencias_em_falta = excluded.pgdas_competencias_em_falta, mensagens_clientes = excluded.mensagens_clientes,
      sem_procuracao = excluded.sem_procuracao, sitfis_com_pendencia = excluded.sitfis_com_pendencia, criado_em = now();
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$;
revoke all on function public.gestao360_foto_diaria(date) from public, anon, authenticated;

create table public.metrica_mae (
  company_id uuid not null references public.companies(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  valor integer not null check (valor >= 0),
  nota text,
  registrado_por uuid,
  atualizado_em timestamptz not null default now(),
  primary key (company_id, mes)
);
alter table public.metrica_mae enable row level security;
create policy "metrica_mae select equipe" on public.metrica_mae
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = metrica_mae.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "metrica_mae insert admin" on public.metrica_mae
  for insert with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = metrica_mae.company_id and (p.is_super_admin = true or p.role = 'admin')));
create policy "metrica_mae update admin" on public.metrica_mae
  for update using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = metrica_mae.company_id and (p.is_super_admin = true or p.role = 'admin')))
  with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = metrica_mae.company_id and (p.is_super_admin = true or p.role = 'admin')));
comment on table public.metrica_mae is 'Métrica-mãe: processos manuais eliminados na CA no mês, registrada à mão por administrador.';

-- Trabalho do sistema por mês (últimos p_meses). Devolve [{metrica, mes, sub, n}]. Só equipe da empresa.
create or replace function public.gestao360_indicadores_mensais(p_meses integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_ini date;
  r jsonb;
begin
  select p.company_id into v_company from public.profiles p
  where p.user_id = (select auth.uid()) and (p.is_super_admin = true or p.role in ('admin', 'colaborador')) limit 1;
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
revoke all on function public.gestao360_indicadores_mensais(integer) from public, anon;
grant execute on function public.gestao360_indicadores_mensais(integer) to authenticated;
