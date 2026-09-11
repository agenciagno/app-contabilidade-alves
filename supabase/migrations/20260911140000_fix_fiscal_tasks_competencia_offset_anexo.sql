-- 1) generate_monthly_fiscal_tasks: grava a competência já calculada corretamente
-- (mês de apuração = mês do vencimento - 1) em fiscal_calendar_effective, em vez de
-- reescrever com p_year/p_month (mês do vencimento). Também ajusta o título do
-- checklist para "NOME - Competência MM/AAAA".
CREATE OR REPLACE FUNCTION public.generate_monthly_fiscal_tasks(p_year integer, p_month integer, p_tax_regimes text[] DEFAULT NULL::text[], p_responsible_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_tasks_created int := 0;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário sem empresa associada');
  END IF;

  INSERT INTO public.fiscal_tasks (
    company_id,
    contact_id,
    obligation_id,
    calendar_id,
    competence_year,
    competence_month,
    title,
    due_date,
    delivery_date,
    fiscal_due_date,
    responsible_id,
    department,
    is_auto_generated,
    status
  )
  SELECT
    v_company_id,
    src.contact_id,
    src.obligation_id,
    src.calendar_id,
    src.competence_year,
    src.competence_month,
    src.title,
    src.due_date,
    src.delivery_date,
    src.fiscal_due_date,
    src.effective_responsible_id AS responsible_id,
    src.department,
    true AS is_auto_generated,
    'a_fazer' AS status
  FROM (
    SELECT
      co.contact_id,
      co.obligation_id,
      fce.id AS calendar_id,
      fce.competence_year,
      fce.competence_month,
      foc.name || ' - Competência ' || LPAD(fce.competence_month::text, 2, '0') || '/' || fce.competence_year::text AS title,
      fce.internal_delivery_date AS due_date,
      fce.internal_delivery_date AS delivery_date,
      fce.adjusted_due_date      AS fiscal_due_date,
      foc.department              AS department,
      -- Responsável do setor da obrigação, não sempre o Fiscal legado (bug antigo:
      -- Folha de Pagamento/Pró-labore caíam no responsável Fiscal em vez do Pessoal).
      CASE foc.department
        WHEN 'pessoal'    THEN c.dp_responsible_id
        WHEN 'financeiro' THEN c.financeiro_responsible_id
        WHEN 'contabil'   THEN c.contabil_responsible_id
        WHEN 'comercial'  THEN c.comercial_responsible_id
        ELSE c.responsible_id
      END AS dept_responsible_id,
      -- Responsável efetivo (considera cobertura ativa) — é o que de fato vai pro
      -- campo responsible_id da tarefa, então o filtro por colaborador usa este.
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
      ON c.id = co.contact_id
     AND c.company_id = v_company_id
     AND c.is_active = true
     AND 'cliente' = ANY (COALESCE(c.categorias, ARRAY['outros']::text[]))  -- SOMENTE contatos marcados como cliente
     AND (p_tax_regimes IS NULL OR c.tax_regime = ANY(p_tax_regimes))  -- filtro opcional por regime tributário
    JOIN public.fiscal_obligations_catalog foc
      ON foc.id = co.obligation_id
    JOIN public.fiscal_calendar_effective fce
      ON fce.obligation_id = co.obligation_id
     AND fce.year = p_year
     AND fce.month = p_month
  ) src
  WHERE src.dept_responsible_id IS NOT NULL  -- SOMENTE clientes com responsável definido NO SETOR da obrigação
    AND (p_responsible_ids IS NULL OR src.effective_responsible_id = ANY(p_responsible_ids))  -- filtro opcional por colaborador
    AND NOT EXISTS (
      SELECT 1 FROM public.fiscal_tasks ft
      WHERE ft.contact_id    = src.contact_id
        AND ft.obligation_id = src.obligation_id
        AND ft.competence_year  = src.competence_year
        AND ft.competence_month = src.competence_month
    );

  GET DIAGNOSTICS v_tasks_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'tasks_created', v_tasks_created,
    'period', LPAD(p_month::text, 2, '0') || '/' || p_year::text,
    'tax_regimes', p_tax_regimes,
    'responsible_ids', p_responsible_ids
  );
END;
$function$;

-- 2) Entrega interna passa a ser 1 dia útil antes do vencimento (era 2), valendo só
-- para competências ainda não calculadas — as 16 obrigações já estavam todas em 2
-- (sem customização por obrigação a perder).
ALTER TABLE public.fiscal_obligations_catalog ALTER COLUMN internal_delivery_offset SET DEFAULT 1;
UPDATE public.fiscal_obligations_catalog SET internal_delivery_offset = 1 WHERE internal_delivery_offset = 2;

-- 3) Remove a informação de anexo das tarefas já concluídas por esse caminho
-- (conclusão por anexo está sendo descontinuada), preservando status/completed_at.
UPDATE public.fiscal_tasks
SET attachment_url = NULL,
    completion_type = NULL
WHERE attachment_url IS NOT NULL;
