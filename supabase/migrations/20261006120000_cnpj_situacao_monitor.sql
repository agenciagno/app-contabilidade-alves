-- Monitor semanal da situação cadastral do CNPJ (pedido de Gabriel, 06/10/2026: "gratuita, semanal, domingo").
--   · cnpj_situacao_log: uma linha por consulta (ok ou falha). A função cnpj-situacao usa o log para saber quem já foi conferido na semana,
--     e as linhas com mudou = true são o histórico de mudanças (antes, depois, desde quando, motivo, fonte).
--   · Tipo de aviso novo no sino: cnpj_situacao (cai no sino Gerais, que só exclui serpro_ e gestao360_).
--   · Correção no trigger de status: situação "Baixada" na Receita não pode devolver o cliente a "Ativo" (a rotina passa a trazer Inapta → Baixada,
--     o caminho mais comum de uma empresa inapta). O status Baixada do cliente continua sendo decisão da CA (o trigger não o define).
-- O cron é uma migração à parte (20261006120100), aplicada só depois de a função cnpj-situacao estar implantada.

create table public.cnpj_situacao_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  consultado_em timestamptz not null default now(),
  ok boolean not null,
  fonte text,
  situacao text,
  situacao_anterior text,
  mudou boolean not null default false,
  data_situacao date,
  motivo text,
  erro text
);
comment on table public.cnpj_situacao_log is 'Consultas semanais da situação cadastral (função cnpj-situacao). mudou = true é o histórico de mudanças. Só a função grava (service role).';
create index cnpj_situacao_log_contact_idx on public.cnpj_situacao_log (contact_id, consultado_em desc);
create index cnpj_situacao_log_company_idx on public.cnpj_situacao_log (company_id, consultado_em desc);
create index cnpj_situacao_log_mudou_idx on public.cnpj_situacao_log (company_id, consultado_em desc) where mudou;

alter table public.cnpj_situacao_log enable row level security;
create policy "cnpj_situacao_log select equipe" on public.cnpj_situacao_log for select to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = cnpj_situacao_log.company_id
            and (p.is_super_admin = true or p.role = any (array['admin','colaborador'])))
);

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_dctfweb_rodada', 'serpro_das_vencimento', 'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis', 'serpro_sitfis',
    'gestao360_pgdas_antes_prazo', 'gestao360_mensagem_parada', 'gestao360_baixa_sem_declaracao', 'gestao360_sem_resposta',
    'agenda_fiscal', 'calendar_generated', 'cliente_novo', 'cnpj_situacao'
  ]));

CREATE OR REPLACE FUNCTION public.contacts_sync_status_receita()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sit text := lower(btrim(coalesce(NEW.situacao_cadastral, '')));
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.situacao_cadastral IS NOT DISTINCT FROM OLD.situacao_cadastral THEN
    RETURN NEW;
  END IF;
  IF NEW.status_cliente IN ('Ex-cliente', 'Ex-Colaborador', 'Baixada') THEN
    RETURN NEW;
  END IF;

  IF sit = 'suspensa' THEN
    NEW.status_cliente := 'Suspensa - Receita Federal';
  ELSIF sit = 'cancelada' THEN
    NEW.status_cliente := 'Cancelada - Receita Federal';
  ELSIF sit = 'inapta' THEN
    NEW.status_cliente := 'Inapta - Receita Federal';
  ELSIF sit = 'baixada' THEN
    NULL; -- baixa na Receita: o status fica como está até a CA decidir (não volta a Ativo)
  ELSIF NEW.status_cliente IN ('Suspensa - Receita Federal', 'Cancelada - Receita Federal', 'Inapta - Receita Federal') THEN
    NEW.status_cliente := 'Ativo';
  END IF;
  RETURN NEW;
END $$;
