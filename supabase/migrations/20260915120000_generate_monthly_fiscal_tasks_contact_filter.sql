-- generate_monthly_fiscal_tasks ganha filtro opcional por cliente (p_contact_ids),
-- mesma lógica idempotente de hoje (NOT EXISTS por contact_id+obligation_id+competência).
-- Permite lançar retroativamente as tarefas de 1 cliente específico (ex.: cliente novo
-- que entrou depois do lote do mês, ou obrigação nova adicionada no Super Perfil) sem
-- tocar nos demais clientes já lançados.
--
-- Parâmetro novo muda a assinatura da função (tipos de argumento, não só default) —
-- CREATE OR REPLACE não substitui, cria sobrecarga e deixa o PostgREST ambíguo.
-- Precisa dropar a assinatura antiga primeiro.
DROP FUNCTION IF EXISTS public.generate_monthly_fiscal_tasks(integer, integer, text[], uuid[]);

CREATE OR REPLACE FUNCTION public.generate_monthly_fiscal_tasks(
  p_year integer,
  p_month integer,
  p_tax_regimes text[] DEFAULT NULL::text[],
  p_responsible_ids uuid[] DEFAULT NULL::uuid[],
  p_contact_ids uuid[] DEFAULT NULL::uuid[]
)
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
      ON c.id = co.contact_id
     AND c.company_id = v_company_id
     AND c.is_active = true
     AND 'cliente' = ANY (COALESCE(c.categorias, ARRAY['outros']::text[]))
     AND (p_tax_regimes IS NULL OR c.tax_regime = ANY(p_tax_regimes))
     AND (p_contact_ids IS NULL OR c.id = ANY(p_contact_ids))  -- filtro opcional por cliente específico
    JOIN public.fiscal_obligations_catalog foc
      ON foc.id = co.obligation_id
    JOIN public.fiscal_calendar_effective fce
      ON fce.obligation_id = co.obligation_id
     AND fce.year = p_year
     AND fce.month = p_month
  ) src
  WHERE src.dept_responsible_id IS NOT NULL
    AND (p_responsible_ids IS NULL OR src.effective_responsible_id = ANY(p_responsible_ids))
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
    'responsible_ids', p_responsible_ids,
    'contact_ids', p_contact_ids
  );
END;
$function$;

-- Reaplica o lock-down de grants (mig. generate_monthly_fiscal_tasks_lock_down_grants):
-- só authenticated/service_role chamam, nunca anon/PUBLIC. DROP+CREATE volta ao
-- default de PUBLIC, então isso precisa ser refeito toda vez que a assinatura muda.
REVOKE ALL ON FUNCTION public.generate_monthly_fiscal_tasks(integer, integer, text[], uuid[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_monthly_fiscal_tasks(integer, integer, text[], uuid[], uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_fiscal_tasks(integer, integer, text[], uuid[], uuid[]) TO authenticated, service_role;
