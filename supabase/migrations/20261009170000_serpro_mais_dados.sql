-- Monitoramento, Rodada 5 do plano de 09/10/2026 ("mais dados no que já existe"). Aplicada em produção pelo MCP como serpro_mais_dados_rodada5.
-- DCTFWeb (declaração completa, XML, guia em andamento), DTE, regime de apuração, e-Processo e vínculos na Redesim. Só o backend grava; a equipe lê.
set local lock_timeout = '3s';

alter table public.serpro_dctfweb add column if not exists declaracao_path text, add column if not exists xml_path text;
alter table public.serpro_dctfweb_guias add column if not exists andamento boolean not null default false;

create table public.serpro_dte (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  indicador smallint,            -- -2 NI inválido, -1 não optante, 0 optante DTE, 1 optante Simples, 2 DTE e Simples
  status text
);

create table public.serpro_regime_apuracao (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ano integer not null,
  regime text,
  data_opcao timestamptz,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  primary key (contact_id, ano)
);

create table public.serpro_eprocessos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  numero text not null,
  relacao text,
  data_protocolo date,
  tipo text,
  subtipo text,
  localizacao text,
  situacao text,
  ultimo_encaminhamento text,
  sincronizado_em timestamptz not null default now(),
  unique (contact_id, numero)
);
create table public.serpro_eprocesso_consultas (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  total integer not null default 0
);

create table public.serpro_redesim_vinculos (
  company_id uuid not null references public.companies(id) on delete cascade,
  cnpj text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  tipo_estabelecimento text,
  situacao text,
  uf text,
  municipio text,
  consultado_em timestamptz not null default now(),
  primary key (company_id, cnpj)
);

alter table public.serpro_dte enable row level security;
alter table public.serpro_regime_apuracao enable row level security;
alter table public.serpro_eprocessos enable row level security;
alter table public.serpro_eprocesso_consultas enable row level security;
alter table public.serpro_redesim_vinculos enable row level security;

create policy "serpro_dte select equipe" on public.serpro_dte for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_dte.company_id and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_regime_apuracao select equipe" on public.serpro_regime_apuracao for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_regime_apuracao.company_id and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_eprocessos select equipe" on public.serpro_eprocessos for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_eprocessos.company_id and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_eprocesso_consultas select equipe" on public.serpro_eprocesso_consultas for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_eprocesso_consultas.company_id and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_redesim_vinculos select equipe" on public.serpro_redesim_vinculos for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_redesim_vinculos.company_id and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
