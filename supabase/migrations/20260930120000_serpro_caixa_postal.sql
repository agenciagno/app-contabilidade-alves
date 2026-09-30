-- Serpro Integra Contador — Fase A: Caixa Postal / Dashboard Federal (30/09/2026)
-- Espelho da Caixa Postal do e-CAC por cliente. Só o backend (service_role) grava; a equipe lê.
-- Regra: o CORPO da mensagem só é baixado com ciência confirmada individualmente (MSGDETALHAMENTO62 gera ciência
-- da intimação, art. 23 §2º III do Decreto 70.235/1972). Lista (MSGCONTRIBUINTE61) e indicador (INNOVAMSG63) não geram.

-- ---------------------------------------------------------------- resumo por cliente
create table public.serpro_caixa_postal_resumo (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  indicador_mensagens_novas smallint check (indicador_mensagens_novas in (0, 1, 2)), -- INNOVAMSG63 (grátis): 0 nenhuma, 1 uma, 2 mais de uma; null = sem procuração/desconhecido
  indicador_verificado_em timestamptz,
  evento_ultima_data date,            -- E0601 (rotina diária, grátis): data da última mensagem nova
  evento_verificado_em timestamptz,
  consultado_em timestamptz,          -- última vez que a lista foi baixada (MSGCONTRIBUINTE61, cobrado)
  consultado_por uuid,
  mensagens_salvas integer not null default 0,
  nao_lidas_salvas integer not null default 0,
  updated_at timestamptz not null default now()
);
create index serpro_cp_resumo_company_idx on public.serpro_caixa_postal_resumo (company_id);

-- ---------------------------------------------------------------- mensagens
create table public.serpro_caixa_postal_mensagens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  isn text not null,                  -- identificador único da mensagem na Caixa Postal
  numero_controle text,
  codigo_modelo text,
  assunto text not null,
  data_envio timestamptz,
  lida boolean not null default false,
  data_leitura date,
  data_ciencia date,
  data_validade date,                 -- prazo/validade da mensagem
  relevancia smallint,                -- 1 sem relevância, 2 com relevância
  tipo_origem smallint,               -- 1 Receita, 2 Estado, 3 Município
  descricao_origem text,
  categoria text not null default 'informativo'
    check (categoria in ('intimacao', 'malha', 'exclusao_simples', 'maed', 'cobranca', 'processo', 'informativo')),
  corpo text,                         -- só preenchido após ciência confirmada
  corpo_aberto_por uuid,
  corpo_aberto_em timestamptz,
  situacao text not null default 'nova' check (situacao in ('nova', 'em_tratamento', 'resolvida', 'sem_acao')),
  responsavel_id uuid,
  observacoes text,
  visivel_portal boolean not null default false,  -- curadoria: só vai ao futuro portal se a equipe publicar
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, isn)
);
create index serpro_cp_msg_contact_idx on public.serpro_caixa_postal_mensagens (contact_id, data_envio desc);
create index serpro_cp_msg_company_cat_idx on public.serpro_caixa_postal_mensagens (company_id, categoria, situacao);

create trigger serpro_cp_msg_updated_at before update on public.serpro_caixa_postal_mensagens
  for each row execute function public.set_updated_at();
create trigger serpro_cp_resumo_updated_at before update on public.serpro_caixa_postal_resumo
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- regras de classificação (editáveis, sem IA)
create table public.serpro_caixa_postal_regras (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ordem integer not null,             -- menor = avaliada primeiro
  padrao text not null,               -- expressão regular, sem diferenciar maiúsculas, aplicada ao assunto
  categoria text not null
    check (categoria in ('intimacao', 'malha', 'exclusao_simples', 'maed', 'cobranca', 'processo', 'informativo')),
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
create index serpro_cp_regras_company_idx on public.serpro_caixa_postal_regras (company_id, ordem);

insert into public.serpro_caixa_postal_regras (company_id, ordem, padrao, categoria) values
  ('5cd08fcd-c095-4f08-b3a8-c02b9bf1034e', 10, 'intima', 'intimacao'),
  ('5cd08fcd-c095-4f08-b3a8-c02b9bf1034e', 20, 'exclus.o.*simples|simples.*exclus|desenquadr', 'exclusao_simples'),
  ('5cd08fcd-c095-4f08-b3a8-c02b9bf1034e', 30, 'multa.*atraso|maed', 'maed'),
  ('5cd08fcd-c095-4f08-b3a8-c02b9bf1034e', 40, 'malha|inconsist|diverg|omiss|pend.ncia', 'malha'),
  ('5cd08fcd-c095-4f08-b3a8-c02b9bf1034e', 50, 'cobran.a|d.bito|d.vida', 'cobranca'),
  ('5cd08fcd-c095-4f08-b3a8-c02b9bf1034e', 60, 'processo|despacho|julgamento|recurso', 'processo');

-- ---------------------------------------------------------------- configuração da integração (tela Tech > Consumo Serpro)
create table public.serpro_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  alerta_gasto_mensal numeric(10, 2) not null default 100,   -- R$: avisa quando a estimativa do ciclo passar disso
  volume_declarado_mes integer,                              -- espelho do limite informado na Área do Cliente Serpro
  updated_at timestamptz not null default now()
);
insert into public.serpro_config (company_id) values ('5cd08fcd-c095-4f08-b3a8-c02b9bf1034e');
create trigger serpro_config_updated_at before update on public.serpro_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.serpro_caixa_postal_resumo enable row level security;
alter table public.serpro_caixa_postal_mensagens enable row level security;
alter table public.serpro_caixa_postal_regras enable row level security;
alter table public.serpro_config enable row level security;

create policy "serpro_cp_resumo select equipe" on public.serpro_caixa_postal_resumo
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_caixa_postal_resumo.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

create policy "serpro_cp_mensagens select equipe" on public.serpro_caixa_postal_mensagens
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_caixa_postal_mensagens.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

create policy "serpro_cp_regras select equipe" on public.serpro_caixa_postal_regras
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_caixa_postal_regras.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_cp_regras admin escreve" on public.serpro_caixa_postal_regras
  for all using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = serpro_caixa_postal_regras.company_id))))
  with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and (p.is_super_admin = true or (p.role = 'admin' and p.company_id = serpro_caixa_postal_regras.company_id))));

create policy "serpro_config select admin" on public.serpro_config
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_config.company_id and (p.is_super_admin = true or p.role = 'admin')));
create policy "serpro_config update admin" on public.serpro_config
  for update using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_config.company_id and (p.is_super_admin = true or p.role = 'admin')))
  with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_config.company_id and (p.is_super_admin = true or p.role = 'admin')));

comment on table public.serpro_caixa_postal_mensagens is 'Espelho da Caixa Postal e-CAC. Corpo só com ciência confirmada individualmente (registra quem abriu e quando).';
comment on table public.serpro_caixa_postal_resumo is 'Selo por cliente: indicador grátis (INNOVAMSG63), aviso da rotina diária (E0601) e última consulta paga da lista.';
