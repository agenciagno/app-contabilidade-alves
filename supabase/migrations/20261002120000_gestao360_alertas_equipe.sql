-- Gestão 360° · Rodada 2 (02/10/2026): alertas da equipe no sino.
-- Mesmo padrão dos avisos do Serpro: função SQL (security definer) chamada pelo pg_cron, sem HTTP e sem chave, só lê o que já está salvo
-- (custo zero no Serpro). Cada alerta nasce uma vez por item (tabela alerta_enviados), vai agrupado para o responsável do cliente
-- (ou para quem o cobre na ausência) e, sem responsável, para os administradores.
--
--   A1  PGDAS-D sem transmitir faltando 3 dias (ou menos) para o prazo        interruptor: serpro_config.alerta_pgdas_antes_prazo
--   A3  Mensagem crítica da Receita ainda "nova" há 3 dias ou mais             interruptor: serpro_config.alerta_mensagem_parada
--   A7  Tarefa de DAS concluída, mas a Receita não mostra o PGDAS-D            interruptor: serpro_config.alerta_baixa_sem_declaracao
--   A9  Cliente avisado (e-mail ou WhatsApp) há 3 dias ou mais, declaração ainda em aberto   interruptor: serpro_config.alerta_sem_resposta
--
-- A regra de "em falta / a vencer / a confirmar" do PGDAS-D é a mesma do app (src/lib/situacaoCarteira.ts, avaliarPgdas):
-- só uma consulta depois do prazo prova que não foi transmitida; antes do prazo é "a vencer"; competência só conta a partir do mês
-- de abertura da empresa e depois da 1ª declaração do ano; cliente nunca consultado no ano não entra.

alter table public.serpro_config
  add column if not exists alerta_pgdas_antes_prazo boolean not null default true,
  add column if not exists alerta_mensagem_parada boolean not null default true,
  add column if not exists alerta_baixa_sem_declaracao boolean not null default true,
  add column if not exists alerta_sem_resposta boolean not null default true;

comment on column public.serpro_config.alerta_pgdas_antes_prazo is 'Alerta da equipe: PGDAS-D sem transmitir faltando até 3 dias para o prazo (sino, por responsável).';
comment on column public.serpro_config.alerta_mensagem_parada is 'Alerta da equipe: mensagem crítica da Receita ainda "nova" há 3 dias ou mais (sino, por responsável).';
comment on column public.serpro_config.alerta_baixa_sem_declaracao is 'Alerta da equipe: tarefa de DAS concluída sem PGDAS-D na Receita (sino, por responsável).';
comment on column public.serpro_config.alerta_sem_resposta is 'Alerta da equipe: cliente avisado há 3 dias ou mais e a declaração continua em aberto (sino, por responsável).';

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb',
    'serpro_das_vencimento', 'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis', 'serpro_sitfis',
    'gestao360_pgdas_antes_prazo', 'gestao360_mensagem_parada', 'gestao360_baixa_sem_declaracao', 'gestao360_sem_resposta'
  ]));

-- Um registro por item já alertado: o alerta nunca repete e uma rodada perdida não perde nada (pega no dia seguinte).
-- Sem policy: só as funções abaixo (security definer) mexem.
create table public.alerta_enviados (
  company_id uuid not null references public.companies(id) on delete cascade,
  chave text not null,
  enviado_em timestamptz not null default now(),
  primary key (company_id, chave)
);
alter table public.alerta_enviados enable row level security;
comment on table public.alerta_enviados is 'Itens que já geraram alerta da equipe (Gestão 360°). Evita repetir. Só as funções gestao360_* gravam.';

-- Situação do PGDAS-D de um cliente em uma competência, com a mesma regra do app.
-- Devolve: em_falta | a_confirmar | a_vencer | em_dia | nao_consultado | nao_aplica.
create or replace function public.serpro_pgdas_situacao(p_contact uuid, p_pa date, p_hoje date)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  c record;
  v_pa date := date_trunc('month', p_pa)::date;
  v_ano integer := extract(year from p_pa)::integer;
  v_abertura date;
  v_inicio date;
  v_primeira date;
  v_prazo date;
  v_consulta date;
  v_doc text;
begin
  select ct.tax_regime, ct.status_cliente, ct.document, coalesce(ct.data_abertura_receita, ct.data_abertura_rf) as abertura into c
  from public.contacts ct where ct.id = p_contact;
  if not found then return 'nao_aplica'; end if;
  v_doc := regexp_replace(coalesce(c.document, ''), '\D', '', 'g');
  if c.tax_regime is distinct from 'simples_nacional' or c.status_cliente is distinct from 'Ativo'
     or length(v_doc) <> 14 or substr(v_doc, 9, 4) <> '0001' then return 'nao_aplica'; end if;

  v_abertura := c.abertura;
  if v_abertura is not null and extract(year from v_abertura)::integer > v_ano then return 'nao_aplica'; end if;

  select max((q.consultado_em at time zone 'America/Sao_Paulo')::date) into v_consulta
  from public.serpro_pgdasd_consultas q where q.contact_id = p_contact and q.ano = v_ano;
  if v_consulta is null then return 'nao_consultado'; end if;

  v_inicio := case when v_abertura is not null and extract(year from v_abertura)::integer = v_ano then date_trunc('month', v_abertura)::date else make_date(v_ano, 1, 1) end;
  if v_pa < v_inicio then return 'nao_aplica'; end if;

  if exists (select 1 from public.serpro_pgdasd_declaracoes d where d.contact_id = p_contact and date_trunc('month', d.periodo_apuracao)::date = v_pa) then return 'em_dia'; end if;

  select min(date_trunc('month', d.periodo_apuracao)::date) into v_primeira
  from public.serpro_pgdasd_declaracoes d where d.contact_id = p_contact and extract(year from d.periodo_apuracao)::integer = v_ano;
  if v_primeira is not null and v_pa < v_primeira then return 'nao_aplica'; end if; -- antes da 1ª declaração do ano: não dá para saber se já era obrigada

  v_prazo := public.serpro_vencimento_mensal((v_pa + interval '1 month')::date);
  if p_hoje <= v_prazo then return 'a_vencer'; end if;
  if v_consulta > v_prazo then return 'em_falta'; end if;
  return 'a_confirmar';
end;
$function$;

create or replace function public.gestao360_lista_nomes(p_nomes text[], p_max integer default 3)
returns text
language sql
immutable
as $function$
  select array_to_string(p_nomes[1:p_max], ', ') || case when coalesce(array_length(p_nomes, 1), 0) > p_max then ' e mais ' || (array_length(p_nomes, 1) - p_max) else '' end;
$function$;

-- Põe a notificação no sino do responsável; sem responsável (ou sem usuário ativo), nos administradores.
create or replace function public.gestao360_avisar_equipe(p_company uuid, p_type text, p_resp uuid, p_titulo text, p_corpo text, p_url text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v integer := 0;
begin
  if p_resp is not null then
    insert into public.notifications (user_id, company_id, type, title, body, action_url)
    select p.user_id, p_company, p_type, p_titulo, p_corpo, p_url
    from public.profiles p
    where p.company_id = p_company and p.status_active = true and p.user_id is not null and p.id = p_resp;
    get diagnostics v = row_count;
  end if;
  if v = 0 then
    insert into public.notifications (user_id, company_id, type, title, body, action_url)
    select p.user_id, p_company, p_type, p_titulo, p_corpo, p_url
    from public.profiles p
    where p.company_id = p_company and p.status_active = true and p.user_id is not null and p.role in ('admin', 'super_admin');
    get diagnostics v = row_count;
  end if;
  return v;
end;
$function$;

create or replace function public.gestao360_alertas_equipe(p_hoje date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  g record;
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);  -- p_hoje: só para teste ou reenvio à mão
  v_prazo date := public.serpro_vencimento_mensal(v_hoje);                           -- prazo do PGDAS-D do mês anterior
  v_pa date := (date_trunc('month', v_hoje) - interval '1 month')::date;
  v_total integer := 0;
  v_da_ca text[] := array['26764962000100', '08801596000130'];
  v_url text;
begin
  for cfg in select * from public.serpro_config loop

    -- A1 · PGDAS-D faltando até 3 dias para o prazo. Só entra cliente com leitura dos últimos 7 dias (leitura velha não prova nada).
    if cfg.alerta_pgdas_antes_prazo is not false and v_hoje between v_prazo - 3 and v_prazo then
      for g in
        select x.resp, count(*) as n, array_agg(x.nome order by x.nome) as nomes, array_agg(x.chave) as chaves
        from (
          select 'a1:' || c.id || ':' || to_char(v_pa, 'YYYY-MM') as chave, coalesce(c.display_name, c.name) as nome,
                 public.get_effective_responsible(c.responsible_id, v_hoje) as resp
          from public.contacts c
          where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and c.tax_regime = 'simples_nacional'
            and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
            and exists (select 1 from public.serpro_pgdasd_consultas q where q.contact_id = c.id and q.ano = extract(year from v_pa)::integer
                          and (q.consultado_em at time zone 'America/Sao_Paulo')::date >= v_hoje - 7)
            and public.serpro_pgdas_situacao(c.id, v_pa, v_hoje) = 'a_vencer'
            and not exists (select 1 from public.alerta_enviados e where e.company_id = cfg.company_id and e.chave = 'a1:' || c.id || ':' || to_char(v_pa, 'YYYY-MM'))
        ) x group by x.resp
      loop
        v_url := '/gestao-360/portal?resp=' || coalesce(g.resp::text, 'sem');
        perform public.gestao360_avisar_equipe(cfg.company_id, 'gestao360_pgdas_antes_prazo', g.resp,
          case when v_prazo = v_hoje then 'PGDAS-D de ' || to_char(v_pa, 'MM/YYYY') || ': o prazo é hoje'
               else 'PGDAS-D de ' || to_char(v_pa, 'MM/YYYY') || ': faltam ' || (v_prazo - v_hoje) || case when v_prazo - v_hoje = 1 then ' dia' else ' dias' end end,
          g.n || case when g.n = 1 then ' cliente sem' else ' clientes sem' end || ' PGDAS-D transmitido na última leitura: ' || public.gestao360_lista_nomes(g.nomes)
            || '. Prazo: ' || to_char(v_prazo, 'DD/MM/YYYY') || '. Avise pela fila "Para agir hoje" do Portal 360°.', v_url);
        insert into public.alerta_enviados (company_id, chave) select cfg.company_id, unnest(g.chaves) on conflict do nothing;
        v_total := v_total + 1;
      end loop;
    end if;

    -- A3 · Mensagem crítica da Receita ainda "nova" há 3 dias ou mais (últimos 30 dias).
    if cfg.alerta_mensagem_parada is not false then
      for g in
        select x.resp, count(distinct x.contact_id) as n, array_agg(distinct x.nome) as nomes, array_agg(x.chave) as chaves
        from (
          select 'a3:' || m.id as chave, c.id as contact_id, coalesce(c.display_name, c.name) as nome, public.get_effective_responsible(c.responsible_id, v_hoje) as resp
          from public.serpro_caixa_postal_mensagens m join public.contacts c on c.id = m.contact_id
          where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
            and m.categoria in ('intimacao', 'malha', 'exclusao_simples', 'maed', 'cobranca', 'processo') and m.situacao = 'nova'
            and (m.data_envio at time zone 'America/Sao_Paulo')::date between v_hoje - 30 and v_hoje - 3
            and not exists (select 1 from public.alerta_enviados e where e.company_id = cfg.company_id and e.chave = 'a3:' || m.id)
        ) x group by x.resp
      loop
        perform public.gestao360_avisar_equipe(cfg.company_id, 'gestao360_mensagem_parada', g.resp,
          'Mensagem da Receita sem tratamento há 3 dias ou mais',
          g.n || case when g.n = 1 then ' cliente com mensagem' else ' clientes com mensagem' end || ' crítica da Receita ainda como nova: ' || public.gestao360_lista_nomes(g.nomes)
            || '. Abra em Termos de Intimação e dê andamento.', '/dashboard-federal/intimacoes');
        insert into public.alerta_enviados (company_id, chave) select cfg.company_id, unnest(g.chaves) on conflict do nothing;
        v_total := v_total + 1;
      end loop;
    end if;

    -- A7 · Tarefa de DAS concluída, mas a Receita não mostra o PGDAS-D (competências dos últimos 3 meses).
    if cfg.alerta_baixa_sem_declaracao is not false then
      for g in
        select x.resp, count(distinct x.contact_id) as n, array_agg(distinct x.nome) as nomes, array_agg(x.chave) as chaves
        from (
          select 'a7:' || t.id as chave, c.id as contact_id, coalesce(c.display_name, c.name) as nome, public.get_effective_responsible(coalesce(t.responsible_id, c.responsible_id), v_hoje) as resp
          from public.fiscal_tasks t
          join public.fiscal_obligations_catalog o on o.id = t.obligation_id and o.name = 'DAS - Simples Nacional'
          join public.contacts c on c.id = t.contact_id
          where t.company_id = cfg.company_id and t.status = 'concluido' and t.competence_year is not null and t.competence_month is not null
            and make_date(t.competence_year, t.competence_month, 1) >= (date_trunc('month', v_hoje) - interval '3 months')::date
            and public.serpro_pgdas_situacao(t.contact_id, make_date(t.competence_year, t.competence_month, 1), v_hoje) = 'em_falta'
            and not exists (select 1 from public.alerta_enviados e where e.company_id = cfg.company_id and e.chave = 'a7:' || t.id)
        ) x group by x.resp
      loop
        perform public.gestao360_avisar_equipe(cfg.company_id, 'gestao360_baixa_sem_declaracao', g.resp,
          'Tarefa de DAS concluída sem declaração na Receita',
          g.n || case when g.n = 1 then ' cliente' else ' clientes' end || ' com a tarefa de DAS concluída, mas sem PGDAS-D na Receita: ' || public.gestao360_lista_nomes(g.nomes)
            || '. Confira e, se for o caso, reabra em CA · Ausências > Cross-check.', '/gestao-360/ausencias?aba=cross-check');
        insert into public.alerta_enviados (company_id, chave) select cfg.company_id, unnest(g.chaves) on conflict do nothing;
        v_total := v_total + 1;
      end loop;
    end if;

    -- A9 · Cliente avisado (e-mail ou WhatsApp) a partir de uma ausência há 3 dias ou mais e a declaração continua em aberto.
    -- Só enquanto o acompanhamento estiver em "a tratar", "cliente avisado" ou "aguardando cliente" (em andamento ou transmitida: a equipe já está nisso).
    if cfg.alerta_sem_resposta is not false then
      for g in
        select y.resp, count(distinct y.contact_id) as n, array_agg(distinct y.nome) as nomes, array_agg(y.chave) as chaves
        from (
          select 'a9:' || x.contact_id || ':' || x.obrigacao || ':' || x.competencia as chave, x.contact_id, coalesce(c.display_name, c.name) as nome,
                 public.get_effective_responsible(coalesce(ac.responsavel_id, c.responsible_id), v_hoje) as resp
          from (
            select e.contact_id, e.referencia ->> 'obrigacao' as obrigacao, e.referencia ->> 'competencia' as competencia, min(e.enviado_em) as primeiro
            from public.client_envios e
            where e.company_id = cfg.company_id and e.origem = 'ausencia' and e.canal in ('email', 'whatsapp')
              and (e.referencia ->> 'obrigacao') in ('PGDAS-D', 'DEFIS') and (e.referencia ->> 'competencia') is not null
            group by e.contact_id, e.referencia ->> 'obrigacao', e.referencia ->> 'competencia'
          ) x
          join public.contacts c on c.id = x.contact_id
          left join lateral (
            select a.situacao, a.responsavel_id from public.ausencia_acompanhamento a
            where a.company_id = cfg.company_id and a.contact_id = x.contact_id and a.obrigacao = x.obrigacao and a.competencia = x.competencia limit 1
          ) ac on true
          cross join lateral (
            select case
              when x.obrigacao = 'PGDAS-D' and x.competencia ~ '^\d{4}-\d{2}$' then public.serpro_pgdas_situacao(x.contact_id, (x.competencia || '-01')::date, v_hoje)
              when x.obrigacao = 'DEFIS' and x.competencia ~ '^\d{4}$' then
                case when exists (select 1 from public.serpro_defis d where d.contact_id = x.contact_id and d.ano_calendario = x.competencia::integer) then 'em_dia' else 'em_falta' end
            end as s
          ) st
          where c.status_cliente = 'Ativo'
            and (x.primeiro at time zone 'America/Sao_Paulo')::date between v_hoje - 30 and v_hoje - 3
            and st.s in ('em_falta', 'a_vencer', 'a_confirmar')
            and coalesce(ac.situacao, 'cliente_avisado') in ('a_tratar', 'cliente_avisado', 'aguardando_cliente')
            and not exists (select 1 from public.alerta_enviados e where e.company_id = cfg.company_id and e.chave = 'a9:' || x.contact_id || ':' || x.obrigacao || ':' || x.competencia)
        ) y group by y.resp
      loop
        perform public.gestao360_avisar_equipe(cfg.company_id, 'gestao360_sem_resposta', g.resp,
          'Cliente avisado sem resposta há 3 dias ou mais',
          g.n || case when g.n = 1 then ' cliente avisado' else ' clientes avisados' end || ' e com a declaração ainda em aberto: ' || public.gestao360_lista_nomes(g.nomes)
            || '. Veja em CA · Ausências e cobre de novo.', '/gestao-360/ausencias');
        insert into public.alerta_enviados (company_id, chave) select cfg.company_id, unnest(g.chaves) on conflict do nothing;
        v_total := v_total + 1;
      end loop;
    end if;

  end loop;
  return v_total;
end;
$function$;

-- Só o agendador (postgres) chama: nada de RPC por usuário logado ou anônimo.
revoke all on function public.serpro_pgdas_situacao(uuid, date, date) from public, anon, authenticated;
revoke all on function public.gestao360_avisar_equipe(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.gestao360_alertas_equipe(date) from public, anon, authenticated;
