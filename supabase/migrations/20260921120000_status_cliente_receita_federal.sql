-- Status do Cliente: renomeia 3 valores e cria 2 ligados à Situação na Receita Federal (pedido Gabriel, 21/09/2026).
--   Encerrado -> Baixada
--   Suspenso  -> Suspensa - Contabilidade
--   Inativo   -> Inapta - Receita Federal
--   novos: Suspensa - Receita Federal / Cancelada - Receita Federal (automáticos via situacao_cadastral)

ALTER TABLE public.contacts DROP CONSTRAINT contacts_status_cliente_check;

UPDATE public.contacts SET status_cliente = 'Baixada'                WHERE status_cliente = 'Encerrado';
UPDATE public.contacts SET status_cliente = 'Suspensa - Contabilidade' WHERE status_cliente = 'Suspenso';
UPDATE public.contacts SET status_cliente = 'Inapta - Receita Federal' WHERE status_cliente = 'Inativo';

ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_cliente_check
  CHECK (status_cliente = ANY (ARRAY[
    'Ativo','Inapta - Receita Federal','Suspensa - Contabilidade','Suspensa - Receita Federal',
    'Cancelada - Receita Federal','Baixada','Ex-cliente','Ex-Colaborador'
  ]));

-- Automático: quando a Situação na Receita muda (ou o contato nasce) para Suspensa/Cancelada,
-- o status vira o da Receita. Se volta para outra situação, sai do status automático (volta a Ativo).
-- Ex-cliente/Ex-Colaborador/Baixada são decisões da CA e nunca são sobrescritas.
CREATE OR REPLACE FUNCTION public.contacts_sync_status_receita()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sit text := lower(btrim(coalesce(NEW.situacao_cadastral, '')));
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.situacao_cadastral IS NOT DISTINCT FROM OLD.situacao_cadastral THEN
    RETURN NEW;
  END IF;
  IF NEW.status_cliente IN ('Ex-cliente', 'Ex-Colaborador', 'Baixada') THEN
    RETURN NEW;
  END IF;

  IF sit = 'suspensa' THEN
    NEW.status_cliente := 'Suspensa - Receita Federal';
  ELSIF sit = 'cancelada' THEN
    NEW.status_cliente := 'Cancelada - Receita Federal';
  ELSIF NEW.status_cliente IN ('Suspensa - Receita Federal', 'Cancelada - Receita Federal') THEN
    NEW.status_cliente := 'Ativo';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contacts_sync_status_receita ON public.contacts;
CREATE TRIGGER trg_contacts_sync_status_receita
  BEFORE INSERT OR UPDATE OF situacao_cadastral ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_sync_status_receita();

-- Backfill: quem já está com situação Suspensa/Cancelada na Receita.
UPDATE public.contacts SET status_cliente = 'Suspensa - Receita Federal'
  WHERE lower(btrim(situacao_cadastral)) = 'suspensa'
    AND status_cliente NOT IN ('Ex-cliente', 'Ex-Colaborador', 'Baixada');
UPDATE public.contacts SET status_cliente = 'Cancelada - Receita Federal'
  WHERE lower(btrim(situacao_cadastral)) = 'cancelada'
    AND status_cliente NOT IN ('Ex-cliente', 'Ex-Colaborador', 'Baixada');
