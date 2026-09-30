-- Serpro Integra Contador — Onda 2, passo 2: PGDAS-D e DAS (Simples Nacional), 30/09/2026
-- Espelho do índice de declarações (CONSDECLARACAO13, uma consulta por cliente e ano cobre os 12 meses), com os DAS emitidos
-- e se estão pagos. PDFs (declaração, recibo, DAS, extrato) ficam em bucket privado, baixados por clique individual.
-- Só o backend (service_role) grava; a equipe lê. "Não transmitida" = ausência no índice de um ano consultado.

create table public.serpro_pgdasd_declaracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  periodo_apuracao date not null,              -- 1º dia do mês de apuração
  numero_declaracao text not null,             -- 17 dígitos
  tipo text not null check (tipo in ('original', 'retificadora')),
  transmitida_em timestamptz,
  malha text,                                  -- null = fora de malha (Retida em Malha, Liberada, Intimada, Rejeitada)
  recibo_path text,                            -- PDFs no bucket serpro-pgdasd (baixados por clique)
  declaracao_path text,
  maed_notificacao_path text,                  -- multa por atraso, quando houve
  maed_darf_path text,
  documentos_em timestamptz,
  visivel_portal boolean not null default false,
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, numero_declaracao)
);
create index serpro_pgdasd_decl_contact_pa_idx on public.serpro_pgdasd_declaracoes (contact_id, periodo_apuracao desc);
create index serpro_pgdasd_decl_company_pa_idx on public.serpro_pgdasd_declaracoes (company_id, periodo_apuracao);

create table public.serpro_pgdasd_das (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  periodo_apuracao date not null,
  numero_das text not null,                    -- 17 dígitos
  tipo_operacao text,                          -- Geração de DAS, DAS Avulso, DAS Cobrança, DAS Medida Judicial
  emitido_em timestamptz,
  das_pago boolean,                            -- informação da Receita no momento da consulta (não prova comprovante)
  vencimento date,                             -- preenchidos quando o DAS é gerado aqui
  valor_principal numeric(14, 2),
  valor_multa numeric(14, 2),
  valor_juros numeric(14, 2),
  valor_total numeric(14, 2),
  composicao jsonb,
  das_path text,                               -- PDF do DAS gerado aqui
  extrato_path text,                           -- PDF do extrato
  visivel_portal boolean not null default false,
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, numero_das)
);
create index serpro_pgdasd_das_contact_pa_idx on public.serpro_pgdasd_das (contact_id, periodo_apuracao desc);
create index serpro_pgdasd_das_company_pa_idx on public.serpro_pgdasd_das (company_id, periodo_apuracao);

create table public.serpro_pgdasd_consultas (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ano integer not null,                        -- ano-calendário consultado
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  declaracoes integer not null default 0,
  das integer not null default 0,
  primary key (contact_id, ano)
);
create index serpro_pgdasd_consultas_company_idx on public.serpro_pgdasd_consultas (company_id, ano);

create trigger serpro_pgdasd_decl_updated_at before update on public.serpro_pgdasd_declaracoes
  for each row execute function public.set_updated_at();
create trigger serpro_pgdasd_das_updated_at before update on public.serpro_pgdasd_das
  for each row execute function public.set_updated_at();

alter table public.serpro_pgdasd_declaracoes enable row level security;
alter table public.serpro_pgdasd_das enable row level security;
alter table public.serpro_pgdasd_consultas enable row level security;

create policy "serpro_pgdasd_decl select equipe" on public.serpro_pgdasd_declaracoes
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_pgdasd_declaracoes.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_pgdasd_das select equipe" on public.serpro_pgdasd_das
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_pgdasd_das.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_pgdasd_consultas select equipe" on public.serpro_pgdasd_consultas
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_pgdasd_consultas.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

-- Bucket privado: sem policy em storage.objects, só a edge function (service_role) lê/grava e entrega link assinado de curta duração.
insert into storage.buckets (id, name, public) values ('serpro-pgdasd', 'serpro-pgdasd', false) on conflict (id) do nothing;

comment on table public.serpro_pgdasd_declaracoes is 'Índice do PGDAS-D por cliente e período (CONSDECLARACAO13). Ausência em ano consultado = não transmitida.';
comment on table public.serpro_pgdasd_das is 'DAS emitidos (índice) e gerados aqui, com "pago" segundo a Receita. PDFs em bucket privado.';
comment on table public.serpro_pgdasd_consultas is 'Anos já consultados por cliente: diferencia "sem declaração" de "não consultado".';
