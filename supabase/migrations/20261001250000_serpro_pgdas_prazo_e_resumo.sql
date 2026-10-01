-- Serpro — primeira etapa de Pagamentos/DAS/PGDAS, 01/10/2026.
-- 1) Chave do passe único da carteira (guarda só o hash, com validade curta).
-- 2) A conclusão automática de tarefa fiscal não gera mais um aviso por tarefa: as funções avisam uma vez só ("N tarefas concluídas pela Receita").
--    Conclusão feita por pessoa continua avisando os administradores como antes.
-- 3) Aviso no sino no dia seguinte ao prazo do PGDAS-D (dia 20, segunda se cair no fim de semana).
-- 4) O aviso do dia do vencimento do DAS também considera o pagamento visto em Pagamentos (PAGTOWEB), não só a marca "pago" do PGDAS.

alter table public.serpro_config add column lote_token_hash text;
alter table public.serpro_config add column lote_token_expira timestamptz;
comment on column public.serpro_config.lote_token_hash is 'SHA-256 da chave de uso curto do passe único da carteira (serpro-pgdasd, consultar_carteira). Vazio quando não há passe em andamento.';

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_das_vencimento', 'serpro_pgdas_prazo'
  ]));

create or replace function public.notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  task_responsible_name text;
  contact_name text;
  obligation_code text;
begin
  if NEW.status = 'concluido' and OLD.status != 'concluido' then
    NEW.completed_at := now();

    -- Conclusão automática pela Receita (sem usuário logado, com a marca nas notas): quem concluiu avisa uma vez só pelo lote.
    if auth.uid() is null and coalesce(NEW.completion_notes, '') like 'Concluída automaticamente%' then
      return NEW;
    end if;

    select full_name into task_responsible_name from public.profiles where id = NEW.responsible_id;
    select name into contact_name from public.contacts where id = NEW.contact_id;
    select code into obligation_code from public.fiscal_obligations_catalog where id = NEW.obligation_id;

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

create or replace function public.serpro_avisar_pgdas_prazo(p_hoje date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);  -- p_hoje: só para teste ou reenvio à mão
  v_prazo date;
  v_pa date;
  v_sem_declaracao integer;
  v_nao_consultados integer;
  v_total integer := 0;
  v_da_ca text[] := array['26764962000100', '08801596000130'];
begin
  -- Prazo do PGDAS-D: dia 20, segunda se cair no fim de semana. O aviso sai no dia seguinte.
  v_prazo := make_date(extract(year from v_hoje)::int, extract(month from v_hoje)::int, 20);
  while extract(dow from v_prazo) in (0, 6) loop v_prazo := v_prazo + 1; end loop;
  if v_hoje <> v_prazo + 1 then return 0; end if;
  v_pa := (date_trunc('month', v_hoje) - interval '1 month')::date;

  for cfg in select company_id from public.serpro_config loop
    if exists (select 1 from public.notifications n where n.company_id = cfg.company_id and n.type = 'serpro_pgdas_prazo' and (n.created_at at time zone 'America/Sao_Paulo')::date = v_hoje) then continue; end if;

    -- Só uma consulta feita DEPOIS do prazo prova que não foi transmitida (antes do prazo ainda podia ser).
    select count(*) into v_sem_declaracao
    from public.serpro_pgdasd_consultas q join public.contacts c on c.id = q.contact_id
    where q.company_id = cfg.company_id and q.ano = extract(year from v_pa)::int
      and (q.consultado_em at time zone 'America/Sao_Paulo')::date > v_prazo
      and c.status_cliente = 'Ativo' and c.tax_regime = 'simples_nacional'
      and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
      and not exists (select 1 from public.serpro_pgdasd_declaracoes d where d.contact_id = c.id and date_trunc('month', d.periodo_apuracao) = v_pa);

    select count(*) into v_nao_consultados
    from public.contacts c
    where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and c.tax_regime = 'simples_nacional'
      and length(regexp_replace(c.document, '\D', '', 'g')) = 14 and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001'
      and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
      and not exists (select 1 from public.serpro_pgdasd_consultas q where q.contact_id = c.id and q.ano = extract(year from v_pa)::int and (q.consultado_em at time zone 'America/Sao_Paulo')::date > v_prazo);

    insert into public.notifications (user_id, company_id, type, title, body, action_url)
    select p.user_id, cfg.company_id, 'serpro_pgdas_prazo',
           'Prazo do PGDAS-D de ' || to_char(v_pa, 'MM/YYYY') || ' terminou',
           v_sem_declaracao || case when v_sem_declaracao = 1 then ' cliente consultado depois do prazo sem declaração transmitida' else ' clientes consultados depois do prazo sem declaração transmitida' end
             || ' · ' || v_nao_consultados || case when v_nao_consultados = 1 then ' cliente do Simples ainda não consultado' else ' clientes do Simples ainda não consultados' end
             || ' depois do prazo. Consulte para saber quem não transmitiu.',
           '/dashboard-federal/pgdas'
    from public.profiles p
    where p.company_id = cfg.company_id and p.status_active = true and p.user_id is not null
      and (p.role in ('admin', 'super_admin') or 'dashboard_federal' = any (p.allowed_modules));
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$;

-- Aviso do vencimento do DAS: o pagamento visto em Pagamentos (PAGTOWEB) também tira o cliente da lista de "sem pagamento".
create or replace function public.serpro_avisar_vencimento_das(p_hoje date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);  -- p_hoje: só para teste ou reenvio à mão
  v_venc date;
  v_pa date;
  v_sem_pagamento integer;
  v_nao_consultados integer;
  v_total integer := 0;
  v_da_ca text[] := array['26764962000100', '08801596000130'];
begin
  v_venc := make_date(extract(year from v_hoje)::int, extract(month from v_hoje)::int, 20);
  while extract(dow from v_venc) in (0, 6) loop v_venc := v_venc + 1; end loop;
  if v_hoje <> v_venc then return 0; end if;
  v_pa := (date_trunc('month', v_hoje) - interval '1 month')::date;

  for cfg in select company_id from public.serpro_config loop
    if exists (select 1 from public.notifications n where n.company_id = cfg.company_id and n.type = 'serpro_das_vencimento' and (n.created_at at time zone 'America/Sao_Paulo')::date = v_hoje) then continue; end if;

    select count(*) into v_sem_pagamento from (
      select d.contact_id
      from public.serpro_pgdasd_das d join public.contacts c on c.id = d.contact_id
      where d.company_id = cfg.company_id and date_trunc('month', d.periodo_apuracao) = v_pa
        and c.status_cliente = 'Ativo' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
        and not exists (select 1 from public.serpro_pagamentos pg where pg.contact_id = d.contact_id and pg.tipo_sigla = 'DAS' and date_trunc('month', pg.periodo_apuracao) = v_pa)
      group by d.contact_id
      having not bool_or(coalesce(d.das_pago, false))
    ) x;

    select count(*) into v_nao_consultados
    from public.contacts c
    where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and c.tax_regime = 'simples_nacional'
      and length(regexp_replace(c.document, '\D', '', 'g')) = 14 and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001'
      and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
      and not exists (select 1 from public.serpro_pgdasd_consultas q where q.contact_id = c.id and q.ano = extract(year from v_pa)::int and q.consultado_em >= date_trunc('month', v_hoje));

    insert into public.notifications (user_id, company_id, type, title, body, action_url)
    select p.user_id, cfg.company_id, 'serpro_das_vencimento',
           'DAS de ' || to_char(v_pa, 'MM/YYYY') || ' vence hoje',
           v_sem_pagamento || case when v_sem_pagamento = 1 then ' cliente sem pagamento registrado na Receita' else ' clientes sem pagamento registrado na Receita' end
             || ' · ' || v_nao_consultados || case when v_nao_consultados = 1 then ' cliente do Simples ainda não consultado' else ' clientes do Simples ainda não consultados' end
             || ' neste mês. Atualize (Pagamentos e DAS) antes de avisar os clientes.',
           '/dashboard-federal/fila-do-dia'
    from public.profiles p
    where p.company_id = cfg.company_id and p.status_active = true and p.user_id is not null
      and (p.role in ('admin', 'super_admin') or 'dashboard_federal' = any (p.allowed_modules));
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$;

revoke all on function public.serpro_avisar_pgdas_prazo(date) from public, anon, authenticated;
revoke all on function public.serpro_avisar_vencimento_das(date) from public, anon, authenticated;
