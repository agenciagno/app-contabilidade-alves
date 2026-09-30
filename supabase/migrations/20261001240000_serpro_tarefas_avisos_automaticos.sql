-- Serpro — tarefas criadas a partir da Receita e aviso do vencimento do DAS, 01/10/2026.
-- Só lê o que já está salvo no sistema (nenhuma chamada ao Serpro, custo zero). Roda por agendador (migration seguinte), nunca por gatilho.
--
-- serpro_criar_tarefas_receita(): cria tarefa fiscal (departamento fiscal, responsável do cliente) quando a Receita mandou algo e ainda não há tarefa aberta igual:
--   · comunicação crítica na Caixa Postal (intimação, malha, exclusão do Simples, MAED, cobrança, processo) ainda "nova", enviada nos últimos 30 dias;
--   · Situação Fiscal (último relatório pronto, leitura confiável, dos últimos 30 dias) com pendências;
--   · parcela de parcelamento em atraso (parcela anterior ao mês atual, cliente com parcelamento ativo).
--   Uma tarefa aberta por cliente e por tipo: enquanto ela estiver aberta, não cria outra. Interruptor: serpro_config.auto_criar_tarefas.
-- serpro_avisar_vencimento_das(): no dia do vencimento do DAS (dia 20, empurrado para segunda se cair no fim de semana; feriado não é tratado),
--   avisa a equipe (sino) quantos clientes têm DAS do mês anterior sem pagamento registrado e quantos do Simples ainda não foram consultados no mês.

alter table public.serpro_config add column auto_criar_tarefas boolean not null default true;
comment on column public.serpro_config.auto_criar_tarefas is 'Liga/desliga a criação automática de tarefas fiscais a partir da Receita (comunicação crítica, pendência na Situação Fiscal, parcela em atraso).';

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_das_vencimento'
  ]));

-- Cria a tarefa e avisa o responsável (ou os administradores, se o cliente não tem responsável). Devolve o id da tarefa.
create or replace function public.serpro_nova_tarefa_receita(p_company uuid, p_contact uuid, p_nome text, p_responsavel uuid, p_titulo text, p_descricao text, p_vencimento date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_resp uuid := public.get_effective_responsible(p_responsavel, (now() at time zone 'America/Sao_Paulo')::date);
  v_task uuid;
begin
  insert into public.fiscal_tasks (company_id, contact_id, responsible_id, title, description, status, due_date, department, is_auto_generated)
  values (p_company, p_contact, v_resp, p_titulo, p_descricao, 'a_fazer', p_vencimento, 'fiscal', true)
  returning id into v_task;

  insert into public.notifications (user_id, company_id, task_id, type, title, body, action_url)
  select p.user_id, p_company, v_task, 'task_assigned', 'Nova tarefa da Receita', p_nome || ' — ' || p_titulo, '/fiscal/tarefas'
  from public.profiles p
  where p.company_id = p_company and p.status_active = true and p.user_id is not null
    and (p.id = v_resp or (v_resp is null and p.role = 'admin'));
  return v_task;
end;
$function$;

create or replace function public.serpro_criar_tarefas_receita()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  r record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atual integer := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYYMM')::integer;
  v_total integer := 0;
  v_titulo text;
  v_abertas text[] := array['a_fazer', 'em_progresso', 'aguardando_cliente'];
  v_da_ca text[] := array['26764962000100', '08801596000130'];
begin
  for cfg in select company_id from public.serpro_config where auto_criar_tarefas is not false loop

    -- 1) Comunicações críticas da Caixa Postal ainda "novas"
    v_titulo := 'Receita Federal — comunicação a tratar';
    for r in
      select c.id as contact_id, c.responsible_id, coalesce(c.display_name, c.name) as nome, regexp_replace(c.document, '\D', '', 'g') as cnpj,
             count(*) as qtd,
             string_agg(distinct case m.categoria
               when 'intimacao' then 'Intimação / Termo' when 'malha' then 'Malha / Inconsistência' when 'exclusao_simples' then 'Exclusão do Simples'
               when 'maed' then 'Multa por atraso (MAED)' when 'cobranca' then 'Cobrança / Débito' when 'processo' then 'Processo' else m.categoria end, ', ') as categorias
      from public.serpro_caixa_postal_mensagens m
      join public.contacts c on c.id = m.contact_id
      where c.company_id = cfg.company_id and c.status_cliente = 'Ativo'
        and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
        and m.categoria in ('intimacao', 'malha', 'exclusao_simples', 'maed', 'cobranca', 'processo')
        and m.situacao = 'nova' and m.data_envio::date >= v_hoje - 30
        and not exists (select 1 from public.fiscal_tasks t where t.company_id = cfg.company_id and t.contact_id = c.id and t.title = v_titulo and t.status = any (v_abertas))
      group by c.id, c.responsible_id, c.display_name, c.name, c.document
    loop
      perform public.serpro_nova_tarefa_receita(cfg.company_id, r.contact_id, r.nome, r.responsible_id, v_titulo,
        r.qtd || case when r.qtd = 1 then ' comunicação' else ' comunicações' end || ' da Receita na Caixa Postal do e-CAC aguardando tratamento (' || r.categorias
          || '). Veja e acompanhe em Dashboard Federal > Termos de Intimação (busque pelo CNPJ ' || r.cnpj || '). Tarefa criada automaticamente pela integração com a Receita (Serpro).',
        v_hoje + 5);
      v_total := v_total + 1;
    end loop;

    -- 2) Situação Fiscal com pendências (último relatório pronto do cliente)
    v_titulo := 'Receita Federal — pendência na Situação Fiscal';
    for r in
      select u.contact_id, c.responsible_id, coalesce(c.display_name, c.name) as nome, regexp_replace(c.document, '\D', '', 'g') as cnpj, u.categorias, u.gerado_em
      from (
        select distinct on (s.contact_id) s.contact_id, s.resultado, s.confiavel, s.gerado_em, s.categorias
        from public.serpro_sitfis s where s.company_id = cfg.company_id and s.status = 'pronto'
        order by s.contact_id, s.gerado_em desc
      ) u
      join public.contacts c on c.id = u.contact_id
      where u.resultado = 'com_pendencias' and u.confiavel = true and u.gerado_em::date >= v_hoje - 30
        and c.status_cliente = 'Ativo' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
        and not exists (select 1 from public.fiscal_tasks t where t.company_id = cfg.company_id and t.contact_id = c.id and t.title = v_titulo and t.status = any (v_abertas))
    loop
      perform public.serpro_nova_tarefa_receita(cfg.company_id, r.contact_id, r.nome, r.responsible_id, v_titulo,
        'O relatório da Situação Fiscal de ' || to_char(r.gerado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ' aponta pendências'
          || case when r.categorias is not null and array_length(r.categorias, 1) > 0 then ' (' || array_to_string(r.categorias, ', ') || ')' else '' end
          || '. Abra o PDF em Dashboard Federal > Situação fiscal (busque pelo CNPJ ' || r.cnpj || ') e providencie a regularização. Tarefa criada automaticamente pela integração com a Receita (Serpro).',
        v_hoje + 7);
      v_total := v_total + 1;
    end loop;

    -- 3) Parcela de parcelamento em atraso
    v_titulo := 'Parcelamento — parcela em atraso';
    for r in
      select c.id as contact_id, c.responsible_id, coalesce(c.display_name, c.name) as nome, regexp_replace(c.document, '\D', '', 'g') as cnpj,
             count(*) as qtd, min(pa.parcela) as primeira
      from public.serpro_parcelas_abertas pa
      join public.contacts c on c.id = pa.contact_id
      where pa.company_id = cfg.company_id and pa.parcela < v_atual
        and c.status_cliente = 'Ativo' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
        and exists (select 1 from public.serpro_parcelamentos p where p.contact_id = c.id and p.ativo = true)
        and not exists (select 1 from public.fiscal_tasks t where t.company_id = cfg.company_id and t.contact_id = c.id and t.title = v_titulo and t.status = any (v_abertas))
      group by c.id, c.responsible_id, c.display_name, c.name, c.document
    loop
      perform public.serpro_nova_tarefa_receita(cfg.company_id, r.contact_id, r.nome, r.responsible_id, v_titulo,
        r.qtd || case when r.qtd = 1 then ' parcela' else ' parcelas' end || ' do parcelamento em atraso, a mais antiga de '
          || substr(r.primeira::text, 5, 2) || '/' || substr(r.primeira::text, 1, 4)
          || '. Veja em Dashboard Federal > Parcelamentos (busque pelo CNPJ ' || r.cnpj || ') e gere a guia. Tarefa criada automaticamente pela integração com a Receita (Serpro).',
        v_hoje + 3);
      v_total := v_total + 1;
    end loop;
  end loop;
  return v_total;
end;
$function$;

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
  -- Vencimento do DAS: dia 20, empurrado para o próximo dia útil quando cai no sábado ou domingo.
  v_venc := make_date(extract(year from v_hoje)::int, extract(month from v_hoje)::int, 20);
  while extract(dow from v_venc) in (0, 6) loop v_venc := v_venc + 1; end loop;
  if v_hoje <> v_venc then return 0; end if;
  v_pa := (date_trunc('month', v_hoje) - interval '1 month')::date;

  for cfg in select company_id from public.serpro_config loop
    -- Já avisou hoje? (a rotina pode ser chamada de novo à mão)
    if exists (select 1 from public.notifications n where n.company_id = cfg.company_id and n.type = 'serpro_das_vencimento' and (n.created_at at time zone 'America/Sao_Paulo')::date = v_hoje) then continue; end if;

    select count(*) into v_sem_pagamento from (
      select d.contact_id
      from public.serpro_pgdasd_das d join public.contacts c on c.id = d.contact_id
      where d.company_id = cfg.company_id and date_trunc('month', d.periodo_apuracao) = v_pa
        and c.status_cliente = 'Ativo' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
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
             || ' neste mês. Atualize (PGDAS e Pagamentos) antes de avisar os clientes.',
           '/dashboard-federal/fila-do-dia'
    from public.profiles p
    where p.company_id = cfg.company_id and p.status_active = true and p.user_id is not null
      and (p.role in ('admin', 'super_admin') or 'dashboard_federal' = any (p.allowed_modules));
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$;

-- Só o agendador (postgres) chama: nada de RPC por usuário logado ou anônimo.
revoke all on function public.serpro_nova_tarefa_receita(uuid, uuid, text, uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.serpro_criar_tarefas_receita() from public, anon, authenticated;
revoke all on function public.serpro_avisar_vencimento_das(date) from public, anon, authenticated;
