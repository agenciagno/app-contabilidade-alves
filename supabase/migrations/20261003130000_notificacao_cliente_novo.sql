-- Aviso de cliente novo no sino "Notificações Gerais", 03/10/2026.
-- Cliente cadastrado à mão (não importado em lote) avisa todos os usuários ativos da mesma empresa.
-- Importação em lote fica de fora: 238 cadastros de uma vez lotariam o sino.
-- Falha ao avisar nunca derruba o cadastro do cliente.

-- 1) o tipo novo precisa estar na lista do CHECK (checar pg_constraint antes de criar tipo novo)
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed', 'coverage_started', 'coverage_ended', 'popup', 'boleto_pago',
    'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_dctfweb_rodada', 'serpro_das_vencimento',
    'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis', 'serpro_sitfis',
    'gestao360_pgdas_antes_prazo', 'gestao360_mensagem_parada', 'gestao360_baixa_sem_declaracao', 'gestao360_sem_resposta',
    'agenda_fiscal', 'calendar_generated', 'cliente_novo'
  ]::text[]));

-- 2) trigger: INSERT em contacts
create or replace function public.notificar_cliente_novo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nome text;
begin
  if new.type is distinct from 'cliente' or coalesce(new.origin, '') = 'imported' or new.company_id is null then
    return new;
  end if;
  v_nome := coalesce(nullif(new.display_name, ''), nullif(new.nome_fantasia, ''), nullif(new.razao_social, ''), new.name::text, 'Cliente');
  begin
    insert into public.notifications (user_id, company_id, type, title, body, action_url, reference_type, reference_id)
    select p.user_id, new.company_id, 'cliente_novo', 'Cliente novo cadastrado', v_nome, '/contatos', 'contact', new.id
    from public.profiles p
    where p.company_id = new.company_id and p.status_active = true and p.user_id is not null;
  exception when others then
    raise warning 'notificar_cliente_novo falhou: %', sqlerrm;
  end;
  return new;
end;
$function$;

drop trigger if exists trg_notificar_cliente_novo on public.contacts;
create trigger trg_notificar_cliente_novo
  after insert on public.contacts
  for each row execute function public.notificar_cliente_novo();
