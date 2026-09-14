-- Contatos com CPF (pessoa física) devem sempre exibir Regime Tributário = "Pessoa Física"
-- (valor 'nao_aplica'). Espelha o padrão do trigger existente set_pessoa_fisica_categoria,
-- que já faz a mesma detecção de CPF por tamanho do documento (11 chars) pra `categorias`.

CREATE OR REPLACE FUNCTION public.set_pessoa_fisica_tax_regime()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  clean_doc text;
BEGIN
  clean_doc := regexp_replace(coalesce(NEW.document, ''), '[^0-9A-Za-z]', '', 'g');
  IF length(clean_doc) = 11 THEN
    NEW.tax_regime := 'nao_aplica';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_pessoa_fisica_tax_regime ON public.contacts;
CREATE TRIGGER trg_set_pessoa_fisica_tax_regime
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_pessoa_fisica_tax_regime();

-- Backfill dos registros existentes (achado: 1 contato CPF com tax_regime errado, 2 nulos)
UPDATE public.contacts
SET tax_regime = 'nao_aplica'
WHERE regexp_replace(coalesce(document, ''), '[^0-9A-Za-z]', '', 'g') ~ '^[0-9A-Za-z]{11}$'
  AND tax_regime IS DISTINCT FROM 'nao_aplica';
