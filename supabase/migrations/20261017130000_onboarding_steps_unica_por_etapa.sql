-- Assistente de cadastro do Super Perfil (17/10/2026): uma linha por etapa e por cliente em onboarding_steps.
-- A tabela já existia (vazia, sem uso no código) com fluxo cnpj_existente | abertura; entra o status "pulado" (etapa deixada para depois).
set lock_timeout = '3s';
create unique index if not exists onboarding_steps_contato_etapa on public.onboarding_steps (contact_id, etapa);
alter table public.onboarding_steps drop constraint onboarding_steps_status_check;
alter table public.onboarding_steps add constraint onboarding_steps_status_check
  check (status = any (array['pendente','em_andamento','concluido','bloqueado','pulado']));
comment on table public.onboarding_steps is 'Progresso do onboarding por cliente: uma linha por etapa do assistente de cadastro do Super Perfil (17/10/2026). fluxo = cnpj_existente | abertura; status pulado = etapa deixada para depois.';
