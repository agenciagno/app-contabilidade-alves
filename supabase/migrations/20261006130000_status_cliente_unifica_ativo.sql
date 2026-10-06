-- Status do Cliente passa a ser a ÚNICA fonte do ativo/inativo (pedido Gabriel, 06/10/2026).
-- is_active vira coluna derivada: quem lê is_active (tarefas, boletos, avisos, listas) continua funcionando sem mudar.
--   Inativos : Cancelada - Receita Federal, Baixada, Ex-cliente, Ex-Colaborador  -> nunca entram em tarefas, boletos, avisos nem Serpro.
--   Ativos   : Ativo, Suspensa - Contabilidade, Suspensa - Receita Federal, Inapta - Receita Federal.
-- Serpro NÃO muda: continua `is_active = true AND status_cliente = 'Ativo'` (os 275 de hoje).

CREATE OR REPLACE FUNCTION public.contacts_unifica_ativo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inativos constant text[] := ARRAY['Cancelada - Receita Federal', 'Baixada', 'Ex-cliente', 'Ex-Colaborador'];
BEGIN
  -- Caminho antigo (ligar/desligar is_active direto, sem mexer no status) é traduzido para o status.
  IF TG_OP = 'UPDATE'
     AND NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NEW.status_cliente IS NOT DISTINCT FROM OLD.status_cliente THEN
    NEW.status_cliente := CASE WHEN NEW.is_active THEN 'Ativo' ELSE 'Ex-cliente' END;
  END IF;
  NEW.is_active := NOT (coalesce(NEW.status_cliente, 'Ativo') = ANY (inativos));
  RETURN NEW;
END $$;

-- Nome depois de trg_contacts_sync_status_receita (que também muda o status): BEFORE dispara em ordem alfabética.
DROP TRIGGER IF EXISTS trg_contacts_unifica_ativo ON public.contacts;
CREATE TRIGGER trg_contacts_unifica_ativo
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_unifica_ativo();

-- Acerta quem já está salvo (todos os cadastros estavam is_active = true, inclusive baixados e ex-clientes).
UPDATE public.contacts SET status_cliente = status_cliente
 WHERE status_cliente IN ('Cancelada - Receita Federal', 'Baixada', 'Ex-cliente', 'Ex-Colaborador') AND is_active;

-- Lançar tarefa: a lista de clientes passa a trazer a situação (aviso na tela).
CREATE OR REPLACE FUNCTION public.fiscal_lancar_candidatos(p_ano integer, p_mes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores lançam tarefas'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', x.id, 'nome', x.nome, 'documento', x.document, 'regime', x.tax_regime, 'status_cliente', x.status_cliente, 'obrigacoes', x.obrigacoes
         ) order by x.nome), '[]'::jsonb) into v_out
  from (
    select c.id, c.document, c.tax_regime, c.status_cliente,
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
    group by c.id, c.document, c.tax_regime, c.status_cliente, c.display_name, c.nome_fantasia, c.razao_social, c.name
  ) x;
  return v_out;
end $$;

-- Aprovar e lançar o calendário: quem vai receber tarefa com situação diferente de "Ativo" (Suspensa, Inapta), para o aviso de confirmação.
CREATE OR REPLACE FUNCTION public.fiscal_lancamento_avisos(p_ano integer, p_mes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', c.id, 'nome', c.name, 'status_cliente', c.status_cliente, 'tarefas', jsonb_array_length(e->'faltando')
         ) order by c.name), '[]'::jsonb) into v_out
  from jsonb_array_elements(public.fiscal_clientes_sem_tarefas(p_ano, p_mes)) e
  join public.contacts c on c.id = (e->>'contact_id')::uuid
  where c.status_cliente is distinct from 'Ativo' and jsonb_array_length(e->'faltando') > 0;
  return v_out;
end $$;
REVOKE ALL ON FUNCTION public.fiscal_lancamento_avisos(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_lancamento_avisos(integer, integer) TO authenticated, service_role;
