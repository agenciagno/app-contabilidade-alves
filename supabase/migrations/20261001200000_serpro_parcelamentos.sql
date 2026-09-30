-- Serpro Integra Contador — Onda 3: Parcelamentos do Simples Nacional, 30/09/2026
-- Quatro modalidades com o mesmo desenho de serviços (PEDIDOS, PARCELASPARAGERAR, GERARDAS): PARCSN (ordinário), PARCSN-ESP (especial),
-- PERTSN e RELPSN. Só leitura + emissão da guia da parcela (por clique, com confirmação). Só o backend (service_role) grava; a equipe lê.

create table public.serpro_parcelamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  modalidade text not null check (modalidade in ('PARCSN', 'PARCSN-ESP', 'PERTSN', 'RELPSN')),
  numero integer not null,
  data_pedido date,
  situacao text,                               -- texto da Receita, ex.: "Em parcelamento", "Encerrado a Pedido do Contribuinte"
  data_situacao date,
  ativo boolean not null default false,        -- situacao "Em parcelamento"
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, modalidade, numero)
);
create index serpro_parcelamentos_contact_idx on public.serpro_parcelamentos (contact_id, modalidade);

-- Parcelas "disponíveis para impressão de DAS" (em aberto: atrasadas e a do mês). A lista muda quando o cliente paga: cada consulta a substitui.
create table public.serpro_parcelas_abertas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  modalidade text not null check (modalidade in ('PARCSN', 'PARCSN-ESP', 'PERTSN', 'RELPSN')),
  parcela integer not null,                    -- AAAAMM
  valor numeric(14, 2),
  sincronizado_em timestamptz not null default now(),
  unique (contact_id, modalidade, parcela)
);
create index serpro_parcelas_abertas_contact_idx on public.serpro_parcelas_abertas (contact_id);

-- Guias emitidas por clique (PDF no bucket privado). O Serpro só devolve o PDF, sem vencimento nem valor estruturados.
create table public.serpro_parcelas_guias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  modalidade text not null check (modalidade in ('PARCSN', 'PARCSN-ESP', 'PERTSN', 'RELPSN')),
  parcela integer not null,
  pdf_path text not null,
  gerado_em timestamptz not null default now(),
  gerado_por uuid,
  created_at timestamptz not null default now()
);
create index serpro_parcelas_guias_contact_idx on public.serpro_parcelas_guias (contact_id, modalidade, parcela, gerado_em desc);

-- O que já foi consultado, por cliente e modalidade: diferencia "sem parcelamento" de "não consultado" e evita gastar consulta em
-- modalidade encerrada que o cliente nunca teve (só o PARCSN ordinário é sempre consultado).
create table public.serpro_parcelamentos_consultas (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  modalidade text not null check (modalidade in ('PARCSN', 'PARCSN-ESP', 'PERTSN', 'RELPSN')),
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  pedidos integer not null default 0,
  ativos integer not null default 0,
  sem_procuracao boolean not null default false,
  erro text,
  primary key (contact_id, modalidade)
);
create index serpro_parcelamentos_consultas_company_idx on public.serpro_parcelamentos_consultas (company_id);

create trigger serpro_parcelamentos_updated_at before update on public.serpro_parcelamentos
  for each row execute function public.set_updated_at();

alter table public.serpro_parcelamentos enable row level security;
alter table public.serpro_parcelas_abertas enable row level security;
alter table public.serpro_parcelas_guias enable row level security;
alter table public.serpro_parcelamentos_consultas enable row level security;

create policy "serpro_parcelamentos select equipe" on public.serpro_parcelamentos
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_parcelamentos.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_parcelas_abertas select equipe" on public.serpro_parcelas_abertas
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_parcelas_abertas.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_parcelas_guias select equipe" on public.serpro_parcelas_guias
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_parcelas_guias.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_parcelamentos_consultas select equipe" on public.serpro_parcelamentos_consultas
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_parcelamentos_consultas.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

insert into storage.buckets (id, name, public) values ('serpro-parcelamentos', 'serpro-parcelamentos', false) on conflict (id) do nothing;

comment on table public.serpro_parcelamentos is 'Pedidos de parcelamento do Simples Nacional por modalidade (PARCSN, PARCSN-ESP, PERTSN, RELPSN). ativo = "Em parcelamento".';
comment on table public.serpro_parcelas_abertas is 'Parcelas em aberto (atrasadas e a do mês) segundo PARCELASPARAGERAR; cada consulta substitui a lista do cliente e da modalidade.';
comment on table public.serpro_parcelas_guias is 'Guias (DAS de parcelamento) emitidas por clique; PDF em bucket privado.';
comment on table public.serpro_parcelamentos_consultas is 'Modalidades já consultadas por cliente. Modalidade encerrada sem nenhum pedido no histórico não é consultada de novo (custo).';
