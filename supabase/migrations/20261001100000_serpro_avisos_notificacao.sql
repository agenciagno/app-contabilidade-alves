-- Serpro — Fase A, ajustes finais (01/10/2026)
-- 1) Notificação interna quando a rotina diária (E0601) achar mensagem nova na Caixa Postal: novo type no CHECK
--    existente de notifications (mesmo padrão do boleto_pago). Inserida pela function serpro-caixa-postal.
-- 2) Histórico dos avisos enviados ao cliente a partir de Termos de Intimação ("Avisar cliente").
--    Só o backend (service_role) grava; a equipe lê.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem'
  ]));

create table public.serpro_caixa_postal_avisos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mensagem_id uuid not null references public.serpro_caixa_postal_mensagens(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp', 'copiar')),
  destino text,
  mensagem text not null,           -- texto enviado ao cliente (nunca o corpo da intimação)
  enviado_por uuid,                 -- profiles.id
  enviado_em timestamptz not null default now()
);
create index serpro_cp_avisos_msg_idx on public.serpro_caixa_postal_avisos (mensagem_id, enviado_em desc);
create index serpro_cp_avisos_company_idx on public.serpro_caixa_postal_avisos (company_id);

alter table public.serpro_caixa_postal_avisos enable row level security;
create policy "serpro_cp_avisos select equipe" on public.serpro_caixa_postal_avisos
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_caixa_postal_avisos.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

comment on table public.serpro_caixa_postal_avisos is 'Histórico de avisos ao cliente sobre mensagens da Caixa Postal (e-mail, WhatsApp ou copiado). Grava só a edge function serpro-caixa-postal.';
