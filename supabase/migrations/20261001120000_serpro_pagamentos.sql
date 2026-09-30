-- Serpro Integra Contador — Onda 1: Pagamentos (PAGTOWEB + evento E0701), 01/10/2026
-- Espelho dos documentos de arrecadação PAGOS (DARF, DAS, DAE, DJE) por cliente. Só o backend (service_role)
-- grava; a equipe lê. A Receita só devolve pagamento feito: "não pago" nunca vem na resposta.
-- Comprovante (PDF) é emitido por clique individual e guardado em bucket privado (cada emissão é cobrada).

-- ---------------------------------------------------------------- pagamentos
create table public.serpro_pagamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  chave text not null,                 -- número|data da arrecadação|valor (+ #n se repetir): reconsultar não duplica
  numero_documento text not null,
  tipo_codigo text,                    -- código da Receita (4 DARF, 7 DJE, 8 DARF Simples, 9 DAS, 10 DAE)
  tipo_sigla text not null default 'OUTRO' check (tipo_sigla in ('DARF', 'DAS', 'DAE', 'DJE', 'OUTRO')),
  tipo_descricao text,
  periodo_apuracao date,               -- competência / período de apuração
  data_arrecadacao date,               -- data contábil do pagamento
  data_vencimento date,
  receita_codigo text,
  receita_descricao text,
  valor_total numeric(14, 2),
  valor_principal numeric(14, 2),
  valor_multa numeric(14, 2),
  valor_juros numeric(14, 2),
  valor_saldo_total numeric(14, 2),    -- parte do pagamento ainda não utilizada (possível crédito)
  desmembramentos jsonb,               -- composição por tributo (DAS vem quebrado em IRPJ, CSLL, COFINS, PIS, CPP, ICMS, ISS)
  comprovante_path text,               -- arquivo no bucket serpro-comprovantes; vazio até o 1º clique
  comprovante_emitido_em timestamptz,
  comprovante_emitido_por uuid,
  visivel_portal boolean not null default false,  -- curadoria: só vai ao futuro portal se a equipe publicar
  sincronizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, chave)
);
create index serpro_pagamentos_contact_pa_idx on public.serpro_pagamentos (contact_id, periodo_apuracao desc);
create index serpro_pagamentos_company_pa_idx on public.serpro_pagamentos (company_id, periodo_apuracao);
create index serpro_pagamentos_doc_idx on public.serpro_pagamentos (contact_id, numero_documento);

create trigger serpro_pagamentos_updated_at before update on public.serpro_pagamentos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- consultas feitas (diferencia "0 pagamentos" de "não consultado")
create table public.serpro_pagamentos_consultas (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia date not null,           -- 1º dia do mês do período de apuração consultado
  consultado_em timestamptz not null default now(),
  consultado_por uuid,
  documentos integer not null default 0,
  primary key (contact_id, competencia)
);
create index serpro_pagamentos_consultas_company_idx on public.serpro_pagamentos_consultas (company_id, competencia);

-- ---------------------------------------------------------------- sensor E0701 (rotina diária, grátis)
create table public.serpro_pagamentos_sensor (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  evento_ultima_data date,             -- data da última mudança de pagamento (entrada, alteração, cancelamento, bloqueio)
  evento_verificado_em timestamptz,
  mudou_em timestamptz,                -- quando a rotina viu a data avançar (vira "pagamento novo" até a próxima consulta)
  updated_at timestamptz not null default now()
);
create index serpro_pagamentos_sensor_company_idx on public.serpro_pagamentos_sensor (company_id);
create trigger serpro_pagamentos_sensor_updated_at before update on public.serpro_pagamentos_sensor
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS (equipe lê; só o backend escreve)
alter table public.serpro_pagamentos enable row level security;
alter table public.serpro_pagamentos_consultas enable row level security;
alter table public.serpro_pagamentos_sensor enable row level security;

create policy "serpro_pagamentos select equipe" on public.serpro_pagamentos
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_pagamentos.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_pagamentos_consultas select equipe" on public.serpro_pagamentos_consultas
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_pagamentos_consultas.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));
create policy "serpro_pagamentos_sensor select equipe" on public.serpro_pagamentos_sensor
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_pagamentos_sensor.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

-- ---------------------------------------------------------------- bucket privado dos comprovantes
-- Sem policy em storage.objects: só a edge function (service_role) lê/grava e entrega link assinado de curta duração.
insert into storage.buckets (id, name, public) values ('serpro-comprovantes', 'serpro-comprovantes', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- novo tipo de notificação (aviso de pagamento novo)
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'due_alert', 'overdue', 'task_assigned', 'task_completed',
    'coverage_started', 'coverage_ended', 'popup', 'boleto_pago', 'serpro_mensagem', 'serpro_pagamento'
  ]));

comment on table public.serpro_pagamentos is 'Espelho dos documentos de arrecadação PAGOS (PAGTOWEB). A Receita não devolve "não pago". Comprovante emitido por clique e guardado em bucket privado.';
comment on table public.serpro_pagamentos_consultas is 'Quais meses já foram consultados por cliente: diferencia "0 pagamentos" de "não consultado".';
comment on table public.serpro_pagamentos_sensor is 'Sensor E0701 (grátis, rotina das 07:35): data da última mudança de pagamento por cliente.';
