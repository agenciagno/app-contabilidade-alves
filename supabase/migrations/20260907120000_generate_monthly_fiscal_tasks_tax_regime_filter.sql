-- Adiciona filtro opcional por regime tributário ao lançamento de tarefas fiscais.
-- CREATE OR REPLACE com novo parâmetro cria sobrecarga no Postgres — a assinatura
-- antiga (2 args) foi dropada depois de recriar com 3 args para não deixar o
-- PostgREST ambíguo entre as duas.
CREATE OR REPLACE FUNCTION public.generate_monthly_fiscal_tasks(p_year integer, p_month integer, p_tax_regimes text[] DEFAULT NULL)
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
    p_year,
    p_month,
    src.title,
    src.due_date,
    src.delivery_date,
    src.fiscal_due_date,
    public.get_effective_responsible(src.dept_responsible_id, CURRENT_DATE) AS responsible_id,
    src.department,
    true AS is_auto_generated,
    'a_fazer' AS status
  FROM (
    SELECT
      co.contact_id,
      co.obligation_id,
      fce.id AS calendar_id,
      foc.name || ' — ' || LPAD(p_month::text, 2, '0') || '/' || p_year::text AS title,
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
      END AS dept_responsible_id
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
    AND NOT EXISTS (
      SELECT 1 FROM public.fiscal_tasks ft
      WHERE ft.contact_id    = src.contact_id
        AND ft.obligation_id = src.obligation_id
        AND ft.competence_year  = p_year
        AND ft.competence_month = p_month
    );

  GET DIAGNOSTICS v_tasks_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'tasks_created', v_tasks_created,
    'period', LPAD(p_month::text, 2, '0') || '/' || p_year::text,
    'tax_regimes', p_tax_regimes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_monthly_fiscal_tasks(integer, integer, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_monthly_fiscal_tasks(integer, integer, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_fiscal_tasks(integer, integer, text[]) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.generate_monthly_fiscal_tasks(integer, integer);
