-- Serpro Integra Contador — Onda 2, passo 3: faturamento do Simples Nacional lido do PDF da declaração PGDAS-D, 30/09/2026
-- Uma linha por declaração lida. O PDF vem de CONSULTIMADECREC14 (passo 2); a leitura é por regra fixa de texto, sem IA, e não custa chamada ao Serpro.
-- `confiavel` = false quando faltou campo essencial ou uma conferência de consistência não fechou: a tela mostra o aviso e não usa o número.
-- `dados` guarda a leitura completa (triplos interno/externo/total, histórico de 12 meses, folha, tributos, município).
-- Só o backend (service_role) grava; a equipe lê.

create table public.serpro_faturamento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  declaracao_id uuid references public.serpro_pgdasd_declaracoes(id) on delete cascade,
  periodo_apuracao date not null,              -- 1º dia do mês de apuração
  numero_declaracao text not null,
  tipo text check (tipo in ('original', 'retificadora')),
  transmitida_em timestamptz,
  regime_apuracao text check (regime_apuracao in ('competencia', 'caixa')),  -- regime de apuração da receita, segundo a Receita
  rpa_total numeric(14, 2),                    -- receita bruta do período de apuração
  rbt12_total numeric(14, 2),                  -- acumulada nos 12 meses anteriores
  rba_total numeric(14, 2),                    -- acumulada no ano-calendário
  rbaa_total numeric(14, 2),                   -- acumulada no ano-calendário anterior
  limite_total numeric(14, 2),                 -- limite proporcionalizado (R$ 4,8 mi no ano cheio)
  sublimite numeric(14, 2),                    -- sublimite estadual de ICMS/ISS
  fator_r_aplica boolean,
  fator_r_texto text,                          -- como veio no PDF; só converter depois de ver uma declaração real
  confiavel boolean not null default false,
  avisos text[] not null default '{}',
  dados jsonb,
  lido_em timestamptz not null default now(),
  aplicado_fiscal_em timestamptz,              -- quando foi copiado para client_revenue (fonte 'rfb'), por ação de administrador
  aplicado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, numero_declaracao)
);
create index serpro_faturamento_company_pa_idx on public.serpro_faturamento (company_id, periodo_apuracao);
create index serpro_faturamento_contact_pa_idx on public.serpro_faturamento (contact_id, periodo_apuracao desc);

create trigger serpro_faturamento_updated_at before update on public.serpro_faturamento
  for each row execute function public.set_updated_at();

alter table public.serpro_faturamento enable row level security;

create policy "serpro_faturamento select equipe" on public.serpro_faturamento
  for select using (exists (
    select 1 from public.profiles p where p.user_id = (select auth.uid())
      and p.company_id = serpro_faturamento.company_id
      and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador']))));

comment on table public.serpro_faturamento is 'Faturamento e limites do Simples lidos do PDF da declaração PGDAS-D (regra fixa de texto). confiavel=false: não usar o número.';
