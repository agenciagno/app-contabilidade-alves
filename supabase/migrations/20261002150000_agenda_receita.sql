-- Agenda oficial da Receita Federal como fonte soberana do calendário fiscal, 02/10/2026.
-- Rotina (função agenda-receita) baixa a planilha ADE do mês no gov.br, grava os itens, calcula o calendário (data oficial onde há linha
-- correspondente, regra do sistema no resto) e deixa um RASCUNHO para a equipe revisar, editar e aprovar; aprovar lança as tarefas.
-- Estadual e municipal seguem pelas regras do catálogo (decisão de Gabriel). Só fonte gratuita direto da Receita.

-- ---------------------------------------------------------------- origem de cada linha do calendário
alter table public.fiscal_calendar
  add column fonte text not null default 'regra' check (fonte in ('regra', 'receita')),
  add column agenda_importacao_id uuid;
comment on column public.fiscal_calendar.fonte is 'regra = calculada pela regra do catálogo; receita = data da planilha oficial da Receita (não é recalculada pela regra).';

-- Mesma view, com as duas colunas novas no fim (mantém security_invoker).
create or replace view public.fiscal_calendar_effective with (security_invoker = on) as
select fc.id, fc.obligation_id, fc.year, fc.month, fc.competence_year, fc.competence_month,
  fc.raw_due_date, fc.adjusted_due_date, fc.internal_delivery_date,
  fc.adjusted_due_date_override, fc.internal_delivery_date_override, fc.override_reason, fc.overridden_by, fc.overridden_at,
  fc.created_at, fc.updated_at,
  o.code as obligation_code, o.name as obligation_name, o.applies_to, o.frequency, o.holiday_adjustment, o.requires_employees,
  coalesce(fc.adjusted_due_date_override, fc.adjusted_due_date) as effective_due_date,
  coalesce(fc.internal_delivery_date_override, fc.internal_delivery_date) as effective_delivery_date,
  fc.adjusted_due_date_override is not null as has_override,
  fc.fonte, fc.agenda_importacao_id
from public.fiscal_calendar fc
join public.fiscal_obligations_catalog o on o.id = fc.obligation_id;

-- ---------------------------------------------------------------- importações (uma por mês de vencimento)
create table public.agenda_receita_importacoes (
  id uuid primary key default gen_random_uuid(),
  ano smallint not null,
  mes smallint not null check (mes between 1 and 12),   -- mês do VENCIMENTO (a competência é o mês anterior)
  fonte text not null check (fonte in ('receita', 'regras')),  -- regras = planilha ainda não publicada, rascunho só pelas regras
  ade_titulo text,                                       -- ex.: "ADE Corat nº 78 de 28/09/26"
  pagina_url text,
  xlsx_url text,
  itens_tributos integer not null default 0,
  itens_declaracoes integer not null default 0,
  resumo jsonb not null default '[]'::jsonb,             -- por obrigação: regra x oficial x final
  baixado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ano, mes)
);

create table public.agenda_receita_itens (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.agenda_receita_importacoes(id) on delete cascade,
  aba text not null check (aba in ('tributos', 'declaracoes')),
  dia smallint,                  -- null quando a Receita não dá um dia do mês
  dia_texto text,
  codigo_receita text,
  grupo text,
  descricao text,
  periodo text,
  periodicidade text,
  documento text,
  categoria_declaracao text,
  origem_escrituracao text,
  base_legal text,
  interessado text
);
create index agenda_receita_itens_imp_idx on public.agenda_receita_itens (importacao_id, aba);

-- Aprovação é por empresa: aprovar lança as tarefas da empresa de quem aprova.
create table public.agenda_receita_aprovacoes (
  importacao_id uuid not null references public.agenda_receita_importacoes(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  aprovado_por uuid,
  aprovado_em timestamptz not null default now(),
  tarefas_criadas integer not null default 0,
  primary key (importacao_id, company_id)
);

-- Como cada obrigação do catálogo é casada com as linhas da planilha oficial (editável).
create table public.agenda_receita_mapeamento (
  obligation_id uuid primary key references public.fiscal_obligations_catalog(id) on delete cascade,
  aba text not null check (aba in ('tributos', 'declaracoes')),
  campo text not null check (campo in ('grupo', 'descricao', 'codigo_receita')),
  padrao text,                   -- regex sem diferenciar maiúsculas
  codigos text[],                -- ou lista exata de códigos de receita
  observacao text,
  check (padrao is not null or codigos is not null)
);

create trigger agenda_receita_importacoes_updated_at before update on public.agenda_receita_importacoes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS: dados da Receita são públicos; só o backend escreve
alter table public.agenda_receita_importacoes enable row level security;
alter table public.agenda_receita_itens enable row level security;
alter table public.agenda_receita_aprovacoes enable row level security;
alter table public.agenda_receita_mapeamento enable row level security;

create policy "agenda_receita_importacoes leitura" on public.agenda_receita_importacoes for select to authenticated using (true);
create policy "agenda_receita_itens leitura" on public.agenda_receita_itens for select to authenticated using (true);
create policy "agenda_receita_mapeamento leitura" on public.agenda_receita_mapeamento for select to authenticated using (true);
create policy "agenda_receita_aprovacoes leitura da empresa" on public.agenda_receita_aprovacoes for select to authenticated
  using (company_id = (select p.company_id from public.profiles p where p.user_id = (select auth.uid()) limit 1));

-- Aprovar = registrar quem aprovou. O lançamento das tarefas segue o fluxo já existente (generate_monthly_fiscal_tasks), chamado pela tela.
create or replace function public.agenda_receita_aprovar(p_importacao_id uuid, p_tarefas integer default 0)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super
  from public.profiles where user_id = auth.uid() limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then
    raise exception 'Só administradores aprovam a agenda';
  end if;
  insert into public.agenda_receita_aprovacoes (importacao_id, company_id, aprovado_por, tarefas_criadas)
  values (p_importacao_id, v_company, auth.uid(), greatest(coalesce(p_tarefas, 0), 0))
  on conflict (importacao_id, company_id) do update
    set aprovado_por = excluded.aprovado_por, aprovado_em = now(),
        tarefas_criadas = public.agenda_receita_aprovacoes.tarefas_criadas + excluded.tarefas_criadas;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.agenda_receita_aprovar(uuid, integer) from public, anon;
grant execute on function public.agenda_receita_aprovar(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------- novo tipo de notificação
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed', 'coverage_started', 'coverage_ended', 'popup', 'boleto_pago',
    'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_dctfweb_rodada', 'serpro_das_vencimento',
    'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis', 'serpro_sitfis',
    'gestao360_pgdas_antes_prazo', 'gestao360_mensagem_parada', 'gestao360_baixa_sem_declaracao', 'gestao360_sem_resposta',
    'agenda_fiscal'
  ]));

-- ---------------------------------------------------------------- catálogo: DCTF vira DCTFWeb e as regras de data passam a bater com a Receita
-- (conferido contra a ADE de outubro/26: MIT e DCTFWeb 30, IRPJ/CSLL 30, PIS/COFINS 23 = dia 25 antecipado.)
update public.fiscal_obligations_catalog
   set name = 'DCTFWeb', due_rule = 'last_business_day',
       description = 'Declaração de Débitos e Créditos Tributários Federais (DCTFWeb). Substitui a DCTF mensal.'
 where name = 'DCTF' and is_custom = true;
update public.fiscal_obligations_catalog set due_rule = 'last_business_day' where name in ('MIT', 'IRPJ/ CSLL') and is_custom = true;
update public.fiscal_obligations_catalog set due_rule = 'day_25' where name = 'PIS/ COFINS' and is_custom = true;

-- Mapeamento inicial. O resto (ICMS, ISS, SEDIF, SINTEGRA, DAPI, SPED ICMS, Declaração Municipal, Folha, Pró-Labore) fica pela regra.
insert into public.agenda_receita_mapeamento (obligation_id, aba, campo, padrao, codigos, observacao)
select c.id, m.aba, m.campo, m.padrao, m.codigos, m.observacao
from public.fiscal_obligations_catalog c
join (values
  ('DAS - Simples Nacional', 'tributos',    'grupo',          '^Simples Nacional$', null::text[],                              'Grupo "Simples Nacional" da aba Tributos (guia mensal)'),
  ('EFD-Reinf (DCTF)',       'declaracoes', 'descricao',      '^EFD-Reinf',         null,                                      'EFD-Reinf'),
  ('SPED PIS/COFINS',        'declaracoes', 'descricao',      '^EFD-Contribuições', null,                                      'EFD-Contribuições'),
  ('MIT',                    'declaracoes', 'descricao',      '^DCTFWeb',           null,                                      'MIT acompanha o prazo da DCTFWeb'),
  ('DCTFWeb',                'declaracoes', 'descricao',      '^DCTFWeb',           null,                                      'DCTFWeb'),
  ('IRPJ/ CSLL',             'tributos',    'codigo_receita', null,                 array['2362','2484','2089','2372'],        'Estimativa mensal (2362/2484) e quota do presumido (2089/2372)'),
  ('PIS/ COFINS',            'tributos',    'codigo_receita', null,                 array['8109','2172'],                      'PIS faturamento (8109) e Cofins demais entidades (2172)')
) as m(nome, aba, campo, padrao, codigos, observacao) on m.nome = c.name
where c.is_custom = true;

comment on table public.agenda_receita_importacoes is 'Planilha ADE da Receita por mês de vencimento: rascunho do calendário para revisão e aprovação. Escrita só pela função agenda-receita.';
comment on table public.agenda_receita_mapeamento is 'Casamento obrigação do catálogo x linha da planilha oficial. Obrigação sem linha aqui usa a regra do catálogo.';
