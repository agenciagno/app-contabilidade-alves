-- Calendário em poucas etapas, 02/10/2026: o calendário aparece vindo da Receita, um clique aprova e lança as tarefas.
-- Também: lançar ou atualizar o card de tarefas de UM cliente (cliente novo, cliente esquecido, obrigação ou data que mudou).

-- ---------------------------------------------------------------- 1) o lançamento passa a respeitar as datas EDITADAS no calendário
-- Antes lia `internal_delivery_date` e `adjusted_due_date` (datas-base da view): ajuste de data feito na tela era ignorado ao lançar.
-- Agora usa `effective_delivery_date` e `effective_due_date` (override quando existe). Mesma assinatura: não cria sobrecarga.
CREATE OR REPLACE FUNCTION public.generate_monthly_fiscal_tasks(
  p_year integer, p_month integer, p_tax_regimes text[] DEFAULT NULL::text[],
  p_responsible_ids uuid[] DEFAULT NULL::uuid[], p_contact_ids uuid[] DEFAULT NULL::uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_company_id uuid;
  v_tasks_created int := 0;
BEGIN
  SELECT company_id INTO v_company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
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
    JOIN public.fiscal_obligations_catalog foc ON foc.id = co.obligation_id
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
    'tax_regimes', p_tax_regimes, 'responsible_ids', p_responsible_ids, 'contact_ids', p_contact_ids
  );
END;
$function$;

-- ---------------------------------------------------------------- 2) notificação do lançamento (o tipo antigo nunca esteve na lista do CHECK)
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed', 'coverage_started', 'coverage_ended', 'popup', 'boleto_pago',
    'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_dctfweb_rodada', 'serpro_das_vencimento',
    'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis', 'serpro_sitfis',
    'gestao360_pgdas_antes_prazo', 'gestao360_mensagem_parada', 'gestao360_baixa_sem_declaracao', 'gestao360_sem_resposta',
    'agenda_fiscal', 'calendar_generated'
  ]));

-- Responsável do setor da obrigação no cadastro do cliente (mesma regra do lançamento).
create or replace function public.fiscal_resp_do_setor(c public.contacts, d text)
returns uuid language sql stable as $$
  select case d when 'pessoal' then c.dp_responsible_id when 'financeiro' then c.financeiro_responsible_id
                when 'contabil' then c.contabil_responsible_id when 'comercial' then c.comercial_responsible_id
                else c.responsible_id end
$$;

-- ---------------------------------------------------------------- 3) aprovar e lançar, num clique
create or replace function public.agenda_receita_aprovar_e_lancar(p_importacao_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_company uuid; v_role text; v_super boolean; v_ano smallint; v_mes smallint; v_res jsonb; v_n integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
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
end $$;
revoke all on function public.agenda_receita_aprovar_e_lancar(uuid) from public, anon;
grant execute on function public.agenda_receita_aprovar_e_lancar(uuid) to authenticated, service_role;

-- Desfazer: só apaga cards intocados (a_fazer e sem edição), nunca tarefa em andamento ou concluída; o mês volta a rascunho.
create or replace function public.agenda_receita_desfazer(p_importacao_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_company uuid; v_role text; v_super boolean; v_ano smallint; v_mes smallint; v_removidas integer; v_preservadas integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
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
end $$;
revoke all on function public.agenda_receita_desfazer(uuid) from public, anon;
grant execute on function public.agenda_receita_desfazer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 4) card de UM cliente: ver o que falta e atualizar
-- Meses considerados: os já APROVADOS pela empresa, do mês corrente em diante (mês em rascunho entra no lançamento do mês).
-- Sem aplicar (padrão): só devolve o plano. Aplicando: cria o que falta, remove cards intocados de obrigação que o cliente não tem mais
-- e acerta as datas de cards ainda a_fazer. Nunca mexe em tarefa em andamento, aguardando cliente ou concluída.
create or replace function public.fiscal_cliente_tarefas(p_contact_id uuid, p_aplicar boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_company uuid; v_role text; v_super boolean; v_c public.contacts;
  v_cal uuid[]; v_criar jsonb; v_remover jsonb; v_preservadas integer; v_datas jsonb;
  v_criadas integer := 0; v_removidas integer := 0; v_atualizadas integer := 0; m record; v_res jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
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
end $$;
revoke all on function public.fiscal_cliente_tarefas(uuid, boolean) from public, anon;
grant execute on function public.fiscal_cliente_tarefas(uuid, boolean) to authenticated, service_role;

-- Clientes ativos com obrigação marcada e SEM tarefa no mês (cliente novo ou esquecido). `sem_responsavel` = falta responsável no setor.
create or replace function public.fiscal_clientes_sem_tarefas(p_ano integer, p_mes integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
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
end $$;
revoke all on function public.fiscal_clientes_sem_tarefas(integer, integer) from public, anon;
grant execute on function public.fiscal_clientes_sem_tarefas(integer, integer) to authenticated, service_role;

-- Resumo do mês para a tela do calendário: por obrigação, tarefas já lançadas e a lançar (cliente ativo, com obrigação marcada e responsável no setor).
-- Substitui a conta feita no navegador, que usava o mês do vencimento como competência e nunca enxergava o que já foi lançado.
create or replace function public.fiscal_calendario_resumo(p_ano integer, p_mes integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_obrig jsonb; v_clientes integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
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
end $$;
revoke all on function public.fiscal_calendario_resumo(integer, integer) from public, anon;
grant execute on function public.fiscal_calendario_resumo(integer, integer) to authenticated, service_role;
