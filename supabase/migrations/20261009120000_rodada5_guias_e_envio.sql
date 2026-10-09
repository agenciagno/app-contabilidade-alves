-- Monitoramento, Rodada 5 (09/10/2026): gerar guias em lote pela tela e enviar com conferência.
-- 1) Quem recebe guia da CA: duas marcações por cliente (decisão de Gabriel: marcar no cadastro). O lote e a lista "para conferir e enviar"
--    só sugerem os marcados; a equipe ainda pode incluir outro cliente à mão. Padrão desligado: ninguém entra sem alguém marcar.
-- 2) Guia (DARF) da DCTFWeb: DCTFWEB.GERARGUIA31 (Emitir, cobrado), uma linha por emissão. Só o backend grava; a equipe lê.
set local lock_timeout = '3s';

alter table public.contacts
  add column if not exists recebe_das_ca boolean not null default false,
  add column if not exists recebe_guia_dctfweb_ca boolean not null default false;

comment on column public.contacts.recebe_das_ca is 'Cliente recebe o DAS do Simples pela CA todo mês: entra no lote de Gerar DAS e na lista de envio com conferência.';
comment on column public.contacts.recebe_guia_dctfweb_ca is 'Cliente recebe a guia da DCTFWeb pela CA todo mês: entra no lote de Gerar guia e na lista de envio com conferência.';

create table public.serpro_dctfweb_guias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  competencia date not null,                   -- 1º dia do mês de apuração
  data_pagamento date,                         -- DataAcolhimentoProposta pedida (null = guia pelo vencimento)
  pdf_path text not null,
  emitido_em timestamptz not null default now(),
  emitido_por uuid
);
create index serpro_dctfweb_guias_contact_idx on public.serpro_dctfweb_guias (contact_id, competencia desc, emitido_em desc);
create index serpro_dctfweb_guias_company_idx on public.serpro_dctfweb_guias (company_id, competencia);

alter table public.serpro_dctfweb_guias enable row level security;

create policy "serpro_dctfweb_guias select equipe" on public.serpro_dctfweb_guias
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_dctfweb_guias.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

comment on table public.serpro_dctfweb_guias is 'Guias (DARF) da DCTFWeb emitidas pela tela (DCTFWEB.GERARGUIA31). Cada emissão é cobrada; o PDF fica no bucket serpro-dctfweb.';
