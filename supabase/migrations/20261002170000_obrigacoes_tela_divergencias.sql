-- Tela Obrigações e declarações, 02/10/2026: esfera correta, resumo por obrigação, clientes clicáveis com o cruzamento com a Receita
-- (a regra que foi aplicada à mão nos lotes de limpeza vira função), marcar/remover direto da tela e origem da data editável.

-- ---------------------------------------------------------------- esfera: estava tudo "federal"
update public.fiscal_obligations_catalog set jurisdiction = 'estadual' where name in ('ICMS', 'SEDIF', 'SINTEGRA', 'DAPI', 'SPED ICMS') and is_custom = true;
update public.fiscal_obligations_catalog set jurisdiction = 'municipal' where name in ('ISS', 'Declaração Municipal') and is_custom = true;

-- ---------------------------------------------------------------- divergências com a Receita (clientes do Simples)
-- Evidência: a última declaração PGDAS-D lida (serpro_faturamento.dados.atividades) com receita no mês.
--   tem ISS  = alguma atividade com ISS no DAS ou ISS retido; tem ICMS = ICMS no DAS, substituição tributária/monofásico ou transporte.
--   falta   = a Receita mostra o tributo e o cliente não tem a obrigação; sobra = tem a obrigação e a declaração não mostra o tributo.
--   revisar = ICMS marcado sem ICMS na declaração, mas CNAE (principal ou secundário) de comércio, indústria ou alimentação, ou há venda de mercadoria:
--             um mês só não prova, a equipe decide. SINTEGRA/SEDIF acompanham o ICMS e Declaração Municipal acompanha o ISS.
-- Só cliente do Simples; sem declaração com receita não há divergência de ISS/ICMS (não há evidência).
create or replace function public.fiscal_divergencias_receita()
returns table (c_id uuid, o_id uuid, tipo text, motivo text)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_company uuid; v_iss uuid; v_icms uuid; v_sint uuid; v_sedif uuid; v_dm uuid;
begin
  select p.company_id into v_company from public.profiles p where p.user_id = auth.uid() limit 1;
  if v_company is null then raise exception 'Sem permissão'; end if;
  select o.id into v_iss  from public.fiscal_obligations_catalog o where o.name = 'ISS' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_icms from public.fiscal_obligations_catalog o where o.name = 'ICMS' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_sint from public.fiscal_obligations_catalog o where o.name = 'SINTEGRA' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_sedif from public.fiscal_obligations_catalog o where o.name = 'SEDIF' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;
  select o.id into v_dm   from public.fiscal_obligations_catalog o where o.name = 'Declaração Municipal' and (o.company_id is null or o.company_id = v_company) order by o.company_id nulls last limit 1;

  return query
  with base as (
    select c.id as cid,
      case when (c.cnae_principal->>'codigo') ~ '^[0-9]{2}' then left(c.cnae_principal->>'codigo', 2)::int end as dv,
      coalesce((select bool_or(left(s->>'codigo', 2)::int between 45 and 47 or left(s->>'codigo', 2)::int between 10 and 33 or left(s->>'codigo', 2)::int = 56)
                from jsonb_array_elements(coalesce(c.cnaes_secundarios, '[]'::jsonb)) s where (s->>'codigo') ~ '^[0-9]{2}'), false) as sec_merc,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_iss)   as m_iss,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_icms)  as m_icms,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_sint)  as m_sint,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_sedif) as m_sedif,
      exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = v_dm)    as m_dm
    from public.contacts c
    where c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[])) and c.tax_regime = 'simples_nacional'
  ), ult as (
    select distinct on (f.contact_id) f.contact_id as cid, f.periodo_apuracao, f.rpa_total, f.dados
    from public.serpro_faturamento f where f.company_id = v_company and f.confiavel
    order by f.contact_id, f.periodo_apuracao desc
  ), ev as (
    select u.cid, to_char(u.periodo_apuracao, 'MM/YYYY') as mes,
      coalesce(bool_or(coalesce((x->'tributos'->>'iss')::numeric, 0) > 0 or (x->>'iss_retido') = 'true'), false) as tem_iss,
      coalesce(bool_or(coalesce((x->'tributos'->>'icms')::numeric, 0) > 0 or (x->>'st_ou_monofasico') = 'true'
                       or ((x->>'tipo') = 'outro' and (x->>'descricao') ilike '%transporte%')), false) as tem_icms,
      coalesce(bool_or((x->>'tipo') in ('revenda', 'industrializacao')), false) as tem_merc
    from ult u cross join lateral jsonb_array_elements(coalesce(u.dados->'atividades', '[]'::jsonb)) x
    where u.rpa_total > 0
    group by u.cid, u.periodo_apuracao
  ), r as (
    select b.cid, v_iss as oid,
      case when b.m_iss and not e.tem_iss then 'sobra' when not b.m_iss and e.tem_iss then 'falta' end as tipo,
      case when b.m_iss and not e.tem_iss then 'Sem ISS na declaração de ' || e.mes else 'Paga ou tem ISS retido na declaração de ' || e.mes end as motivo
    from base b join ev e on e.cid = b.cid
    union all
    select b.cid, v_icms,
      case when b.m_icms and not e.tem_icms then (case when b.dv in (45, 46, 47, 56) or b.dv between 10 and 33 or b.sec_merc or e.tem_merc then 'revisar' else 'sobra' end)
           when not b.m_icms and e.tem_icms then 'falta' end,
      case when b.m_icms and not e.tem_icms then 'Sem ICMS nem substituição tributária na declaração de ' || e.mes
                                                  || case when b.dv in (45, 46, 47, 56) or b.dv between 10 and 33 or b.sec_merc or e.tem_merc then ' (CNAE ou venda de mercadoria: confira)' else '' end
           else 'ICMS ou substituição tributária na declaração de ' || e.mes end
    from base b join ev e on e.cid = b.cid
    union all
    select b.cid, v_sint,
      case when b.m_sint and not b.m_icms then 'sobra' when b.m_icms and not b.m_sint then 'falta' end,
      case when b.m_sint and not b.m_icms then 'Cliente sem a obrigação ICMS' else 'Cliente com ICMS e sem SINTEGRA' end
    from base b
    union all
    select b.cid, v_sedif,
      case when b.m_sedif and not b.m_icms then 'sobra' when b.m_icms and not b.m_sedif then 'falta' end,
      case when b.m_sedif and not b.m_icms then 'Cliente sem a obrigação ICMS' else 'Cliente com ICMS e sem SEDIF' end
    from base b
    union all
    select b.cid, v_dm,
      case when b.m_dm and not b.m_iss then 'sobra' when b.m_iss and not b.m_dm then 'falta' end,
      case when b.m_dm and not b.m_iss then 'Cliente sem a obrigação ISS' else 'Cliente com ISS e sem Declaração Municipal' end
    from base b
  )
  select r.cid, r.oid, r.tipo, r.motivo from r where r.tipo is not null and r.oid is not null;
end $$;
revoke all on function public.fiscal_divergencias_receita() from public, anon;
grant execute on function public.fiscal_divergencias_receita() to authenticated, service_role;

-- ---------------------------------------------------------------- resumo da tela (um número por obrigação)
create or replace function public.fiscal_obrigacoes_resumo()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb; v_cli_div integer; v_receita integer; v_sem integer; v_div jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;

  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_div from public.fiscal_divergencias_receita() d;

  select coalesce(jsonb_agg(jsonb_build_object(
      'obligation_id', o.id,
      'clientes', (select count(*) from public.client_obligations co join public.contacts c on c.id = co.contact_id
                    where co.obligation_id = o.id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))),
      'abertas', (select count(*) from public.fiscal_tasks t where t.company_id = v_company and t.obligation_id = o.id and t.status in ('a_fazer', 'em_progresso', 'aguardando_cliente')),
      'divergencias', (select count(*) from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) where d.o_id = o.id and d.tipo in ('falta', 'sobra')),
      'revisar', (select count(*) from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) where d.o_id = o.id and d.tipo = 'revisar'),
      'proximo_data', (select min(fce.effective_due_date) from public.fiscal_calendar_effective fce where fce.obligation_id = o.id and fce.effective_due_date >= current_date),
      'proximo_fonte', (select fce.fonte from public.fiscal_calendar_effective fce where fce.obligation_id = o.id and fce.effective_due_date >= current_date order by fce.effective_due_date limit 1),
      'tem_mapeamento', exists (select 1 from public.agenda_receita_mapeamento m where m.obligation_id = o.id)
    )), '[]'::jsonb) into v_out
  from public.fiscal_obligations_catalog o where o.company_id = v_company or o.company_id is null;

  select count(distinct d.c_id) into v_cli_div from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) where d.tipo in ('falta', 'sobra');
  select count(*) into v_receita from public.fiscal_obligations_catalog o where o.active and (o.company_id = v_company or o.company_id is null)
    and exists (select 1 from public.agenda_receita_mapeamento m where m.obligation_id = o.id);
  select count(*) into v_sem from public.fiscal_obligations_catalog o where o.active and (o.company_id = v_company or o.company_id is null)
    and not exists (select 1 from public.client_obligations co join public.contacts c on c.id = co.contact_id
                    where co.obligation_id = o.id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[])));

  return jsonb_build_object('obrigacoes', v_out, 'clientes_com_divergencia', v_cli_div, 'com_data_receita', v_receita, 'sem_clientes', v_sem);
end $$;
revoke all on function public.fiscal_obrigacoes_resumo() from public, anon;
grant execute on function public.fiscal_obrigacoes_resumo() to authenticated, service_role;

-- ---------------------------------------------------------------- clientes de uma obrigação (marcados + os que a Receita indica que faltam)
create or replace function public.fiscal_obrigacao_clientes(p_obligation_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb; v_div jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;

  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_div from public.fiscal_divergencias_receita() d where d.o_id = p_obligation_id;

  select coalesce(jsonb_agg(jsonb_build_object('contact_id', x.id, 'nome', x.name, 'regime', x.tax_regime, 'marcada', x.marcada, 'divergencia', x.tipo, 'motivo', x.motivo)
           order by (x.tipo is null), x.name), '[]'::jsonb) into v_out
  from (
    select c.id, c.name, c.tax_regime, true as marcada, d.tipo, d.motivo
    from public.client_obligations co join public.contacts c on c.id = co.contact_id
    left join jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) on d.c_id = c.id
    where co.obligation_id = p_obligation_id and c.company_id = v_company and c.is_active and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
    union all
    select c.id, c.name, c.tax_regime, false, d.tipo, d.motivo
    from jsonb_to_recordset(v_div) as d(c_id uuid, o_id uuid, tipo text, motivo text) join public.contacts c on c.id = d.c_id
    where d.tipo = 'falta' and not exists (select 1 from public.client_obligations co where co.contact_id = c.id and co.obligation_id = p_obligation_id)
  ) x;
  return v_out;
end $$;
revoke all on function public.fiscal_obrigacao_clientes(uuid) from public, anon;
grant execute on function public.fiscal_obrigacao_clientes(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- marcar ou remover a obrigação de um cliente (e já atualizar o card)
create or replace function public.fiscal_cliente_obrigacao_alterar(p_contact_id uuid, p_obligation_id uuid, p_marcar boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_ok boolean;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;
  select exists (select 1 from public.contacts c where c.id = p_contact_id and c.company_id = v_company) into v_ok;
  if not v_ok then raise exception 'Cliente não encontrado'; end if;
  select exists (select 1 from public.fiscal_obligations_catalog o where o.id = p_obligation_id and (o.company_id = v_company or o.company_id is null)) into v_ok;
  if not v_ok then raise exception 'Obrigação não encontrada'; end if;

  if p_marcar then
    insert into public.client_obligations (company_id, contact_id, obligation_id)
    select v_company, p_contact_id, p_obligation_id
    where not exists (select 1 from public.client_obligations co where co.contact_id = p_contact_id and co.obligation_id = p_obligation_id);
  else
    delete from public.client_obligations where contact_id = p_contact_id and obligation_id = p_obligation_id;
  end if;
  return jsonb_build_object('ok', true, 'card', public.fiscal_cliente_tarefas(p_contact_id, true));
end $$;
revoke all on function public.fiscal_cliente_obrigacao_alterar(uuid, uuid, boolean) from public, anon;
grant execute on function public.fiscal_cliente_obrigacao_alterar(uuid, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------- de onde vem a data da obrigação (regra do sistema ou planilha da Receita)
create or replace function public.agenda_receita_mapeamento_salvar(p_obligation_id uuid, p_tipo text, p_valor text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_company uuid; v_role text; v_super boolean; v_ok boolean; v_cod text[];
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super from public.profiles where user_id = auth.uid() limit 1;
  if v_company is null or not (v_super or v_role = 'admin') then raise exception 'Só administradores'; end if;
  select exists (select 1 from public.fiscal_obligations_catalog o where o.id = p_obligation_id and (o.company_id = v_company or v_super)) into v_ok;
  if not v_ok then raise exception 'Obrigação não encontrada'; end if;

  if p_tipo = 'regra' then
    delete from public.agenda_receita_mapeamento where obligation_id = p_obligation_id;
  elsif p_tipo = 'declaracao' then
    if coalesce(trim(p_valor), '') = '' then raise exception 'Informe como começa o nome da declaração na planilha (ex.: EFD-Reinf)'; end if;
    insert into public.agenda_receita_mapeamento (obligation_id, aba, campo, padrao, codigos, observacao)
    values (p_obligation_id, 'declaracoes', 'descricao', '^' || regexp_replace(trim(p_valor), '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), null, 'Declaração: ' || trim(p_valor))
    on conflict (obligation_id) do update set aba = excluded.aba, campo = excluded.campo, padrao = excluded.padrao, codigos = null, observacao = excluded.observacao;
  elsif p_tipo = 'codigos' then
    v_cod := array(select trim(x) from unnest(regexp_split_to_array(coalesce(p_valor, ''), '[,; ]+')) x where trim(x) <> '');
    if coalesce(array_length(v_cod, 1), 0) = 0 then raise exception 'Informe ao menos um código de receita (ex.: 8109, 2172)'; end if;
    insert into public.agenda_receita_mapeamento (obligation_id, aba, campo, padrao, codigos, observacao)
    values (p_obligation_id, 'tributos', 'codigo_receita', null, v_cod, 'Códigos de receita: ' || array_to_string(v_cod, ', '))
    on conflict (obligation_id) do update set aba = excluded.aba, campo = excluded.campo, padrao = null, codigos = excluded.codigos, observacao = excluded.observacao;
  else
    raise exception 'Tipo inválido';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.agenda_receita_mapeamento_salvar(uuid, text, text) from public, anon;
grant execute on function public.agenda_receita_mapeamento_salvar(uuid, text, text) to authenticated, service_role;
