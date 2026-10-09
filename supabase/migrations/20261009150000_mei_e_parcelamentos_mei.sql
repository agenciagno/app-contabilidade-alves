-- Monitoramento, Rodada 4 do plano de 09/10/2026: MEI (PGMEI, CCMEI) e parcelamentos do MEI.
-- PGMEI e CCMEI não exigem procuração. Só o backend (service_role) grava; a equipe lê. PDFs no bucket privado serpro-mei.
set local lock_timeout = '3s';

-- Parcelamentos: as 4 modalidades do MEI usam o mesmo desenho de serviços do Simples (PEDIDOSPARC, PARCELASPARAGERAR, GERARDAS).
do $$
declare t text;
begin
  foreach t in array array['serpro_parcelamentos', 'serpro_parcelas_abertas', 'serpro_parcelas_guias', 'serpro_parcelamentos_consultas'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_modalidade_check');
    execute format($f$alter table public.%I add constraint %I check (modalidade = any (array['PARCSN','PARCSN-ESP','PERTSN','RELPSN','PARCMEI','PARCMEI-ESP','PERTMEI','RELPMEI']))$f$, t, t || '_modalidade_check');
  end loop;
end $$;

-- DAS do MEI (PGMEI.GERARDASPDF21, Emitir): uma linha por emissão.
create table public.serpro_mei_das (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  periodo date not null,                       -- 1º dia do mês de apuração
  numero_das text,
  vencimento date,
  limite_acolhimento date,
  valor_total numeric(14, 2),
  data_pagamento date,                         -- dataConsolidacao pedida (null = pelo vencimento)
  pdf_path text not null,
  emitido_em timestamptz not null default now(),
  emitido_por uuid
);
create index serpro_mei_das_contact_idx on public.serpro_mei_das (contact_id, periodo desc, emitido_em desc);

-- Dívida ativa do MEI (PGMEI.DIVIDAATIVA24, Consultar): débitos do ano em dívida ativa.
create table public.serpro_mei_divida (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ano integer not null,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  itens jsonb not null default '[]'::jsonb,    -- [{ periodo, tributo, valor, ente, situacao }]
  total numeric(14, 2) not null default 0,
  primary key (contact_id, ano)
);

-- Certificado da Condição de MEI (CCMEI.EMITIRCCMEI121, Emitir) e situação (CCMEI.DADOSCCMEI122, Consultar).
create table public.serpro_mei_ccmei (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  pdf_path text not null,
  emitido_em timestamptz not null default now(),
  emitido_por uuid
);
create index serpro_mei_ccmei_contact_idx on public.serpro_mei_ccmei (contact_id, emitido_em desc);

create table public.serpro_mei_situacao (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  situacao_cadastral text,
  optante_mei boolean,
  enquadramento text,
  dados jsonb
);

alter table public.serpro_mei_das enable row level security;
alter table public.serpro_mei_divida enable row level security;
alter table public.serpro_mei_ccmei enable row level security;
alter table public.serpro_mei_situacao enable row level security;

create policy "serpro_mei_das select equipe" on public.serpro_mei_das
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_mei_das.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_mei_divida select equipe" on public.serpro_mei_divida
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_mei_divida.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_mei_ccmei select equipe" on public.serpro_mei_ccmei
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_mei_ccmei.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_mei_situacao select equipe" on public.serpro_mei_situacao
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_mei_situacao.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

insert into storage.buckets (id, name, public) values ('serpro-mei', 'serpro-mei', false) on conflict (id) do nothing;
