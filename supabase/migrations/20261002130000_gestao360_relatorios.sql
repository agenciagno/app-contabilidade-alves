-- Gestão 360° · Rodada 3 (02/10/2026): relatórios para o cliente (Situação Fiscal e Faturamento de 12 meses).
-- 1) client_relatorios: PDFs gerados pela equipe e guardados em bucket privado para ir ao cliente como link com validade
--    (mesmo envio dos demais documentos, edge function client-enviar). Só a função grava; a equipe lê.
-- 2) relatorio_config: nome, CRC e CPF do contador que assina o Relatório de Faturamento e o interruptor "modelo validado".
--    O relatório de faturamento só sai para o cliente com o modelo validado (decisão de Gabriel, 01/10/2026: o contador valida o
--    texto e a assinatura antes de liberar). Mudou o contador, a validação cai sozinha (gatilho).

insert into storage.buckets (id, name, public) values ('client-relatorios', 'client-relatorios', false) on conflict (id) do nothing;

create table public.client_relatorios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tipo text not null check (tipo in ('situacao', 'faturamento')),
  periodo text,                                    -- faturamento: competência da leitura (AAAA-MM)
  path text not null,                              -- caminho no bucket client-relatorios
  resumo jsonb not null default '{}'::jsonb,       -- ex.: score, itens verificados, competência
  gerado_em timestamptz not null default now(),
  gerado_por uuid                                  -- profiles.id
);
create index client_relatorios_contact_idx on public.client_relatorios (contact_id, gerado_em desc);

alter table public.client_relatorios enable row level security;
create policy "client_relatorios select equipe" on public.client_relatorios
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = client_relatorios.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
comment on table public.client_relatorios is 'Relatórios em PDF gerados para o cliente (situação fiscal e faturamento), em bucket privado. Grava só a edge function client-enviar.';

create table public.relatorio_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  contador_nome text,
  contador_crc text,
  contador_cpf text,
  faturamento_validado boolean not null default false,
  validado_por uuid,
  validado_em timestamptz,
  updated_at timestamptz not null default now(),
  constraint relatorio_validado_exige_contador check (
    not faturamento_validado
    or (coalesce(trim(contador_nome), '') <> '' and coalesce(trim(contador_crc), '') <> '' and coalesce(trim(contador_cpf), '') <> ''))
);

create or replace function public.relatorio_config_zera_validacao()
returns trigger
language plpgsql
as $function$
begin
  if new.contador_nome is distinct from old.contador_nome or new.contador_crc is distinct from old.contador_crc or new.contador_cpf is distinct from old.contador_cpf then
    new.faturamento_validado := false;
    new.validado_por := null;
    new.validado_em := null;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;
create trigger relatorio_config_zera_validacao before update on public.relatorio_config
  for each row execute function public.relatorio_config_zera_validacao();

alter table public.relatorio_config enable row level security;
create policy "relatorio_config select equipe" on public.relatorio_config
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = relatorio_config.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "relatorio_config insert admin" on public.relatorio_config
  for insert with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = relatorio_config.company_id and (p.is_super_admin = true or p.role = 'admin')));
create policy "relatorio_config update admin" on public.relatorio_config
  for update using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = relatorio_config.company_id and (p.is_super_admin = true or p.role = 'admin')))
  with check (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = relatorio_config.company_id and (p.is_super_admin = true or p.role = 'admin')));
comment on table public.relatorio_config is 'Contador que assina o Relatório de Faturamento e se o modelo está validado. Só administrador altera; mudar o contador derruba a validação.';
