-- Serpro — 01/10/2026: a tela "Fila do dia" saiu do sistema (decisão de Gabriel: menos telas e rotas).
-- O aviso do dia do vencimento do DAS passa a abrir "Pagamentos e DAS", onde ficam o status do DAS e o botão "Copiar mensagem" do WhatsApp.
-- Só muda o link do aviso; a lógica da função é a mesma.

create or replace function public.serpro_avisar_vencimento_das(p_hoje date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);  -- p_hoje: só para teste ou reenvio à mão
  v_venc date;
  v_pa date;
  v_sem_pagamento integer;
  v_nao_consultados integer;
  v_total integer := 0;
  v_da_ca text[] := array['26764962000100', '08801596000130'];
begin
  v_venc := make_date(extract(year from v_hoje)::int, extract(month from v_hoje)::int, 20);
  while extract(dow from v_venc) in (0, 6) loop v_venc := v_venc + 1; end loop;
  if v_hoje <> v_venc then return 0; end if;
  v_pa := (date_trunc('month', v_hoje) - interval '1 month')::date;

  for cfg in select company_id from public.serpro_config loop
    if exists (select 1 from public.notifications n where n.company_id = cfg.company_id and n.type = 'serpro_das_vencimento' and (n.created_at at time zone 'America/Sao_Paulo')::date = v_hoje) then continue; end if;

    select count(*) into v_sem_pagamento from (
      select d.contact_id
      from public.serpro_pgdasd_das d join public.contacts c on c.id = d.contact_id
      where d.company_id = cfg.company_id and date_trunc('month', d.periodo_apuracao) = v_pa
        and c.status_cliente = 'Ativo' and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
        and not exists (select 1 from public.serpro_pagamentos pg where pg.contact_id = d.contact_id and pg.tipo_sigla = 'DAS' and date_trunc('month', pg.periodo_apuracao) = v_pa)
      group by d.contact_id
      having not bool_or(coalesce(d.das_pago, false))
    ) x;

    select count(*) into v_nao_consultados
    from public.contacts c
    where c.company_id = cfg.company_id and c.status_cliente = 'Ativo' and c.tax_regime = 'simples_nacional'
      and length(regexp_replace(c.document, '\D', '', 'g')) = 14 and substr(regexp_replace(c.document, '\D', '', 'g'), 9, 4) = '0001'
      and regexp_replace(c.document, '\D', '', 'g') <> all (v_da_ca)
      and not exists (select 1 from public.serpro_pgdasd_consultas q where q.contact_id = c.id and q.ano = extract(year from v_pa)::int and q.consultado_em >= date_trunc('month', v_hoje));

    insert into public.notifications (user_id, company_id, type, title, body, action_url)
    select p.user_id, cfg.company_id, 'serpro_das_vencimento',
           'DAS de ' || to_char(v_pa, 'MM/YYYY') || ' vence hoje',
           v_sem_pagamento || case when v_sem_pagamento = 1 then ' cliente sem pagamento registrado na Receita' else ' clientes sem pagamento registrado na Receita' end
             || ' · ' || v_nao_consultados || case when v_nao_consultados = 1 then ' cliente do Simples ainda não consultado' else ' clientes do Simples ainda não consultados' end
             || ' neste mês. Atualize (Pagamentos e DAS) antes de avisar os clientes.',
           '/dashboard-federal/pagamentos'
    from public.profiles p
    where p.company_id = cfg.company_id and p.status_active = true and p.user_id is not null
      and (p.role in ('admin', 'super_admin') or 'dashboard_federal' = any (p.allowed_modules));
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$function$;

revoke all on function public.serpro_avisar_vencimento_das(date) from public, anon, authenticated;
