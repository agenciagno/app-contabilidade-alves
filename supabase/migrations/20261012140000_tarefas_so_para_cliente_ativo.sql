-- 12/10/2026 (pedido de Gabriel): só o cliente com status "Ativo" entra na geração de tarefas.
-- Suspensa e Inapta continuam ativas no sistema (`is_active`) só para boletos, com o aviso de hoje; o Serpro já filtrava "Ativo" nas 11 funções serpro-*.
-- Até aqui as funções de tarefa usavam `contacts.is_active`, que inclui Suspensa e Inapta. Um critério só, numa função:
--   status_cliente_gera_tarefa(status)  (status vazio conta como Ativo, igual a contacts_unifica_ativo).
-- Lançamento manual (Lançar tarefa, só admin) continua podendo escolher Suspensa/Inapta, com confirmação na tela (decisão 1 de Gabriel).
-- Não apaga nenhuma tarefa existente: a limpeza e a troca de status que apaga tarefa são outra etapa.
set local lock_timeout = '3s';

create or replace function public.status_cliente_gera_tarefa(p_status text)
returns boolean
language sql
immutable
parallel safe
as $$ select coalesce(p_status, 'Ativo') = 'Ativo' $$;

comment on function public.status_cliente_gera_tarefa(text) is
  'Só o status "Ativo" (ou vazio) recebe tarefa automática. Usada pela geração mensal e pelas contagens do Calendário Fiscal.';

-- Funções que listam ou contam clientes: trocam `c.is_active` pelo critério novo, com o corpo que está no banco hoje.
do $$
declare
  f record;
  def text;
  achados int;
begin
  for f in
    select p.oid, p.proname, v.esperado
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join (values
      ('fiscal_clientes_sem_tarefas', 1),
      ('fiscal_obrigacao_clientes', 1),
      ('fiscal_obrigacoes_resumo', 2),
      ('fiscal_calendario_resumo', 3),
      ('fiscal_divergencias_receita', 1)
    ) as v(nome, esperado) on v.nome = p.proname
  loop
    def := pg_get_functiondef(f.oid);
    select count(*) into achados from regexp_matches(def, '\mc\.is_active\M', 'g');
    if achados <> f.esperado then
      raise exception '% tem % usos de c.is_active (esperado %)', f.proname, achados, f.esperado;
    end if;
    def := regexp_replace(def, '\mc\.is_active\M', 'public.status_cliente_gera_tarefa(c.status_cliente)', 'g');
    execute def;
  end loop;
end $$;

-- Geração mensal: automática (agenda aprovada, sem lista de clientes) só para "Ativo"; com lista de clientes (Lançar tarefa) aceita Suspensa/Inapta.
do $$
declare
  v_oid oid;
  def text;
  alvo constant text := 'c.is_active = true';
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generate_monthly_fiscal_tasks';
  def := pg_get_functiondef(v_oid);
  if (length(def) - length(replace(def, alvo, ''))) <> length(alvo) then
    raise exception 'generate_monthly_fiscal_tasks: esperava 1 uso de "%"', alvo;
  end if;
  def := replace(def, alvo,
    '(public.status_cliente_gera_tarefa(c.status_cliente) OR (p_contact_ids IS NOT NULL AND c.is_active = true))');
  execute def;
end $$;

-- Card de UM cliente (botão "Atualizar card" e Salvar do cadastro): fora do "Ativo" não cria nem acerta nada.
do $$
declare
  v_oid oid;
  def text;
  ancora constant text := $q$if v_c.id is null or v_c.company_id is distinct from v_company then raise exception 'Cliente não encontrado'; end if;$q$;
  saida constant text := $q$
  if not public.status_cliente_gera_tarefa(v_c.status_cliente) then
    return jsonb_build_object('mes_aprovado', true, 'ativo', false, 'criar', '[]'::jsonb, 'remover', '[]'::jsonb, 'datas', '[]'::jsonb,
                              'criadas', 0, 'removidas', 0, 'atualizadas', 0, 'preservadas', 0);
  end if;$q$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fiscal_cliente_tarefas';
  def := pg_get_functiondef(v_oid);
  if (length(def) - length(replace(def, ancora, ''))) <> length(ancora) then
    raise exception 'fiscal_cliente_tarefas: âncora não encontrada';
  end if;
  if (length(def) - length(replace(def, 'v_c.is_active', ''))) <> 2 * length('v_c.is_active') then
    raise exception 'fiscal_cliente_tarefas: esperava 2 usos de v_c.is_active';
  end if;
  def := replace(def, ancora, ancora || saida);
  def := replace(def, 'v_c.is_active', 'public.status_cliente_gera_tarefa(v_c.status_cliente)');
  execute def;
end $$;

-- Aviso da confirmação "Aprovar e lançar": antes listava quem fora do Ativo RECEBERIA tarefa; agora lista quem fica SEM tarefa por não estar Ativo
-- (ainda ativo no sistema, com obrigação marcada e responsável definido, e sem tarefa no mês). Mesmo formato de resposta.
create or replace function public.fiscal_lancamento_avisos(p_ano integer, p_mes integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company uuid; v_role text; v_super boolean; v_out jsonb;
begin
  select company_id, role, coalesce(is_super_admin, false) into v_company, v_role, v_super
    from public.profiles where user_id = auth.uid() and company_id = public.get_user_company_id(auth.uid()) limit 1;
  if v_company is null or not (v_super or v_role in ('admin', 'colaborador')) then raise exception 'Sem permissão'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'contact_id', x.id, 'nome', x.name, 'status_cliente', x.status_cliente, 'tarefas', x.n
         ) order by x.name), '[]'::jsonb) into v_out
  from (
    select c.id, c.name, c.status_cliente, count(*) as n
    from public.contacts c
    join public.client_obligations co on co.contact_id = c.id
    join public.fiscal_obligations_catalog foc on foc.id = co.obligation_id
    join public.fiscal_calendar_effective fce on fce.obligation_id = co.obligation_id and fce.year = p_ano and fce.month = p_mes
    where c.company_id = v_company and c.is_active and not public.status_cliente_gera_tarefa(c.status_cliente)
      and 'cliente' = any(coalesce(c.categorias, array['outros']::text[]))
      and public.fiscal_resp_do_setor(c, foc.department) is not null
      and not exists (select 1 from public.fiscal_tasks ft where ft.contact_id = c.id and ft.obligation_id = co.obligation_id
                      and ft.competence_year = fce.competence_year and ft.competence_month = fce.competence_month)
    group by c.id, c.name, c.status_cliente
  ) x;
  return v_out;
end $$;
