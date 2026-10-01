-- Gestão 360° · Rodada 1 (02/10/2026)
-- 1) client_envios: histórico único de tudo que a equipe manda ao cliente (e-mail, WhatsApp ou texto copiado), com os
--    documentos que foram junto. Só a edge function client-enviar grava; a equipe lê. Não guarda o link assinado (é segredo
--    por 7 dias): guarda quais documentos foram (tipo, nome e caminho no bucket).
-- 2) ausencia_acompanhamento: nota, situação e responsável por declaração em falta. É só anotação: NÃO muda a contagem de
--    "em falta" (quem some da lista é a declaração aparecer na próxima leitura do Serpro).

create table public.client_envios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp', 'copiar')),
  origem text not null,              -- de onde saiu: 'ausencia', 'ficha', ...
  assunto text,
  mensagem text not null,            -- texto editado pela equipe (sem os links)
  destino text,                      -- e-mail ou telefone
  documentos jsonb not null default '[]'::jsonb,   -- [{tipo, nome, bucket, path}]
  referencia jsonb,                  -- ex.: {obrigacao, competencia}
  enviado_por uuid,                  -- profiles.id
  enviado_em timestamptz not null default now()
);
create index client_envios_contact_idx on public.client_envios (contact_id, enviado_em desc);
create index client_envios_company_idx on public.client_envios (company_id, enviado_em desc);

alter table public.client_envios enable row level security;
create policy "client_envios select equipe" on public.client_envios
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = client_envios.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

comment on table public.client_envios is 'Histórico único de envios ao cliente (e-mail, WhatsApp ou copiado) com os documentos enviados. Grava só a edge function client-enviar.';

create table public.ausencia_acompanhamento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  obrigacao text not null check (obrigacao in ('PGDAS-D', 'DEFIS', 'DCTFWeb', 'MIT')),
  competencia text not null,         -- AAAA-MM (PGDAS-D, DCTFWeb, MIT) ou AAAA (DEFIS)
  situacao text not null default 'a_tratar'
    check (situacao in ('a_tratar', 'cliente_avisado', 'aguardando_cliente', 'em_andamento', 'transmitida')),
  nota text,
  responsavel_id uuid references public.profiles(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,               -- profiles.id
  unique (company_id, contact_id, obrigacao, competencia)
);
create index ausencia_acomp_contact_idx on public.ausencia_acompanhamento (contact_id);

alter table public.ausencia_acompanhamento enable row level security;
create policy "ausencia_acomp select equipe" on public.ausencia_acompanhamento
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = ausencia_acompanhamento.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "ausencia_acomp insert equipe" on public.ausencia_acompanhamento
  for insert with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = ausencia_acompanhamento.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "ausencia_acomp update equipe" on public.ausencia_acompanhamento
  for update using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = ausencia_acompanhamento.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))))
  with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = ausencia_acompanhamento.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

comment on table public.ausencia_acompanhamento is 'Nota, situação e responsável por declaração em falta (CA · Ausências). Só anotação: não altera a contagem de declarações em falta.';
