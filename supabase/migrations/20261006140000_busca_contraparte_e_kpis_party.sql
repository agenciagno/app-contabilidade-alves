-- Lançamentos: busca pelo nome do cliente/fornecedor e totais filtrando por party.
--
-- Cliente do módulo Financeiro liga o lançamento a `parties` (não a `contacts`), e a
-- busca da tela só olhava `description` (= nome do Evento Contábil) e `notes`.
--
-- 1) `contraparte_busca(transactions)`: coluna calculada do PostgREST com o nome da
--    contraparte (contato OU party). A tela filtra `contraparte_busca.ilike.%termo%`
--    dentro do mesmo `or(...)` da busca, sem montar lista de ids na URL.
-- 2) `get_transaction_kpis` ganha `p_party_id` e a busca passa a olhar o mesmo que a
--    lista (descrição, observação e nome da contraparte). Assinatura antiga é dropada
--    antes (CREATE OR REPLACE com parâmetro novo cria sobrecarga e o PostgREST fica
--    ambíguo).

CREATE OR REPLACE FUNCTION public.contraparte_busca(t public.transactions)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT concat_ws(' ',
    (SELECT concat_ws(' ', c.name, c.display_name, c.nome_fantasia, c.razao_social)
       FROM public.contacts c WHERE c.id = t.contact_id),
    (SELECT concat_ws(' ', p.nome, p.display_name)
       FROM public.parties p WHERE p.id = t.party_id)
  );
$$;

REVOKE ALL ON FUNCTION public.contraparte_busca(public.transactions) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contraparte_busca(public.transactions) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_transaction_kpis(uuid, date, date, text, uuid, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_transaction_kpis(
  p_company_id uuid,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_type text DEFAULT NULL::text,
  p_bank_id uuid DEFAULT NULL::uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_contact_id uuid DEFAULT NULL::uuid,
  p_payment_status text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_party_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.';
  END IF;

  SELECT jsonb_build_object(
    'receitas_pagas', COALESCE(SUM(t.paid_amount) FILTER (
      WHERE t.type = 'receita' AND t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL
    ), 0),
    'receitas_pendentes', COALESCE(SUM(t.amount) FILTER (
      WHERE t.type = 'receita' AND NOT (t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL)
    ), 0),
    'despesas_pagas', COALESCE(SUM(t.paid_amount) FILTER (
      WHERE t.type = 'despesa' AND t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL
    ), 0),
    'despesas_pendentes', COALESCE(SUM(t.amount) FILTER (
      WHERE t.type = 'despesa' AND NOT (t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL)
    ), 0),
    'contas_em_atraso', COALESCE(SUM(t.amount) FILTER (
      WHERE t.type = 'despesa'
        AND NOT (t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL)
        AND t.due_date < CURRENT_DATE
    ), 0),
    'receitas_em_atraso', COALESCE(SUM(t.amount) FILTER (
      WHERE t.type = 'receita'
        AND NOT (t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL)
        AND t.due_date < CURRENT_DATE
    ), 0)
  ) INTO result
  FROM transactions t
  WHERE t.company_id = p_company_id
    AND t.deleted_at IS NULL
    AND t.is_transfer = false
    AND (p_start_date IS NULL OR COALESCE(t.date, t.due_date, t.issue_date) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(t.date, t.due_date, t.issue_date) <= p_end_date)
    AND (p_type IS NULL OR t.type = p_type)
    AND (p_bank_id IS NULL OR t.bank_id = p_bank_id)
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_contact_id IS NULL OR t.contact_id = p_contact_id)
    AND (p_party_id IS NULL OR t.party_id = p_party_id)
    AND (p_payment_status IS NULL
         OR (p_payment_status = 'paid' AND t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL)
         OR (p_payment_status = 'pending' AND NOT (t.is_paid = true AND t.date IS NOT NULL AND t.paid_amount IS NOT NULL))
    )
    AND (p_search IS NULL
         OR t.description ILIKE '%' || p_search || '%'
         OR t.notes ILIKE '%' || p_search || '%'
         OR public.contraparte_busca(t) ILIKE '%' || p_search || '%');

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_transaction_kpis(uuid, date, date, text, uuid, uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transaction_kpis(uuid, date, date, text, uuid, uuid, uuid, text, text, uuid) TO authenticated, service_role;
