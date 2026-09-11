-- Backfill: tarefas fiscais já lançadas (Jul/Ago/Set 2026) foram criadas antes da correção
-- de generate_monthly_fiscal_tasks e carregam competence_year/month e título com o bug antigo
-- (competência = mês do vencimento, em vez de mês do vencimento - 1). Recalcula a partir do
-- fiscal_calendar (fonte já correta) via calendar_id, que toda tarefa auto-gerada carrega.
UPDATE public.fiscal_tasks ft
SET competence_year = fc.competence_year,
    competence_month = fc.competence_month,
    title = foc.name || ' - Competência ' || LPAD(fc.competence_month::text, 2, '0') || '/' || fc.competence_year::text
FROM public.fiscal_calendar fc
JOIN public.fiscal_obligations_catalog foc ON foc.id = fc.obligation_id
WHERE ft.calendar_id = fc.id
  AND ft.is_auto_generated = true;
