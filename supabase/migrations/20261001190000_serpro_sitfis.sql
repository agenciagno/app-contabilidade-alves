-- Serpro Integra Contador — Onda 3: Situação Fiscal (SITFIS), 30/09/2026
-- Fluxo em duas chamadas: SITFIS.SOLICITARPROTOCOLO91 (/Apoiar, não cobrada) devolve um protocolo e um tempo de espera;
-- SITFIS.RELATORIOSITFIS92 (/Emitir, cobrada quando volta 200 e também quando volta 202 "ainda processando") devolve o PDF do relatório.
-- O PDF fica em bucket privado; a leitura é por regra fixa de texto (sem IA): sem pendências / com pendências / não lido.
-- Só o backend (service_role) grava; a equipe lê. O protocolo não deve ir para a tela (a tela seleciona colunas, nunca *).

create table public.serpro_sitfis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  solicitado_em timestamptz not null default now(),
  solicitado_por uuid,
  protocolo text,                              -- válido só para esta solicitação; apagado quando o relatório sai
  status text not null default 'aguardando' check (status in ('aguardando', 'pronto', 'erro')),
  gerado_em timestamptz,                       -- quando o PDF ficou pronto
  pdf_path text,
  resultado text check (resultado in ('sem_pendencias', 'com_pendencias', 'nao_lido')),
  categorias text[] not null default '{}',     -- títulos das pendências encontradas no relatório
  certidao_tipo text,                          -- última certidão emitida, quando o relatório a traz
  certidao_emissao date,
  certidao_validade date,
  confiavel boolean not null default false,
  avisos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index serpro_sitfis_contact_idx on public.serpro_sitfis (contact_id, solicitado_em desc);
create index serpro_sitfis_company_idx on public.serpro_sitfis (company_id, gerado_em desc);

create trigger serpro_sitfis_updated_at before update on public.serpro_sitfis
  for each row execute function public.set_updated_at();

alter table public.serpro_sitfis enable row level security;
create policy "serpro_sitfis select equipe" on public.serpro_sitfis
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_sitfis.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

insert into storage.buckets (id, name, public) values ('serpro-sitfis', 'serpro-sitfis', false) on conflict (id) do nothing;

comment on table public.serpro_sitfis is 'Relatórios de Situação Fiscal (Receita + PGFN) por cliente. resultado=nao_lido: o texto do PDF não foi reconhecido; abrir o PDF.';
