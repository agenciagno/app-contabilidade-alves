-- Serpro Integra Contador — Onda 4 (fase 1): DCTFWeb e MIT, quem entregou, 30/09/2026. Só leitura.
-- DCTFWeb: DCTFWEB.CONSRECIBO32 por competência (categoria GERAL_MENSAL, código 40): devolve o PDF do recibo da declaração mais recente;
--   mensagem MG08 "Não foi encontrada Declaração com os dados informados" = não há declaração transmitida para o período.
-- MIT: MIT.LISTAAPURACOES317 por ano: todas as apurações do ano (situação, data de encerramento, valor). Ausência em ano consultado = sem apuração.
-- Só o backend (service_role) grava; a equipe lê (a tela seleciona colunas, nunca o caminho do PDF).

create table public.serpro_dctfweb (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  competencia date not null,                   -- 1º dia do mês de apuração
  status text not null check (status in ('transmitida', 'sem_declaracao')),
  recibo_path text,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  unique (contact_id, competencia)
);
create index serpro_dctfweb_company_idx on public.serpro_dctfweb (company_id, competencia);

create table public.serpro_mit_apuracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  periodo date not null,                       -- 1º dia do mês de apuração
  id_apuracao bigint not null,                 -- identificador dado no encerramento
  situacao smallint,                           -- 3 = encerrada (a documentação não traz a tabela completa)
  data_encerramento date,
  evento_especial boolean not null default false,
  valor_total numeric(14, 2),
  sincronizado_em timestamptz not null default now(),
  unique (contact_id, periodo, id_apuracao)
);
create index serpro_mit_apuracoes_contact_idx on public.serpro_mit_apuracoes (contact_id, periodo desc);

create table public.serpro_mit_consultas (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ano integer not null,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  apuracoes integer not null default 0,
  primary key (contact_id, ano)
);

alter table public.serpro_dctfweb enable row level security;
alter table public.serpro_mit_apuracoes enable row level security;
alter table public.serpro_mit_consultas enable row level security;

create policy "serpro_dctfweb select equipe" on public.serpro_dctfweb
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_dctfweb.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_mit_apuracoes select equipe" on public.serpro_mit_apuracoes
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_mit_apuracoes.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_mit_consultas select equipe" on public.serpro_mit_consultas
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_mit_consultas.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

insert into storage.buckets (id, name, public) values ('serpro-dctfweb', 'serpro-dctfweb', false) on conflict (id) do nothing;

comment on table public.serpro_dctfweb is 'DCTFWeb por cliente e competência: transmitida (com recibo em PDF) ou sem declaração (MG08). Sem declaração não prova atraso: DCTFWeb só existe para quem tem movimento.';
comment on table public.serpro_mit_apuracoes is 'Apurações da MIT por cliente e período (MIT.LISTAAPURACOES317). Ausência em ano consultado = sem apuração encerrada.';
