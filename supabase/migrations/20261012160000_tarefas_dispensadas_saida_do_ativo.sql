-- 12/10/2026 (pedido de Gabriel, bloco D): sair do "Ativo" apaga as tarefas do cliente e elas NÃO voltam ao retornar; só a próxima geração
-- do calendário inclui o cliente de novo.
--   · fiscal_tarefas_dispensadas: o que foi apagado ou deixou de ser gerado por causa do status (cliente, obrigação, competência, vencimento,
--     status, período e cópia da tarefa em `tarefa`, que permite restaurar). Também é a prova de "não entregue porque estava fora do Ativo".
--   · Saída do Ativo (qualquer status fora dele, inclusive Baixada e Ex-cliente; troca manual ou vinda da Receita): apaga tarefa a_fazer e
--     aguardando_cliente com obrigação; concluída fica (histórico); em_progresso fica e o responsável é avisado.
--   · Volta ao Ativo: nada é recriado. Os meses já gerados sem o cliente (do mês atual em diante) viram "dispensados", para o botão
--     "Atualizar card", a Salvar do cadastro e o painel "Clientes sem tarefas" não trazerem a tarefa de volta.
--   · "Lançar tarefa" à mão (admin) continua podendo criar, e apaga a dispensa correspondente.
--   · Desfazer o lançamento do mês apaga as dispensas daquele mês.
--   · Limpeza única das tarefas abertas de clientes que hoje estão fora do Ativo. Edmilson de Souza (Baixada, 21 tarefas) fica de fora: a
--     limpeza de 06/10/2026 o manteve de propósito; Gabriel decide.
set local lock_timeout = '3s';

create table public.fiscal_tarefas_dispensadas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  obligation_id uuid not null references public.fiscal_obligations_catalog(id) on delete cascade,
  calendar_id uuid references public.fiscal_calendar(id) on delete set null,
  competence_year smallint not null,
  competence_month smallint not null,
  due_date date,
  motivo text not null check (motivo in ('saiu_do_ativo', 'mes_ja_gerado_sem_o_cliente', 'limpeza')),
  status_cliente text,
  periodo_id uuid references public.cliente_status_periodos(id) on delete set null,
  tarefa jsonb,
  created_at timestamptz not null default now(),
  constraint fiscal_tarefas_dispensadas_unica unique (contact_id, obligation_id, competence_year, competence_month)
);
comment on table public.fiscal_tarefas_dispensadas is
  'Tarefas apagadas ou nunca geradas por o cliente estar fora do Ativo. Só os triggers e funções fiscal_dispensar_* gravam. tarefa = cópia da linha apagada.';
create index fiscal_tarefas_dispensadas_contact_idx on public.fiscal_tarefas_dispensadas (contact_id, competence_year desc, competence_month desc);
create index fiscal_tarefas_dispensadas_calendar_idx on public.fiscal_tarefas_dispensadas (calendar_id) where calendar_id is not null;
create index fiscal_tarefas_dispensadas_periodo_idx on public.fiscal_tarefas_dispensadas (periodo_id) where periodo_id is not null;

alter table public.fiscal_tarefas_dispensadas enable row level security;
create policy "fiscal_tarefas_dispensadas select equipe" on public.fiscal_tarefas_dispensadas for select to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = fiscal_tarefas_dispensadas.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador'])))
);
revoke all on public.fiscal_tarefas_dispensadas from anon;
revoke insert, update, delete on public.fiscal_tarefas_dispensadas from authenticated;

-- Apaga as tarefas abertas do cliente e guarda cada uma como dispensada. Security definer: nunca exposta por RPC.
create or replace function public.fiscal_dispensar_tarefas_cliente(p_contact uuid, p_motivo text default 'saiu_do_ativo')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_c public.contacts; v_periodo uuid; v_apagadas integer := 0; v_andamento integer := 0;
begin
  select * into v_c from public.contacts where id = p_contact;
  if v_c.id is null then return jsonb_build_object('apagadas', 0, 'em_andamento', 0); end if;
  select id into v_periodo from public.cliente_status_periodos where contact_id = p_contact and fim is null;

  with del as (
    delete from public.fiscal_tasks t
     where t.contact_id = p_contact and t.obligation_id is not null
       and t.competence_year is not null and t.competence_month is not null
       and t.status in ('a_fazer', 'aguardando_cliente')
    returning t.*
  ), ins as (
    insert into public.fiscal_tarefas_dispensadas
      (company_id, contact_id, obligation_id, calendar_id, competence_year, competence_month, due_date, motivo, status_cliente, periodo_id, tarefa)
    select d.company_id, d.contact_id, d.obligation_id, d.calendar_id, d.competence_year, d.competence_month,
           coalesce(d.fiscal_due_date, d.due_date), p_motivo, v_c.status_cliente, v_periodo, to_jsonb(d)
      from del d
    on conflict (contact_id, obligation_id, competence_year, competence_month)
      do update set tarefa = excluded.tarefa, motivo = excluded.motivo, status_cliente = excluded.status_cliente, periodo_id = excluded.periodo_id
    returning 1
  )
  select count(*) into v_apagadas from del;

  select count(*) into v_andamento from public.fiscal_tasks t
   where t.contact_id = p_contact and t.obligation_id is not null and t.status = 'em_progresso';
  return jsonb_build_object('apagadas', v_apagadas, 'em_andamento', v_andamento);
end $$;

-- Na volta ao Ativo: os meses já aprovados (do atual em diante) em que o cliente ficou sem tarefa viram dispensados.
create or replace function public.fiscal_dispensar_meses_aprovados_cliente(p_contact uuid, p_status_anterior text default null, p_periodo uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  with cal as (
    select fc.id
    from public.fiscal_calendar fc
    join public.agenda_receita_importacoes i on i.ano = fc.year and i.mes = fc.month
    join public.agenda_receita_aprovacoes a on a.importacao_id = i.id
    where a.company_id = (select company_id from public.contacts where id = p_contact)
      and i.ano * 12 + i.mes >= extract(year from current_date)::int * 12 + extract(month from current_date)::int
  ), ins as (
    insert into public.fiscal_tarefas_dispensadas
      (company_id, contact_id, obligation_id, calendar_id, competence_year, competence_month, due_date, motivo, status_cliente, periodo_id)
    select c.company_id, co.contact_id, co.obligation_id, fce.id, fce.competence_year, fce.competence_month, fce.effective_due_date,
           'mes_ja_gerado_sem_o_cliente', p_status_anterior, p_periodo
    from public.contacts c
    join public.client_obligations co on co.contact_id = c.id
    join public.fiscal_calendar_effective fce on fce.obligation_id = co.obligation_id and fce.id in (select id from cal)
    where c.id = p_contact
      and not exists (select 1 from public.fiscal_tasks ft where ft.contact_id = co.contact_id and ft.obligation_id = co.obligation_id
                      and ft.competence_year = fce.competence_year and ft.competence_month = fce.competence_month)
    on conflict (contact_id, obligation_id, competence_year, competence_month) do nothing
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;

revoke all on function public.fiscal_dispensar_tarefas_cliente(uuid, text) from public, anon, authenticated;
revoke all on function public.fiscal_dispensar_meses_aprovados_cliente(uuid, text, uuid) from public, anon, authenticated;

-- Troca de status: sai do Ativo (apaga + avisa) ou volta a ele (dispensa os meses já gerados).
create or replace function public.contacts_status_tarefas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_res jsonb; v_prev uuid; v_nome text; v_n integer;
begin
  if NEW.type is distinct from 'cliente' then return NEW; end if;
  if NEW.status_cliente is not distinct from OLD.status_cliente then return NEW; end if;

  if not public.status_cliente_gera_tarefa(NEW.status_cliente) then
    v_res := public.fiscal_dispensar_tarefas_cliente(NEW.id, 'saiu_do_ativo');
    v_n := coalesce((v_res->>'em_andamento')::integer, 0);
    if v_n > 0 then
      v_nome := coalesce(nullif(btrim(NEW.display_name), ''), NEW.name);
      insert into public.notifications (user_id, company_id, type, title, body, action_url, reference_type, reference_id)
      select distinct p.user_id, NEW.company_id, 'cnpj_situacao', v_nome || ' saiu do Ativo',
             v_n || ' tarefa' || case when v_n = 1 then ' em andamento foi mantida' else 's em andamento foram mantidas' end || '. Confira se ainda valem.',
             '/fiscal/tarefas', 'contact', NEW.id
        from public.fiscal_tasks t join public.profiles p on p.id = t.responsible_id
       where t.contact_id = NEW.id and t.obligation_id is not null and t.status = 'em_progresso' and p.user_id is not null;
    end if;
  elsif not public.status_cliente_gera_tarefa(OLD.status_cliente) then
    select id into v_prev from public.cliente_status_periodos
     where contact_id = NEW.id and fim is not null and status = OLD.status_cliente
     order by inicio desc nulls last, created_at desc limit 1;
    perform public.fiscal_dispensar_meses_aprovados_cliente(NEW.id, OLD.status_cliente, v_prev);
  end if;
  return NEW;
end $$;

create trigger trg_contacts_status_tarefas
  after update on public.contacts
  for each row when (OLD.status_cliente is distinct from NEW.status_cliente)
  execute function public.contacts_status_tarefas();

-- Geração: respeita as dispensas (card do cliente e geração em lote). Lançar tarefa à mão (obrigações escolhidas) ignora e limpa a dispensa.
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
      ON c.id = co.contact_id AND c.company_id = v_company_id
     AND (public.status_cliente_gera_tarefa(c.status_cliente) OR (p_contact_ids IS NOT NULL AND c.is_active = true))
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
    )
    AND (p_obligation_ids IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.fiscal_tarefas_dispensadas d
      WHERE d.contact_id = src.contact_id AND d.obligation_id = src.obligation_id
        AND d.competence_year = src.competence_year AND d.competence_month = src.competence_month
    ));

  GET DIAGNOSTICS v_tasks_created = ROW_COUNT;

  -- Tarefa lançada à mão (obrigações escolhidas) cobre a dispensa daquela obrigação/competência.
  IF p_obligation_ids IS NOT NULL THEN
    DELETE FROM public.fiscal_tarefas_dispensadas d
     WHERE d.company_id = v_company_id
       AND (p_contact_ids IS NULL OR d.contact_id = ANY(p_contact_ids))
       AND EXISTS (SELECT 1 FROM public.fiscal_tasks ft
                    WHERE ft.contact_id = d.contact_id AND ft.obligation_id = d.obligation_id
                      AND ft.competence_year = d.competence_year AND ft.competence_month = d.competence_month);
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'tasks_created', v_tasks_created,
    'period', LPAD(p_month::text, 2, '0') || '/' || p_year::text,
    'tax_regimes', p_tax_regimes, 'responsible_ids', p_responsible_ids, 'contact_ids', p_contact_ids, 'obligation_ids', p_obligation_ids
  );
END;
$function$;

-- Contagens e listas de "falta lançar": o que está dispensado não é falta. Mesmo padrão de `not exists` nas 4 funções.
do $$
declare
  f record;
  def text;
  achados int;
  padrao constant text := '(not exists \(select 1 from public\.fiscal_tasks ft where ft\.contact_id = (\w+\.\w+) and ft\.obligation_id = (\w+\.\w+)\s+and ft\.competence_year = (\w+)\.competence_year and ft\.competence_month = \4\.competence_month\))';
begin
  for f in
    select p.oid, p.proname, v.esperado
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join (values
      ('fiscal_cliente_tarefas', 1),
      ('fiscal_clientes_sem_tarefas', 1),
      ('fiscal_calendario_resumo', 3),
      ('fiscal_lancamento_avisos', 1)
    ) as v(nome, esperado) on v.nome = p.proname
  loop
    def := pg_get_functiondef(f.oid);
    select count(*) into achados from regexp_matches(def, padrao, 'g');
    if achados <> f.esperado then
      raise exception '% tem % trechos not exists fiscal_tasks (esperado %)', f.proname, achados, f.esperado;
    end if;
    def := regexp_replace(def, padrao,
      '\1 and not exists (select 1 from public.fiscal_tarefas_dispensadas dd where dd.contact_id = \2 and dd.obligation_id = \3 and dd.competence_year = \4.competence_year and dd.competence_month = \4.competence_month)',
      'g');
    execute def;
  end loop;
end $$;

-- Desfazer o lançamento do mês: as dispensas daquele mês saem junto (o mês será gerado de novo).
do $$
declare
  v_oid oid;
  def text;
  ancora constant text := 'delete from public.agenda_receita_aprovacoes where importacao_id = p_importacao_id and company_id = v_company;';
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'agenda_receita_desfazer';
  def := pg_get_functiondef(v_oid);
  if (length(def) - length(replace(def, ancora, ''))) <> length(ancora) then
    raise exception 'agenda_receita_desfazer: âncora não encontrada';
  end if;
  def := replace(def, ancora,
    'delete from public.fiscal_tarefas_dispensadas where company_id = v_company and calendar_id in (select id from public.fiscal_calendar where year = v_ano and month = v_mes);'
    || E'\n  ' || ancora);
  execute def;
end $$;

-- Limpeza única: tarefas abertas de quem hoje está fora do Ativo (a cópia fica em fiscal_tarefas_dispensadas.tarefa).
-- Fora: Edmilson de Souza (Baixada, 14 a_fazer + 7 aguardando_cliente), mantido na limpeza de 06/10/2026.
do $$
declare
  c record;
  r jsonb;
  total integer := 0;
begin
  for c in
    select id from public.contacts
     where type = 'cliente' and not public.status_cliente_gera_tarefa(status_cliente)
       and id <> 'a4741e93-71de-4ea0-9a7a-cee74f4b1a2b'
  loop
    r := public.fiscal_dispensar_tarefas_cliente(c.id, 'limpeza');
    total := total + coalesce((r->>'apagadas')::integer, 0);
  end loop;
  raise notice 'limpeza: % tarefas apagadas', total;
end $$;
