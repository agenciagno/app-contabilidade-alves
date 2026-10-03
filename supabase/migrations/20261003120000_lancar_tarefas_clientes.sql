-- Lançar tarefas de clientes escolhidos direto do Calendário Fiscal, 03/10/2026.
-- O botão "Lançar tarefa" abre uma lista de clientes; para cada um, as obrigações do mês que ele tem no cadastro (todas marcadas, dá para desmarcar).
-- Regra que não muda: só lança obrigação marcada no cadastro do cliente e com responsável no setor; nunca duplica tarefa.

-- 1) o lançamento ganha o filtro por obrigação. Parâmetro novo no fim, com padrão: as chamadas antigas (5 argumentos) continuam valendo.
--    Dropa a assinatura antiga, senão o PostgREST fica com duas versões e responde "ambíguo".
drop function if exists public.generate_monthly_fiscal_tasks(integer, integer, text[], uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.generate_monthly_fiscal_tasks(
  p_year integer, p_month integer, p_tax_regimes text[] DEFAULT NULL::text[],
  p_responsible_ids uuid[] DEFAULT NULL::uuid[], p_contact_ids uuid[] DEFAULT NULL::uuid[],
  p_obligation_ids uuid[] DEFAULT NULL::uuid[]
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
revoke all on function public.generate_monthly_fiscal_tasks(integer, integer, text[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.generate_monthly_fiscal_tasks(integer, integer, text[], uuid[], uuid[], uuid[]) to authenticated, service_role;

-- 2) candidatos do mês: clientes ativos com obrigação marcada que existe no calendário do mês, e se cada tarefa já foi lançada.
create or replace function public.fiscal_lancar_candidatos(p_ano integer, p_mes integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores lançam tarefas'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', x.id, 'nome', x.nome, 'documento', x.document, 'regime', x.tax_regime, 'obrigacoes', x.obrigacoes
         ) order by x.nome), '[]'::jsonb) into v_out
  from (
    select c.id, c.document, c.tax_regime,
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
    group by c.id, c.document, c.tax_regime, c.display_name, c.nome_fantasia, c.razao_social, c.name
  ) x;
  return v_out;
end $$;
revoke all on function public.fiscal_lancar_candidatos(integer, integer) from public, anon;
grant execute on function public.fiscal_lancar_candidatos(integer, integer) to authenticated, service_role;

-- 3) lançar: cria as tarefas dos clientes e obrigações escolhidos (as do cadastro que faltam) e avisa cada responsável.
create or replace function public.fiscal_lancar_tarefas_clientes(p_ano integer, p_mes integer, p_contact_ids uuid[], p_obligation_ids uuid[])
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_res jsonb; v_n integer;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
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
end $$;
revoke all on function public.fiscal_lancar_tarefas_clientes(integer, integer, uuid[], uuid[]) from public, anon;
grant execute on function public.fiscal_lancar_tarefas_clientes(integer, integer, uuid[], uuid[]) to authenticated, service_role;
