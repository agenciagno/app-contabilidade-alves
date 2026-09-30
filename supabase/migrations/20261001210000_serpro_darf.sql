-- Serpro Integra Contador — Onda 3: DARF atualizado (SICALC), 30/09/2026
-- SICALC.CONSOLIDARGERARDARF51 (Emitir) calcula multa e juros de um débito informado pela equipe e devolve o DARF em PDF; o código de barras
-- vem de outra chamada (GERARDARFCODBARRA53, Emitir). Não descobre dívida: a equipe informa receita, período, vencimento, valor e data do pagamento.
-- Só o backend (service_role) grava; a equipe lê (a tela seleciona colunas, nunca o caminho do PDF).

create table public.serpro_darfs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  codigo_receita text not null,
  extensao text not null default '01',
  tipo_pa text not null check (tipo_pa in ('AN', 'TR', 'ME')),   -- anual, trimestral, mensal
  data_pa text not null,                        -- aaaa · tt/aaaa · mm/aaaa, conforme tipo_pa
  vencimento date not null,
  valor_imposto numeric(14, 2) not null,
  data_consolidacao date not null,              -- data prevista do pagamento: os acréscimos são calculados até ela
  numero_referencia text,
  observacao text,
  valor_principal numeric(14, 2),
  valor_multa numeric(14, 2),
  percentual_multa numeric(8, 2),
  valor_juros numeric(14, 2),
  percentual_juros numeric(8, 2),
  valor_total numeric(14, 2),
  valido_ate date,                              -- data limite para pagar este DARF na rede bancária
  numero_documento text,
  pdf_path text,
  codigo_barras text,                           -- 44 dígitos, preenchido quando a equipe pede o código de barras
  created_by uuid,
  created_at timestamptz not null default now()
);
create index serpro_darfs_company_idx on public.serpro_darfs (company_id, created_at desc);
create index serpro_darfs_contact_idx on public.serpro_darfs (contact_id, created_at desc);

alter table public.serpro_darfs enable row level security;
create policy "serpro_darfs select equipe" on public.serpro_darfs
  for select using (exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.company_id = serpro_darfs.company_id
    and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

insert into storage.buckets (id, name, public) values ('serpro-darf', 'serpro-darf', false) on conflict (id) do nothing;

comment on table public.serpro_darfs is 'DARFs calculados e emitidos pelo SICALC (Serpro) por clique: valores consolidados, PDF em bucket privado e, se pedido, o código de barras.';
