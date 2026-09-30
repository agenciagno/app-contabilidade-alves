-- Serpro — conclusão automática da tarefa fiscal "DAS - Simples Nacional" quando a Receita prova que não há mais o que fazer, 30/09/2026
-- Regras (aplicadas pelas functions serpro-pgdasd e serpro-pagamentos, nunca por gatilho do banco):
--   · DAS do período pago (informação da Receita) → concluída, protocolo "PAGO";
--   · declaração do período transmitida com receita e débito zerados → concluída, protocolo "ZERADO".
-- Interruptor em Tech > Consumo Serpro (auto_concluir_tarefas); desligado, nada é concluído sozinho.
alter table public.serpro_config add column auto_concluir_tarefas boolean not null default true;
comment on column public.serpro_config.auto_concluir_tarefas is 'Liga/desliga a conclusão automática da tarefa fiscal DAS - Simples Nacional (DAS pago ou declaração zerada confirmada pela Receita).';

-- A notificação de "tarefa concluída" dizia "(por <responsável>)" mesmo quando a conclusão vinha do sistema (sem usuário logado,
-- como a conclusão automática): agora diz "(automático: Receita)". Conclusão feita por pessoa continua igual.
create or replace function public.notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  admin_user_id uuid;
  task_responsible_name text;
  contact_name text;
  obligation_code text;
begin
  if NEW.status = 'concluido' and OLD.status != 'concluido' then
    -- Atualizar completed_at
    NEW.completed_at := now();

    -- Buscar nome do responsável
    select full_name into task_responsible_name
    from public.profiles where id = NEW.responsible_id;

    -- Buscar nome do cliente
    select name into contact_name
    from public.contacts where id = NEW.contact_id;

    -- Buscar código da obrigação
    select code into obligation_code
    from public.fiscal_obligations_catalog where id = NEW.obligation_id;

    -- Notificar todos os admins da empresa
    insert into public.notifications (user_id, task_id, type, title, body, action_url)
    select
      p.user_id,
      NEW.id,
      'task_completed',
      '✅ Tarefa concluída',
      coalesce(obligation_code, NEW.title) || ' — ' || coalesce(contact_name, 'Cliente') ||
      case when auth.uid() is null then ' (automático: Receita)'
           else ' (por ' || coalesce(task_responsible_name, 'Colaborador') || ')' end,
      '/fiscal/tarefas'
    from public.profiles p
    where p.company_id = NEW.company_id
      and p.role = 'admin'
      and p.status_active = true;
  end if;
  return NEW;
end;
$function$;
