-- Novo status "Ex-Colaborador" em contacts.status_cliente (pedido Gabriel, 14/09/2026).
ALTER TABLE public.contacts DROP CONSTRAINT contacts_status_cliente_check;

ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_cliente_check
  CHECK (status_cliente = ANY (ARRAY['Ativo','Inativo','Suspenso','Encerrado','Ex-cliente','Ex-Colaborador']));
