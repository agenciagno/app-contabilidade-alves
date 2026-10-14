-- 14/10/2026 (pedido de Gabriel): tela Processos (/processos) no lugar da planilha "TAREFAS COMERCIAL" do Legalização/Comercial.
--   · processo_opcoes: listas de Status, Serviço e Órgão da empresa. A equipe cria item novo pela própria tela (não edita nem apaga).
--     Os 4 status com papel (inicial, aguardando_cliente, concluido, cancelado) são fixos: a cor da linha e os cards dependem deles.
--     Status criado pela equipe conta como "em andamento".
--   · processos: um pedido do cliente (abertura, alteração, baixa...). Abertura sem empresa no cadastro usa nome e WhatsApp avulsos.
--     status_desde e concluido_em são preenchidos pelo trigger; responsável padrão = quem cadastrou.
--   · processo_eventos: histórico do processo. Troca de status grava sozinha (trigger); mensagem ao cliente a tela grava.
--   · Lê a equipe da empresa; grava quem tem o módulo "processos" (ou admin / super admin); apaga só admin / super admin.
set local lock_timeout = '3s';

-- 1. Listas -----------------------------------------------------------------------------------------------
create table public.processo_opcoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('status', 'servico', 'orgao')),
  nome text not null,
  papel text check (papel in ('inicial', 'aguardando_cliente', 'concluido', 'cancelado')),
  ordem int not null default 75,      -- só status usa (ordem do fluxo); status novo entra antes de "Aguardando cliente"
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint processo_opcoes_nome_tamanho check (char_length(btrim(nome)) between 2 and 60),
  constraint processo_opcoes_papel_so_status check (papel is null or tipo = 'status')
);
comment on table public.processo_opcoes is 'Listas de Status, Serviço e Órgão da tela Processos. Status com papel são fixos (regras de cor e cards).';
create unique index processo_opcoes_nome_idx on public.processo_opcoes (company_id, tipo, lower(btrim(nome)));
create unique index processo_opcoes_papel_idx on public.processo_opcoes (company_id, papel) where papel is not null;

-- 2. Processos --------------------------------------------------------------------------------------------
create table public.processos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  nome_avulso text,                   -- abertura: empresa ainda não está no cadastro
  whatsapp_avulso text,
  data_solicitacao date not null default (now() at time zone 'America/Sao_Paulo')::date,
  servico_id uuid not null references public.processo_opcoes(id) on delete restrict,
  orgao_id uuid references public.processo_opcoes(id) on delete restrict,
  status_id uuid not null references public.processo_opcoes(id) on delete restrict,
  protocolo text,
  observacao text,
  responsavel_id uuid references public.profiles(id) on delete set null,
  status_desde timestamptz not null default now(),
  concluido_em timestamptz,           -- data do Concluído ou Cancelado; volta a nulo se reabrir
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processos_cliente check (contact_id is not null or char_length(btrim(coalesce(nome_avulso, ''))) >= 2),
  constraint processos_textos check (char_length(coalesce(protocolo, '')) <= 200 and char_length(coalesce(observacao, '')) <= 2000
                                     and char_length(coalesce(nome_avulso, '')) <= 160 and char_length(coalesce(whatsapp_avulso, '')) <= 30)
);
comment on table public.processos is 'Processos de abertura, alteração, baixa etc. pedidos pelo cliente (tela /processos, Legalização). Substitui a planilha TAREFAS COMERCIAL.';
create index processos_empresa_data_idx on public.processos (company_id, data_solicitacao desc);
create index processos_contact_idx on public.processos (contact_id) where contact_id is not null;

-- 3. Histórico ---------------------------------------------------------------------------------------------
create table public.processo_eventos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  tipo text not null check (tipo in ('status', 'mensagem')),
  status_id uuid references public.processo_opcoes(id) on delete restrict,
  canal text check (canal in ('email', 'whatsapp', 'copiar')),
  destino text,
  mensagem text,
  autor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint processo_eventos_forma check ((tipo = 'status' and status_id is not null) or (tipo = 'mensagem' and canal is not null))
);
comment on table public.processo_eventos is 'Histórico do processo: troca de status (trigger) e mensagens enviadas ao cliente (tela).';
create index processo_eventos_processo_idx on public.processo_eventos (processo_id, created_at desc);

-- 4. Regras de gravação ------------------------------------------------------------------------------------
-- Perfil de quem está gravando, na empresa do registro.
create or replace function public.processos_perfil_atual(_company uuid)
returns uuid language sql stable security definer set search_path to 'public'
as $$ select p.id from public.profiles p where p.user_id = auth.uid() and p.company_id = _company limit 1 $$;
revoke all on function public.processos_perfil_atual(uuid) from public, anon, authenticated;

create or replace function public.processos_antes_gravar()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_papel text;
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'O processo não pode trocar de empresa.';
  end if;
  if new.contact_id is not null
     and not exists (select 1 from public.contacts c where c.id = new.contact_id and c.company_id = new.company_id) then
    raise exception 'Cliente de outra empresa.';
  end if;
  if not exists (select 1 from public.processo_opcoes o where o.id = new.servico_id and o.company_id = new.company_id and o.tipo = 'servico') then
    raise exception 'Serviço inválido.';
  end if;
  if new.orgao_id is not null
     and not exists (select 1 from public.processo_opcoes o where o.id = new.orgao_id and o.company_id = new.company_id and o.tipo = 'orgao') then
    raise exception 'Órgão inválido.';
  end if;
  select o.papel into v_papel from public.processo_opcoes o
   where o.id = new.status_id and o.company_id = new.company_id and o.tipo = 'status';
  if not found then
    raise exception 'Status inválido.';
  end if;

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, public.processos_perfil_atual(new.company_id));
    new.responsavel_id := coalesce(new.responsavel_id, new.criado_por);
    new.status_desde := now();
    new.concluido_em := case when v_papel in ('concluido', 'cancelado') then now() end;
  else
    if new.status_id is distinct from old.status_id then
      new.status_desde := now();
      new.concluido_em := case when v_papel in ('concluido', 'cancelado') then now() end;
    else
      new.status_desde := old.status_desde;
      new.concluido_em := old.concluido_em;
    end if;
    new.criado_por := old.criado_por;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.processos_antes_gravar() from public, anon;

create trigger trg_processos_antes_gravar
  before insert or update on public.processos
  for each row execute function public.processos_antes_gravar();

create or replace function public.processos_registrar_status()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    insert into public.processo_eventos (company_id, processo_id, tipo, status_id, autor_id)
    values (new.company_id, new.id, 'status', new.status_id, public.processos_perfil_atual(new.company_id));
  end if;
  return null;
end $$;
revoke all on function public.processos_registrar_status() from public, anon;

create trigger trg_processos_registrar_status
  after insert or update of status_id on public.processos
  for each row execute function public.processos_registrar_status();

-- Mensagem gravada pela tela: autor é sempre quem está logado e o processo tem que ser da mesma empresa.
create or replace function public.processo_eventos_antes_gravar()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.processos p where p.id = new.processo_id and p.company_id = new.company_id) then
    raise exception 'Processo de outra empresa.';
  end if;
  new.autor_id := coalesce(public.processos_perfil_atual(new.company_id), new.autor_id);
  return new;
end $$;
revoke all on function public.processo_eventos_antes_gravar() from public, anon;

create trigger trg_processo_eventos_antes_gravar
  before insert on public.processo_eventos
  for each row execute function public.processo_eventos_antes_gravar();

-- 5. Acesso (RLS) ------------------------------------------------------------------------------------------
alter table public.processo_opcoes enable row level security;
alter table public.processos enable row level security;
alter table public.processo_eventos enable row level security;

create policy "processo_opcoes select equipe" on public.processo_opcoes for select to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processo_opcoes.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin', 'colaborador'])))
);
-- Item criado pela equipe nunca tem papel (os 4 fixos vêm desta migration).
create policy "processo_opcoes insert quem gerencia processos" on public.processo_opcoes for insert to authenticated with check (
  papel is null and exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processo_opcoes.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin']) or 'processos' = any (p.allowed_modules)))
);

create policy "processos select equipe" on public.processos for select to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin', 'colaborador'])))
);
create policy "processos insert quem gerencia processos" on public.processos for insert to authenticated with check (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin']) or 'processos' = any (p.allowed_modules)))
);
create policy "processos update quem gerencia processos" on public.processos for update to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin']) or 'processos' = any (p.allowed_modules)))
);
create policy "processos delete admin" on public.processos for delete to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin'])))
);

create policy "processo_eventos select equipe" on public.processo_eventos for select to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processo_eventos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin', 'colaborador'])))
);
-- A tela só grava mensagem; troca de status quem grava é o trigger.
create policy "processo_eventos insert mensagem" on public.processo_eventos for insert to authenticated with check (
  tipo = 'mensagem' and exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = processo_eventos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'super_admin']) or 'processos' = any (p.allowed_modules)))
);

revoke all on public.processo_opcoes, public.processos, public.processo_eventos from anon;
revoke update, delete on public.processo_opcoes from authenticated;
revoke update, delete on public.processo_eventos from authenticated;
-- Funções de gatilho fora do /rpc (o gatilho dispara do mesmo jeito; conferido como usuário logado).
revoke all on function public.processos_antes_gravar() from authenticated;
revoke all on function public.processos_registrar_status() from authenticated;
revoke all on function public.processo_eventos_antes_gravar() from authenticated;

-- 6. Listas iniciais (tiradas da planilha, já limpas) — só empresas internas (o módulo é interno) ----------
insert into public.processo_opcoes (company_id, tipo, nome, papel, ordem)
select c.id, v.tipo, v.nome, v.papel, v.ordem
  from public.companies c
  cross join (values
    ('status', 'Não iniciado', 'inicial', 10),
    ('status', 'Viabilidade', null, 20),
    ('status', 'DBE', null, 30),
    ('status', 'Integrador', null, 40),
    ('status', 'Pagamento DAE', null, 50),
    ('status', 'Assinatura', null, 60),
    ('status', 'Análise no órgão', null, 70),
    ('status', 'Aguardando cliente', 'aguardando_cliente', 80),
    ('status', 'Concluído', 'concluido', 90),
    ('status', 'Cancelado', 'cancelado', 100),
    ('servico', 'Abertura EI/LTDA', null, 75),
    ('servico', 'Abertura MEI', null, 75),
    ('servico', 'Alteração', null, 75),
    ('servico', 'Baixa', null, 75),
    ('servico', 'Regularização', null, 75),
    ('servico', 'Licenciamento/Alvará', null, 75),
    ('servico', 'Registro', null, 75),
    ('servico', 'Contrato', null, 75),
    ('servico', 'Distrato', null, 75),
    ('servico', 'Procuração', null, 75),
    ('servico', 'Certificado digital', null, 75),
    ('servico', 'Transferência de contabilidade', null, 75),
    ('orgao', 'JUCEMG', null, 75),
    ('orgao', 'Receita Federal', null, 75),
    ('orgao', 'Redesim', null, 75),
    ('orgao', 'Prefeitura', null, 75),
    ('orgao', 'SEF/MG', null, 75),
    ('orgao', 'Corpo de Bombeiros', null, 75),
    ('orgao', 'Vigilância Sanitária', null, 75)
  ) as v(tipo, nome, papel, ordem)
 where c.is_internal;
