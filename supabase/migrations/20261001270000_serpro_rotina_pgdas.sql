-- Serpro — 01/10/2026: rotina automática do PGDAS-D (dia 16 e dia seguinte ao prazo), decidida por Gabriel.
-- 1) Interruptor da rotina em serpro_config (padrão ligado; a rotina custa R$ 0,24 por cliente consultado).
-- 2) Uma função só para "dia 20 passando ao próximo dia útil" (fim de semana OU feriado nacional da tabela national_holidays):
--    o 20/11/2026 é feriado (Consciência Negra), então o prazo daquele mês é 23/11. Usada pelos dois avisos do sino e pela rotina.
-- 3) O aviso do prazo do PGDAS-D deixa de pedir "consulte" quando a rotina já consultou todo mundo.

alter table public.serpro_config add column auto_rotina_pgdas boolean not null default true;
comment on column public.serpro_config.auto_rotina_pgdas is 'Rotina automática do PGDAS-D (serpro-pgdasd, action rotina_pgdas): dia 16 consulta a carteira do Simples; no dia seguinte ao prazo consulta só quem ainda não transmitiu. Custa 1 consulta por cliente.';

create or replace function public.serpro_vencimento_mensal(p_dia date)
returns date
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v date := make_date(extract(year from p_dia)::int, extract(month from p_dia)::int, 20);
begin
  while extract(dow from v) in (0, 6) or exists (select 1 from public.national_holidays h where h.date = v) loop
    v := v + 1;
  end loop;
  return v;
end;
$function$;

revoke all on function public.serpro_vencimento_mensal(date) from public, anon, authenticated;
grant execute on function public.serpro_vencimento_mensal(date) to service_role;

-- Cliente mapeado nas procurações sem NENHUMA ativa para o PGDAS-D: a consulta voltaria 403 (e seria cobrada), então a rotina nem tenta
-- e os avisos não contam o cliente como "ainda não consultado". Mesma regra da consulta da carteira em serpro-pgdasd.
create or replace function public.serpro_pgdas_sem_procuracao(p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.serpro_procuracoes pr
                 where pr.contact_id = p_contact and pr.fonte = 'integra_procuracoes'
                   and pr.codigo_procuracao = any (array['00146', '00006', '00004', '00060', '00002', '00103', '00050', '00051']))
     and not exists (select 1 from public.serpro_procuracoes pr
                     where pr.contact_id = p_contact and pr.fonte = 'integra_procuracoes'
                       and pr.codigo_procuracao = any (array['00146', '00006', '00004', '00060', '00002', '00103', '00050', '00051'])
                       and pr.status = 'ativa' and (pr.data_fim is null or pr.data_fim >= (now() at time zone 'America/Sao_Paulo')::date));
$function$;

revoke all on function public.serpro_pgdas_sem_procuracao(uuid) from public, anon, authenticated;
grant execute on function public.serpro_pgdas_sem_procuracao(uuid) to service_role;

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
  v_venc := public.serpro_vencimento_mensal(v_hoje);  -- dia 20, passando ao próximo dia útil (fim de semana ou feriado nacional)
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
      and not public.serpro_pgdas_sem_procuracao(c.id)
      and not exists (select 1 from public.serpro_pgdasd_consultas q where q.contact_id = c.id and q.ano = extract(year from v_pa)::int and q.consultado_em >= date_trunc('month', v_hoje));

    insert into public.notifications (user_id, company_id, type, title, body, action_url)
    select p.user_id, cfg.company_id, 'serpro_das_vencimento',
           'DAS de ' || to_char(v_pa, 'MM/YYYY') || ' vence hoje',
           v_sem_pagamento || case when v_sem_pagamento = 1 then ' cliente sem pagamento registrado na Receita' else ' clientes sem pagamento registrado na Receita' end
             || ' · ' || v_nao_consultados || case when v_nao_consultados = 1 then ' cliente do Simples ainda não consultado' else ' clientes do Simples ainda não consultados' end
             || ' neste mês. Atualize (Pagamentos e DAS) antes de avisar os clientes.',
           '/dashboard-federal/pagamentos'
    from public.profiles p
    where p.company_id = cfg.company_id and p.status_active = true and p.user_id is not null
      and (p.role in ('admin', 'super_admin') or 'dashboard_federal' = any (p.allowed_modules));
    v_total := v_total + 1;
  end loop;
  return v_total;
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
  -- Prazo do PGDAS-D: dia 20, passando ao próximo dia útil (fim de semana ou feriado nacional). O aviso sai no dia seguinte.
  v_prazo := public.serpro_vencimento_mensal(v_hoje);
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
      and not public.serpro_pgdas_sem_procuracao(c.id)
      and not exists (select 1 from public.serpro_pgdasd_consultas q where q.contact_id = c.id and q.ano = extract(year from v_pa)::int and (q.consultado_em at time zone 'America/Sao_Paulo')::date > v_prazo);

    insert into public.notifications (user_id, company_id, type, title, body, action_url)
    select p.user_id, cfg.company_id, 'serpro_pgdas_prazo',
           'Prazo do PGDAS-D de ' || to_char(v_pa, 'MM/YYYY') || ' terminou',
           v_sem_declaracao || case when v_sem_declaracao = 1 then ' cliente consultado depois do prazo sem declaração transmitida' else ' clientes consultados depois do prazo sem declaração transmitida' end
             || case when v_nao_consultados > 0
                  then ' · ' || v_nao_consultados || case when v_nao_consultados = 1 then ' cliente do Simples ainda não consultado' else ' clientes do Simples ainda não consultados' end
                       || ' depois do prazo. Consulte para saber quem não transmitiu.'
                  else '. Veja quais na tela PGDAS.' end,
           '/dashboard-federal/pgdas'
    from public.profiles p
    where p.company_id = cfg.company_id and p.status_active = true and p.user_id is not null
      and (p.role in ('admin', 'super_admin') or 'dashboard_federal' = any (p.allowed_modules));
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$;

revoke all on function public.serpro_avisar_vencimento_das(date) from public, anon, authenticated;
revoke all on function public.serpro_avisar_pgdas_prazo(date) from public, anon, authenticated;
