-- Serpro Integra Contador — sensor gratuito da DCTFWeb (evento E0301), 01/10/2026.
-- O evento E0301 (EVENTOSATUALIZACAO, /Monitorar, não cobrado) devolve a data da última atualização da DCTFWeb de cada CNPJ: chegada de
-- eSocial, EFD-Reinf ou SERO, ou transmissão da declaração (original ou retificadora). Ele NÃO diz qual dos dois aconteceu: só sinaliza
-- "a Receita mexeu; consulte". Mesmo desenho do sensor de Pagamentos (E0701): a rotina só marca; quem consulta o detalhe é a equipe, por clique.

create table public.serpro_dctfweb_sensor (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  evento_ultima_data date,             -- data da última atualização da DCTFWeb informada pela Receita (janela de 60 dias)
  evento_verificado_em timestamptz,
  mudou_em timestamptz,                -- quando a rotina viu a data avançar (vira "movimento novo" até a próxima consulta)
  sem_procuracao boolean not null default false,  -- o evento voltou "x" na última rodada
  ultima_consulta_em timestamptz,      -- última consulta da DCTFWeb pela equipe (qualquer competência): apaga o aviso
  updated_at timestamptz not null default now()
);
create index serpro_dctfweb_sensor_company_idx on public.serpro_dctfweb_sensor (company_id);
create trigger serpro_dctfweb_sensor_updated_at before update on public.serpro_dctfweb_sensor
  for each row execute function public.set_updated_at();

alter table public.serpro_dctfweb_sensor enable row level security;
create policy "serpro_dctfweb_sensor select equipe" on public.serpro_dctfweb_sensor
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_dctfweb_sensor.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

-- Novo tipo de notificação (aviso interno de movimento na DCTFWeb).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb'
  ]));

comment on table public.serpro_dctfweb_sensor is 'Sensor E0301 (grátis, rotina das 07:40): data da última atualização da DCTFWeb por cliente (eSocial/Reinf recebido ou declaração transmitida). Só sinaliza; não diz qual.';
