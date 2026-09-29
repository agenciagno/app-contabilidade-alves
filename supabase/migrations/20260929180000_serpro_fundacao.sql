-- Serpro Integra Contador — Onda 0 (fundação), 29/09/2026
-- 1) serpro_call_log: registro de TODA chamada (contrato Serpro cl. 3.1.5.2: manter registro de acessos,
--    finalidades e fundamentos legais). Só o backend (service_role) grava.
-- 2) serpro_procuracoes: procuração eletrônica (e-CAC) por cliente x serviço, com validade.
-- 3) portal_modules / portal_module_defaults / portal_client_modules: "controle de módulos" do futuro
--    Portal do Cliente — o escritório escolhe o que cada cliente vê. Padrão = desligado.

-- ---------------------------------------------------------------- serpro_call_log
create table public.serpro_call_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  ambiente text not null check (ambiente in ('trial', 'producao')),
  tipo_chamada text not null check (tipo_chamada in ('Apoiar', 'Consultar', 'Declarar', 'Emitir', 'Monitorar')),
  id_sistema text not null,
  id_servico text not null,
  contribuinte_ni text,
  contact_id uuid references public.contacts(id) on delete set null,
  status_http integer,
  cobravel boolean,          -- null = não se aplica (trial) ou não conhecido; regra: 200/202/403 fora de Apoiar/Monitorar
  duracao_ms integer,
  response_id text,
  mensagem_codigo text,
  acionado_por uuid,         -- auth.users.id de quem pediu (null quando cron/evento)
  origem text not null default 'manual' check (origem in ('manual', 'cron', 'evento', 'portal')),
  finalidade text not null,
  base_legal text not null
);
create index serpro_call_log_company_created_idx on public.serpro_call_log (company_id, created_at desc);
create index serpro_call_log_contribuinte_idx on public.serpro_call_log (company_id, contribuinte_ni, created_at desc);

alter table public.serpro_call_log enable row level security;

create policy "serpro_call_log admin select" on public.serpro_call_log
  for select using (
    (
      company_id = public.get_user_company_id((select auth.uid()))
      and exists (
        select 1 from public.profiles p
        where p.user_id = (select auth.uid()) and (p.role = 'admin' or p.is_super_admin = true)
      )
    )
    or public.is_super_admin((select auth.uid()))
  );
create policy "serpro_call_log no client insert" on public.serpro_call_log
  for insert with check (false);

-- ---------------------------------------------------------------- serpro_procuracoes
create table public.serpro_procuracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  codigo_procuracao text not null,   -- código do serviço no e-CAC (ex.: 00146 PGDAS-D, 00103 DCTFWeb, 00006 Caixa Postal)
  status text not null default 'desconhecida' check (status in ('ativa', 'ausente', 'expirada', 'desconhecida')),
  data_inicio date,
  data_fim date,
  verificado_em timestamptz,
  fonte text not null default 'integra_procuracoes' check (fonte in ('integra_procuracoes', 'manual')),
  resposta jsonb,                    -- retorno bruto do serviço PROCURACOES/OBTERPROCURACAO41
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, codigo_procuracao)
);
create index serpro_procuracoes_company_status_idx on public.serpro_procuracoes (company_id, status);

alter table public.serpro_procuracoes enable row level security;

create policy "serpro_procuracoes select colaboradores" on public.serpro_procuracoes
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.company_id = serpro_procuracoes.company_id
        and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))
    )
  );
create policy "serpro_procuracoes admin manage" on public.serpro_procuracoes
  for all using (
    exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = serpro_procuracoes.company_id))
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = serpro_procuracoes.company_id))
    )
  );

create trigger serpro_procuracoes_updated_at
  before update on public.serpro_procuracoes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- portal: catálogo e visibilidade
create table public.portal_modules (
  module_key text primary key,
  titulo text not null,
  descricao text not null,
  requer_curadoria boolean not null default false,  -- true = cada item precisa ser "publicado" pela equipe antes de aparecer
  ordem integer not null default 0
);

insert into public.portal_modules (module_key, titulo, descricao, requer_curadoria, ordem) values
  ('faturamento',      'Faturamento',           'Faturamento dos últimos 12 meses, limite do Simples e Fator r.', false, 10),
  ('guias',            'Guias do mês',          'DAS/DARF do mês, situação de pagamento e 2ª via.',               false, 20),
  ('comprovantes',     'Comprovantes',          'Comprovantes de pagamento de tributos federais.',                false, 30),
  ('parcelamentos',    'Parcelamentos',         'Parcelamentos federais, parcela do mês e guia.',                 false, 40),
  ('declaracoes',      'Declarações',           'Recibos de PGDAS-D, DEFIS e DCTFWeb.',                           false, 50),
  ('situacao_fiscal',  'Situação fiscal',       'Relatório de situação fiscal na Receita.',                       true,  60),
  ('caixa_postal',     'Caixa Postal da Receita','Mensagens da Receita Federal publicadas pela equipe.',          true,  70),
  ('conexao_receita',  'Conexão com a Receita', 'Status da procuração e passo a passo para conectar.',            false, 80);

alter table public.portal_modules enable row level security;
create policy "portal_modules leitura autenticados" on public.portal_modules
  for select to authenticated using (true);

create table public.portal_module_defaults (
  company_id uuid not null references public.companies(id) on delete cascade,
  module_key text not null references public.portal_modules(module_key) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (company_id, module_key)
);
alter table public.portal_module_defaults enable row level security;
create policy "portal_module_defaults leitura empresa" on public.portal_module_defaults
  for select using (company_id = public.get_user_company_id((select auth.uid())) or public.is_super_admin((select auth.uid())));
create policy "portal_module_defaults admin escreve" on public.portal_module_defaults
  for all using (
    exists (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = portal_module_defaults.company_id)))
  ) with check (
    exists (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = portal_module_defaults.company_id)))
  );

create table public.portal_client_modules (
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  module_key text not null references public.portal_modules(module_key) on delete cascade,
  enabled boolean not null,          -- exceção por cliente; sobrescreve o padrão do escritório
  updated_at timestamptz not null default now(),
  primary key (contact_id, module_key)
);
create index portal_client_modules_company_idx on public.portal_client_modules (company_id);
alter table public.portal_client_modules enable row level security;
create policy "portal_client_modules leitura empresa" on public.portal_client_modules
  for select using (company_id = public.get_user_company_id((select auth.uid())) or public.is_super_admin((select auth.uid())));
create policy "portal_client_modules admin escreve" on public.portal_client_modules
  for all using (
    exists (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = portal_client_modules.company_id)))
  ) with check (
    exists (select 1 from public.profiles p where p.user_id = (select auth.uid())
      and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = portal_client_modules.company_id)))
  );

comment on table public.serpro_call_log is 'Registro de toda chamada ao Serpro Integra Contador (finalidade + base legal, contrato cl. 3.1.5.2). Escrita só via service_role.';
comment on table public.serpro_procuracoes is 'Procuração eletrônica e-CAC por cliente x serviço. Preenchida pelo serviço PROCURACOES (Integra Contador).';
comment on table public.portal_modules is 'Catálogo de módulos que o futuro Portal do Cliente pode exibir. Visibilidade: padrão do escritório -> exceção por cliente -> curadoria por item.';
