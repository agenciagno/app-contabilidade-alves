-- Serpro Integra Contador — Onda 2, passo 4: DEFIS (declaração anual do Simples Nacional), 30/09/2026
-- Espelho do índice (DEFIS.CONSDECLARACAO142): UMA consulta por cliente devolve todas as DEFIS transmitidas (período não decadente).
-- PDFs da declaração e do recibo (DEFIS.CONSULTIMADECREC143, por ano-calendário) ficam no bucket privado serpro-pgdasd, baixados por clique.
-- "Não entregue" = ausência no índice de um cliente já consultado, depois do prazo (31/03 do ano seguinte).
-- Só o backend (service_role) grava; a equipe lê.

create table public.serpro_defis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  ano_calendario integer not null,
  id_defis text not null,                      -- 15 caracteres
  tipo smallint not null check (tipo between 1 and 4),  -- 1 original normal · 2 retificadora normal · 3 original situação especial · 4 retificadora situação especial
  transmitida_em timestamptz,
  recibo_path text,
  declaracao_path text,
  documentos_em timestamptz,
  visivel_portal boolean not null default false,
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, id_defis)
);
create index serpro_defis_contact_ano_idx on public.serpro_defis (contact_id, ano_calendario desc);
create index serpro_defis_company_ano_idx on public.serpro_defis (company_id, ano_calendario);

create table public.serpro_defis_consultas (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  declaracoes integer not null default 0
);
create index serpro_defis_consultas_company_idx on public.serpro_defis_consultas (company_id);

create trigger serpro_defis_updated_at before update on public.serpro_defis
  for each row execute function public.set_updated_at();

alter table public.serpro_defis enable row level security;
alter table public.serpro_defis_consultas enable row level security;

create policy "serpro_defis select equipe" on public.serpro_defis
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_defis.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_defis_consultas select equipe" on public.serpro_defis_consultas
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_defis_consultas.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

comment on table public.serpro_defis is 'DEFIS transmitidas por cliente e ano-calendário (DEFIS.CONSDECLARACAO142). Ausência em cliente consultado, depois de 31/03 do ano seguinte = não entregue.';
comment on table public.serpro_defis_consultas is 'Clientes com o índice da DEFIS já consultado: diferencia "sem DEFIS" de "não consultado".';
