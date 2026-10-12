-- 12/10/2026 (pedido de Gabriel): "Adicionar acesso" ganha a opção de criar um novo tipo de acesso, que fica salvo na lista da empresa.
--   · acesso_tipos: catálogo de tipos criados pela equipe (nome único por empresa, sem diferenciar maiúsculas).
--   · acessos_portais.tipo_id: tipo personalizado do acesso. Acesso personalizado grava portal = 'outros' (o enum não muda).
--   · A regra "um acesso por portal por cliente" passa a ser por portal + tipo: cada tipo personalizado vale uma vez por cliente,
--     e "Outros" sem tipo continua valendo uma vez. Quem já existe não muda (tipo_id nulo = mesma regra de antes).
--   · vw_cofre_global ganha tipo_id e tipo_nome no fim (colunas novas, nada some).
set local lock_timeout = '3s';

create table public.acesso_tipos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  nome text not null,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint acesso_tipos_nome_tamanho check (char_length(btrim(nome)) between 2 and 60)
);
comment on table public.acesso_tipos is 'Tipos de acesso (portal) criados pela equipe, além dos fixos do enum portal_tipo. Usados em acessos_portais.tipo_id.';
create unique index acesso_tipos_empresa_nome_idx on public.acesso_tipos (company_id, lower(btrim(nome)));

alter table public.acesso_tipos enable row level security;
create policy "acesso_tipos select equipe" on public.acesso_tipos for select to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = acesso_tipos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador'])))
);
-- Cria quem gerencia acessos (mesma regra do cofre: admin, super admin ou módulo "acessos").
create policy "acesso_tipos insert quem gerencia acessos" on public.acesso_tipos for insert to authenticated with check (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = acesso_tipos.company_id
            and (p.is_super_admin = true or p.role = 'admin' or 'acessos' = any (p.allowed_modules)))
);
revoke all on public.acesso_tipos from anon;
revoke update, delete on public.acesso_tipos from authenticated;

alter table public.acessos_portais
  add column tipo_id uuid references public.acesso_tipos(id) on delete restrict;
create index acessos_portais_tipo_idx on public.acessos_portais (tipo_id) where tipo_id is not null;

alter table public.acessos_portais drop constraint acessos_portais_contact_id_portal_key;
create unique index acessos_portais_contact_portal_tipo_key
  on public.acessos_portais (contact_id, portal, coalesce(tipo_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace view public.vw_cofre_global with (security_invoker = on) as
 SELECT c.id AS contact_id,
    c.name AS cliente_nome,
    c.document AS cnpj,
    ap.id AS acesso_id,
    ap.portal,
    ap.portal_label,
    ap.login,
    ap.observacao,
    ap.validade_certificado,
    ap.updated_at AS senha_atualizada_em,
        CASE
            WHEN ap.validade_certificado IS NOT NULL AND ap.validade_certificado <= (CURRENT_DATE + '30 days'::interval) THEN true
            ELSE false
        END AS alerta_vencimento,
    ap.tipo_id,
    t.nome AS tipo_nome
   FROM contacts c
     LEFT JOIN acessos_portais ap ON ap.contact_id = c.id
     LEFT JOIN acesso_tipos t ON t.id = ap.tipo_id
  WHERE ('cliente'::text = ANY (c.categorias)) AND c.is_active = true
  ORDER BY c.name, ap.portal;
