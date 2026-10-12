-- 12/10/2026 (pedido de Gabriel): registro visual, com data de início e fim, de quando o cliente sai e volta ao status "Ativo".
-- Durante um período fora do Ativo a equipe não entrega obrigação nem faz tarefa; o período é a explicação do que ficou sem entrega.
--   · cliente_status_periodos: um período por troca de status (status, início, fim, origem, motivo). Um único período aberto (fim nulo) por cliente.
--   · contacts.status_cliente_desde / status_cliente_motivo: espelho do período aberto. A tela grava aqui a data da troca; o trigger lê, valida e
--     devolve o valor final. Assim a data entra na MESMA atualização da troca (sem segunda chamada).
--   · trigger BEFORE UPDATE (roda por último, depois do trigger da Receita): abre o período novo e fecha o anterior na véspera.
-- Datas: período inclusivo nas duas pontas; o novo começa no dia seguinte ao fim do anterior. Início nulo = "não informado" (Gabriel preenche à mão).
-- Quem ajusta data ou motivo de um status que já vale: responsável do cliente (qualquer setor), admin e super admin. Serviços (service role) trocam status
-- normalmente, mas não mexem em data de período aberto.
-- Não apaga tarefa nem recria nada: troca de status que apaga tarefa é outra etapa.
set local lock_timeout = '3s';

alter table public.contacts
  add column if not exists status_cliente_desde date,
  add column if not exists status_cliente_motivo text;
comment on column public.contacts.status_cliente_desde is
  'Desde quando o status_cliente atual vale. Espelho do período aberto em cliente_status_periodos; mantida pelo trigger contacts_status_periodo.';
comment on column public.contacts.status_cliente_motivo is
  'Motivo do status atual (opcional). Espelho do período aberto em cliente_status_periodos.';

create table public.cliente_status_periodos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null,
  inicio date,
  fim date,
  origem text not null default 'manual' check (origem in ('manual', 'receita', 'sistema', 'historico')),
  motivo text,
  registrado_por uuid references public.profiles(id) on delete set null,
  registrado_por_nome text,
  created_at timestamptz not null default now(),
  constraint cliente_status_periodos_datas check (fim is null or inicio is null or fim >= inicio)
);
comment on table public.cliente_status_periodos is
  'Períodos de status do cliente. fim nulo = vigente. Só o trigger contacts_status_periodo grava (security definer). origem historico = linha de partida criada em 12/10/2026, sem data.';
create unique index cliente_status_periodos_aberto_idx on public.cliente_status_periodos (contact_id) where fim is null;
create index cliente_status_periodos_contact_idx on public.cliente_status_periodos (contact_id, inicio desc nulls first, created_at desc);
create index cliente_status_periodos_company_idx on public.cliente_status_periodos (company_id, status) where fim is null;

alter table public.cliente_status_periodos enable row level security;
create policy "cliente_status_periodos select equipe" on public.cliente_status_periodos for select to authenticated using (
  exists (select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.company_id = cliente_status_periodos.company_id
            and (p.is_super_admin = true or p.role = any (array['admin', 'colaborador'])))
);
revoke all on public.cliente_status_periodos from anon;
revoke insert, update, delete on public.cliente_status_periodos from authenticated;

create or replace function public.contacts_status_periodo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_manual boolean := auth.uid() is not null;
  v_perfil_id uuid; v_role text; v_super boolean; v_nome text;
  v_aberto public.cliente_status_periodos;
  v_prev public.cliente_status_periodos;
  v_desde date; v_motivo text; v_origem text;
  v_reaberto boolean := false;
begin
  if NEW.type is distinct from 'cliente' then return NEW; end if;
  -- Nada a fazer quando status, data e motivo ficaram como estavam (a maioria das atualizações da ficha).
  if NEW.status_cliente is not distinct from OLD.status_cliente
     and NEW.status_cliente_desde is not distinct from OLD.status_cliente_desde
     and NEW.status_cliente_motivo is not distinct from OLD.status_cliente_motivo then
    return NEW;
  end if;

  if v_manual then
    select p.id, p.role, coalesce(p.is_super_admin, false), p.full_name into v_perfil_id, v_role, v_super, v_nome
      from public.profiles p where p.user_id = v_uid and p.company_id = NEW.company_id limit 1;
  end if;

  select * into v_aberto from public.cliente_status_periodos where contact_id = NEW.id and fim is null;

  -- 1) Troca de status: fecha o período vigente na véspera e abre o novo.
  if NEW.status_cliente is distinct from OLD.status_cliente then
    v_desde := case when NEW.status_cliente_desde is distinct from OLD.status_cliente_desde then NEW.status_cliente_desde end;
    v_motivo := case when NEW.status_cliente_motivo is distinct from OLD.status_cliente_motivo then nullif(btrim(NEW.status_cliente_motivo), '') end;
    v_origem := case when NEW.situacao_cadastral is distinct from OLD.situacao_cadastral then 'receita'
                     when v_manual then 'manual' else 'sistema' end;

    v_desde := coalesce(v_desde, current_date);
    if v_desde > current_date then
      if v_origem = 'manual' then raise exception 'A data do status não pode ser futura.'; end if;
      v_desde := current_date;
    end if;
    if v_aberto.id is not null and v_aberto.inicio is not null and v_desde < v_aberto.inicio then
      if v_origem = 'manual' then
        raise exception 'A data não pode ser anterior ao início do status atual (%).', to_char(v_aberto.inicio, 'DD/MM/YYYY');
      end if;
      v_desde := v_aberto.inicio;
    end if;
    if v_motivo is null and v_origem = 'receita' then
      v_motivo := 'Situação na Receita Federal: ' || coalesce(NEW.situacao_cadastral, 'sem informação');
    end if;

    if v_aberto.id is not null then
      if v_aberto.inicio is not null and v_desde = v_aberto.inicio then
        -- Troca no mesmo dia em que o status atual começou: o período mal existiu. Descarta; se o anterior tinha o status novo, ele volta a valer.
        delete from public.cliente_status_periodos where id = v_aberto.id;
        select * into v_prev from public.cliente_status_periodos
          where contact_id = NEW.id and fim = v_desde - 1 order by inicio desc nulls last limit 1;
        if v_prev.id is not null and v_prev.status = coalesce(NEW.status_cliente, 'Ativo') then
          update public.cliente_status_periodos set fim = null where id = v_prev.id;
          v_reaberto := true;
          v_desde := v_prev.inicio;
          v_motivo := v_prev.motivo;
        end if;
      else
        update public.cliente_status_periodos set fim = v_desde - 1 where id = v_aberto.id;
      end if;
    end if;

    if not v_reaberto then
      insert into public.cliente_status_periodos (company_id, contact_id, status, inicio, origem, motivo, registrado_por, registrado_por_nome)
      values (NEW.company_id, NEW.id, coalesce(NEW.status_cliente, 'Ativo'), v_desde, v_origem, v_motivo, v_perfil_id, v_nome);
    end if;
    NEW.status_cliente_desde := v_desde;
    NEW.status_cliente_motivo := v_motivo;
    return NEW;
  end if;

  -- 2) Mesmo status, data ou motivo mudaram: ajuste do período vigente.
  if not v_manual then
    -- Rotina ou serviço manda data junto com a situação da Receita; sem troca de status ela não vale.
    NEW.status_cliente_desde := OLD.status_cliente_desde;
    NEW.status_cliente_motivo := OLD.status_cliente_motivo;
    return NEW;
  end if;
  -- coalesce: responsável vazio faz o `in (...)` dar NULL, e `not NULL` deixaria passar.
  if not coalesce(v_super or v_role = 'admin'
          or v_perfil_id in (NEW.responsible_id, NEW.dp_responsible_id, NEW.financeiro_responsible_id, NEW.contabil_responsible_id, NEW.comercial_responsible_id), false) then
    raise exception 'Só o responsável pelo cliente, admin ou super admin altera a data ou o motivo do status.';
  end if;
  if NEW.status_cliente_desde > current_date then raise exception 'A data do status não pode ser futura.'; end if;
  NEW.status_cliente_motivo := nullif(btrim(NEW.status_cliente_motivo), '');

  if v_aberto.id is null then
    insert into public.cliente_status_periodos (company_id, contact_id, status, inicio, origem, motivo, registrado_por, registrado_por_nome)
    values (NEW.company_id, NEW.id, coalesce(NEW.status_cliente, 'Ativo'), NEW.status_cliente_desde, 'manual', NEW.status_cliente_motivo, v_perfil_id, v_nome);
    return NEW;
  end if;

  if NEW.status_cliente_desde is distinct from OLD.status_cliente_desde and NEW.status_cliente_desde is not null and v_aberto.inicio is not null then
    -- Mantém a sequência: o período anterior termina na véspera do novo início.
    select * into v_prev from public.cliente_status_periodos
      where contact_id = NEW.id and fim = v_aberto.inicio - 1 order by inicio desc nulls last limit 1;
    if v_prev.id is not null then
      if v_prev.inicio is not null and NEW.status_cliente_desde - 1 < v_prev.inicio then
        raise exception 'A data não pode ser anterior ao início do status anterior (%).', to_char(v_prev.inicio, 'DD/MM/YYYY');
      end if;
      update public.cliente_status_periodos set fim = NEW.status_cliente_desde - 1 where id = v_prev.id;
    end if;
  end if;
  update public.cliente_status_periodos
     set inicio = NEW.status_cliente_desde, motivo = NEW.status_cliente_motivo
   where id = v_aberto.id;
  return NEW;
end $$;

-- Roda depois dos demais BEFORE UPDATE (ordem alfabética): o trigger da Receita pode trocar status_cliente na mesma atualização.
create trigger trg_zz_contacts_status_periodo
  before update on public.contacts
  for each row execute function public.contacts_status_periodo();

-- Cliente novo já nasce com o período aberto.
create or replace function public.contacts_status_periodo_novo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.type is distinct from 'cliente' then return NEW; end if;
  insert into public.cliente_status_periodos (company_id, contact_id, status, inicio, origem, motivo)
  values (NEW.company_id, NEW.id, coalesce(NEW.status_cliente, 'Ativo'),
          coalesce(NEW.status_cliente_desde, NEW.data_inicio_contrato), case when auth.uid() is null then 'sistema' else 'manual' end,
          nullif(btrim(NEW.status_cliente_motivo), ''));
  return NEW;
end $$;

create trigger trg_contacts_status_periodo_novo
  after insert on public.contacts
  for each row execute function public.contacts_status_periodo_novo();

-- Linha de partida: um período aberto por cliente com o status de hoje e início em branco ("não informado").
-- Decisão de Gabriel (12/10/2026): sem reconstruir histórico; as datas são preenchidas à mão na ficha.
insert into public.cliente_status_periodos (company_id, contact_id, status, inicio, origem)
select c.company_id, c.id, coalesce(c.status_cliente, 'Ativo'), null, 'historico'
from public.contacts c
where c.type = 'cliente'
  and not exists (select 1 from public.cliente_status_periodos p where p.contact_id = c.id);
