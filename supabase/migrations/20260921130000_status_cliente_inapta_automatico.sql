-- "Inapta - Receita Federal" também vira automático (pedido Gabriel, 21/09/2026).
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
  ELSIF sit = 'inapta' THEN
    NEW.status_cliente := 'Inapta - Receita Federal';
  ELSIF NEW.status_cliente IN ('Suspensa - Receita Federal', 'Cancelada - Receita Federal', 'Inapta - Receita Federal') THEN
    NEW.status_cliente := 'Ativo';
  END IF;
  RETURN NEW;
END $$;

UPDATE public.contacts SET status_cliente = 'Inapta - Receita Federal'
  WHERE lower(btrim(situacao_cadastral)) = 'inapta'
    AND status_cliente NOT IN ('Ex-cliente', 'Ex-Colaborador', 'Baixada');
