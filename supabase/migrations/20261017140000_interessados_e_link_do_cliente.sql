-- Onboarding de novos clientes, fases B, C1 e C2 (17/10/2026). Plano em reports/2026-10-17-onboarding-cadastro-crm-plano.md.
--   B  · interessados + interessado_eventos: funil (Novo → Atendido → Proposta → Fechou/Perdido) com follow-up e aviso no sino.
--   C1 · onboarding_documentos_modelo (lista padrão, editável em Tech), onboarding_links (um link público por cliente),
--        onboarding_documentos + onboarding_documento_arquivos (checklist do cliente e o que ele enviou), bucket privado.
--   C2 · onboarding_textos: textos da página (antes e depois), editáveis em Tech.
-- A página pública não lê nada direto: tudo passa pela edge function onboarding-publico (service role), que confere o token.
set lock_timeout = '3s';

-- ============ helpers de acesso ============
create or replace function public.onboarding_eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.user_id = auth.uid() and (p.role in ('admin', 'super_admin') or coalesce(p.is_super_admin, false))
  );
$$;
revoke execute on function public.onboarding_eh_admin() from public, anon;

-- ============ B · interessados ============
create table public.interessados (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  nome text not null,
  whatsapp text,
  email text,
  documento text,
  interesse text not null default 'abertura' check (interesse in ('abertura', 'troca_contador', 'mei', 'outro')),
  indicado_por text,
  regime_pretendido text,
  honorario_proposto numeric(12, 2),
  responsavel_id uuid references public.profiles(id) on delete set null,
  etapa text not null default 'novo' check (etapa in ('novo', 'atendido', 'proposta', 'fechou', 'perdido')),
  etapa_desde timestamptz not null default now(),
  proximo_contato date,
  motivo_perda text check (motivo_perda in ('preco', 'outro_contador', 'desistiu', 'sem_retorno', 'outro')),
  contact_id uuid references public.contacts(id) on delete set null,
  fechado_em timestamptz,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.interessados is 'Funil de quem procurou a CA (17/10/2026). Fora de contacts de propósito: contacts alimenta tarefas, boletos, Serpro e relatórios. Fechou = vira cliente (contact_id).';
create index interessados_company_etapa on public.interessados (company_id, etapa);
create index interessados_followup on public.interessados (proximo_contato) where etapa in ('novo', 'atendido', 'proposta');

create table public.interessado_eventos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  interessado_id uuid not null references public.interessados(id) on delete cascade,
  tipo text not null default 'anotacao' check (tipo in ('anotacao', 'etapa', 'mensagem')),
  texto text not null,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index interessado_eventos_interessado on public.interessado_eventos (interessado_id, created_at desc);

create or replace function public.interessados_antes_salvar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
  end if;
  if new.etapa = 'fechou' and new.fechado_em is null then new.fechado_em := now(); end if;
  if new.etapa <> 'fechou' then new.fechado_em := null; end if;
  if new.etapa <> 'perdido' then new.motivo_perda := null; end if;
  return new;
end $$;
create trigger trg_interessados_antes_salvar before insert or update on public.interessados
  for each row execute function public.interessados_antes_salvar();

create or replace function public.interessados_registrar_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rotulo constant jsonb := '{"novo":"Novo contato","atendido":"Atendido","proposta":"Proposta enviada","fechou":"Fechou","perdido":"Perdido"}';
begin
  if tg_op = 'INSERT' then
    insert into interessado_eventos (company_id, interessado_id, tipo, texto, criado_por)
    values (new.company_id, new.id, 'etapa', 'Cadastrado em ' || (rotulo ->> new.etapa), auth.uid());
  elsif new.etapa is distinct from old.etapa then
    insert into interessado_eventos (company_id, interessado_id, tipo, texto, criado_por)
    values (new.company_id, new.id, 'etapa', (rotulo ->> old.etapa) || ' → ' || (rotulo ->> new.etapa), auth.uid());
  end if;
  return null;
end $$;
create trigger trg_interessados_registrar_etapa after insert or update of etapa on public.interessados
  for each row execute function public.interessados_registrar_etapa();

alter table public.interessados enable row level security;
alter table public.interessado_eventos enable row level security;
create policy interessados_ler on public.interessados for select to authenticated
  using (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid()));
create policy interessados_criar on public.interessados for insert to authenticated
  with check (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid()));
create policy interessados_editar on public.interessados for update to authenticated
  using (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid()));
create policy interessados_apagar on public.interessados for delete to authenticated
  using ((company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid())) and onboarding_eh_admin());
create policy interessado_eventos_ler on public.interessado_eventos for select to authenticated
  using (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid()));
create policy interessado_eventos_criar on public.interessado_eventos for insert to authenticated
  with check (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid()));

-- Aviso no sino (Gerais) no dia do próximo contato, para o responsável (sem responsável: quem cadastrou). Um por interessado por dia.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'due_alert', 'overdue', 'task_assigned', 'task_completed', 'coverage_started', 'coverage_ended', 'popup', 'boleto_pago',
  'serpro_mensagem', 'serpro_pagamento', 'serpro_procuracao', 'serpro_dctfweb', 'serpro_dctfweb_rodada', 'serpro_das_vencimento',
  'serpro_pgdas_prazo', 'serpro_faturamento', 'serpro_defis', 'serpro_sitfis', 'gestao360_pgdas_antes_prazo',
  'gestao360_mensagem_parada', 'gestao360_baixa_sem_declaracao', 'gestao360_sem_resposta', 'agenda_fiscal', 'calendar_generated',
  'cliente_novo', 'cnpj_situacao', 'interessado_followup', 'onboarding_documento'
]));

create or replace function public.interessados_avisar_followup()
returns integer language plpgsql security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  n integer;
begin
  insert into notifications (user_id, company_id, type, title, body, action_url, reference_type, reference_id)
  select alvo.user_id, i.company_id, 'interessado_followup',
         'Retornar para ' || i.nome,
         case when i.proximo_contato < hoje then 'Próximo contato era ' || to_char(i.proximo_contato, 'DD/MM') || ' e está atrasado.'
              else 'Hoje é o dia do próximo contato.' end,
         '/contatos?aba=interessados', 'interessado', i.id
  from interessados i
  cross join lateral (
    select coalesce((select p.user_id from profiles p where p.id = i.responsavel_id and p.status_active), i.criado_por) as user_id
  ) alvo
  where i.etapa in ('novo', 'atendido', 'proposta')
    and i.proximo_contato is not null and i.proximo_contato <= hoje
    and alvo.user_id is not null
    and not exists (
      select 1 from notifications n2
      where n2.type = 'interessado_followup' and n2.reference_id = i.id
        and n2.created_at >= (hoje::timestamp at time zone 'America/Sao_Paulo')
    );
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.interessados_avisar_followup() from public, anon, authenticated;

select cron.schedule('interessados-followup-diario', '0 11 * * *', 'select public.interessados_avisar_followup()');

-- ============ C1/C2 · conteúdo editável (Tech) ============
create table public.onboarding_documentos_modelo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  fluxo text not null check (fluxo in ('cnpj_existente', 'abertura')),
  titulo text not null,
  descricao text,
  so_com_funcionarios boolean not null default false,
  regimes text[],
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.onboarding_documentos_modelo is 'Lista padrão de documentos pedidos ao cliente novo, por fluxo (com CNPJ × abertura). regimes nulo = todos. Editável em Tech → Onboarding.';

create table public.onboarding_textos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  chave text not null,
  titulo text not null,
  conteudo text not null default '',
  ordem integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (company_id, chave)
);
comment on table public.onboarding_textos is 'Textos da página do cliente (/c/<token>): antes (documentos) e depois (boas-vindas, por regime). Editável em Tech → Onboarding.';

-- ============ C1 · link e checklist por cliente ============
create table public.onboarding_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  tem_funcionarios boolean not null default false,
  prazo_envio date default ((now() at time zone 'America/Sao_Paulo')::date + 60),
  boas_vindas_liberada boolean not null default false,
  revogado_em timestamptz,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.onboarding_links is 'Um link público por cliente (/c/<token>). prazo_envio só limita o envio de arquivos; o link vale até ser revogado.';

create table public.onboarding_documentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  modelo_id uuid references public.onboarding_documentos_modelo(id) on delete set null,
  titulo text not null,
  descricao text,
  ordem integer not null default 0,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'aprovado', 'dispensado')),
  observacao text,
  enviado_em timestamptz,
  revisado_por uuid,
  revisado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index onboarding_documentos_contato on public.onboarding_documentos (contact_id, ordem);

create table public.onboarding_documento_arquivos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  documento_id uuid not null references public.onboarding_documentos(id) on delete cascade,
  caminho text not null unique,
  nome text not null,
  tamanho integer,
  enviado_em timestamptz not null default now()
);
create index onboarding_documento_arquivos_doc on public.onboarding_documento_arquivos (documento_id);

do $$
declare t text;
begin
  foreach t in array array['onboarding_documentos_modelo', 'onboarding_textos', 'onboarding_links', 'onboarding_documentos', 'onboarding_documento_arquivos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid()))', t || '_ler', t);
  end loop;
  -- Listas e textos padrão: só admin edita. Link e checklist: a equipe toda.
  foreach t in array array['onboarding_documentos_modelo', 'onboarding_textos'] loop
    execute format('create policy %I on public.%I for all to authenticated using ((company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid())) and onboarding_eh_admin()) with check ((company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid())) and onboarding_eh_admin())', t || '_admin', t);
  end loop;
  foreach t in array array['onboarding_links', 'onboarding_documentos', 'onboarding_documento_arquivos'] loop
    execute format('create policy %I on public.%I for all to authenticated using (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid())) with check (company_id = get_user_company_id(auth.uid()) or is_super_admin(auth.uid()))', t || '_equipe', t);
  end loop;
end $$;

-- Bucket privado. Caminho: <company_id>/<contact_id>/<documento_id>/<arquivo>. O cliente sobe por URL assinada (edge function);
-- a equipe lê pela política abaixo (primeira pasta = empresa do usuário).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onboarding-documentos', 'onboarding-documentos', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;
create policy onboarding_documentos_equipe_ler on storage.objects for select to authenticated
  using (bucket_id = 'onboarding-documentos' and (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text);
create policy onboarding_documentos_equipe_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'onboarding-documentos' and (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text);

-- ============ conteúdo padrão (base para Gabriel editar) ============
with ca as (select id from public.companies where is_internal order by created_at limit 1)
insert into public.onboarding_documentos_modelo (company_id, fluxo, titulo, descricao, so_com_funcionarios, regimes, ordem)
select ca.id, d.fluxo, d.titulo, d.descricao, d.func, d.regimes, d.ordem from ca, (values
  ('cnpj_existente', 'Contrato social e alterações', 'Ou requerimento de empresário (EI) ou certificado do MEI (CCMEI).', false, null::text[], 1),
  ('cnpj_existente', 'Documento com foto dos sócios', 'RG ou CNH de cada sócio (frente e verso).', false, null, 2),
  ('cnpj_existente', 'Comprovante de endereço dos sócios', 'Conta de luz, água ou telefone recente.', false, null, 3),
  ('cnpj_existente', 'Alvará e inscrições municipal/estadual', 'Se tiver em mãos. O que já estiver no cadastro a gente busca.', false, null, 4),
  ('cnpj_existente', 'Balanço, balancete e livros do último ano', 'Peça ao contador anterior.', false, array['lucro_presumido', 'lucro_real'], 5),
  ('cnpj_existente', 'Extratos bancários do mês de entrada', 'De todas as contas da empresa, em PDF.', false, null, 6),
  ('cnpj_existente', 'Documentos dos funcionários', 'Relação de funcionários, contratos, última folha e guias de FGTS/eSocial.', true, null, 7),
  ('cnpj_existente', 'Contato do contador anterior', 'Nome, telefone e e-mail, para combinarmos a transferência.', false, null, 8),
  ('cnpj_existente', 'Acesso ao emissor de notas fiscais', 'Qual sistema você usa para emitir notas e quem pode nos dar acesso.', false, null, 9),
  ('abertura', 'Documento com foto e CPF de cada sócio', 'RG ou CNH (frente e verso).', false, null, 1),
  ('abertura', 'Comprovante de endereço residencial dos sócios', 'Conta de luz, água ou telefone recente.', false, null, 2),
  ('abertura', 'Certidão de casamento', 'Só se algum sócio for casado (para o regime de bens).', false, null, 3),
  ('abertura', 'IPTU do endereço da empresa', 'Folha do carnê com a inscrição imobiliária.', false, null, 4),
  ('abertura', 'Contrato de locação ou escritura do imóvel', 'Do endereço onde a empresa vai funcionar.', false, null, 5),
  ('abertura', 'Atividades, capital social e participação de cada sócio', 'Pode escrever num papel e mandar a foto, ou nos contar no WhatsApp.', false, null, 6),
  ('abertura', 'Conta gov.br nível prata ou ouro dos sócios', 'Mande um print da tela do gov.br mostrando o nível. É usada para assinar.', false, null, 7),
  ('abertura', 'Previsão de faturamento e se terá funcionários', 'Uma estimativa já ajuda a escolher o melhor regime.', false, null, 8)
) as d(fluxo, titulo, descricao, func, regimes, ordem);

with ca as (select id from public.companies where is_internal order by created_at limit 1)
insert into public.onboarding_textos (company_id, chave, titulo, conteudo, ordem)
select ca.id, t.chave, t.titulo, t.conteudo, t.ordem from ca, (values
  ('pre_intro', 'Antes · Abertura da lista de documentos',
   'Olá! Para começarmos, precisamos de alguns documentos. Envie cada um pelo botão ao lado: pode ser foto tirada pelo celular ou PDF. Se tiver qualquer dúvida, chame a gente no WhatsApp.', 1),
  ('pos_intro', 'Depois · Boas-vindas',
   'Seja bem-vindo à Contabilidade Alves! Aqui está o resumo da nossa parceria: quem cuida da sua empresa, o que você recebe todo mês e como falar com a gente. Guarde este link: ele fica sempre atualizado.', 2),
  ('contato_escritorio', 'Fale com a gente (rodapé das duas fases)',
   'Contabilidade Alves · [endereço do escritório], Juatuba/MG · WhatsApp [número] · [e-mail] · Atendimento de segunda a sexta, [horário].', 3),
  ('pos_o_que_mandar', 'Depois · O que você precisa nos mandar',
   'Todo mês, até o dia [dia]: extratos bancários, notas fiscais que não forem eletrônicas e, se tiver funcionários, o ponto e as alterações do mês (admissões, férias, faltas e demissões).', 4),
  ('pos_honorario', 'Depois · Sobre o honorário',
   'O boleto do honorário chega pelo canal combinado antes do vencimento. Se precisar de segunda via, é só pedir no WhatsApp.', 5),
  ('imposto_simples_nacional', 'Impostos · Simples Nacional',
   'No Simples Nacional, quase todos os impostos da empresa são pagos numa guia única, o DAS, que vence todo dia 20. O valor é calculado sobre o faturamento do mês e já inclui, conforme a atividade, IRPJ, CSLL, PIS, COFINS, INSS patronal, ICMS e ISS.', 10),
  ('imposto_lucro_presumido', 'Impostos · Lucro Presumido',
   'No Lucro Presumido, os impostos são pagos em guias separadas: PIS e COFINS todo mês, IRPJ e CSLL a cada trimestre, além de ICMS e/ou ISS conforme a atividade. A base de cálculo é uma porcentagem do faturamento que a lei define para cada atividade.', 11),
  ('imposto_lucro_real', 'Impostos · Lucro Real',
   'No Lucro Real, IRPJ e CSLL são calculados sobre o lucro de verdade da empresa, apurado pela contabilidade. PIS e COFINS seguem o regime não cumulativo (com créditos sobre compras permitidas), além de ICMS e/ou ISS conforme a atividade.', 12),
  ('imposto_mei', 'Impostos · MEI',
   'Como MEI, você paga um valor fixo por mês no DAS-MEI (INSS mais ICMS e/ou ISS, conforme a atividade), que vence todo dia 20. Uma vez por ano, até 31 de maio, entregamos a declaração anual do MEI.', 13),
  ('imposto_outros', 'Impostos · Imune, isento e outros',
   'A sua entidade tem tratamento tributário próprio. Nós cuidamos das declarações obrigatórias e avisamos sempre que houver algo a pagar.', 14),
  ('rt_simples_nacional', 'Reforma Tributária · Simples Nacional',
   'Reforma Tributária: quem continua no Simples Nacional pagando tudo no DAS não muda a rotina em 2026. Os novos impostos (CBS e IBS) entram aos poucos a partir de 2027 e a gente avisa qualquer mudança que afete a sua empresa.', 20),
  ('rt_lucro_presumido', 'Reforma Tributária · Lucro Presumido',
   'Reforma Tributária: 2026 é ano de teste, com CBS e IBS destacados nas notas sem custo extra. Em 2027 a CBS substitui PIS e COFINS, e de 2029 a 2033 o IBS substitui aos poucos o ICMS e o ISS. Nós acompanhamos cada etapa e ajustamos a apuração da sua empresa.', 21),
  ('rt_lucro_real', 'Reforma Tributária · Lucro Real',
   'Reforma Tributária: 2026 é ano de teste, com CBS e IBS destacados nas notas sem custo extra. Em 2027 a CBS substitui PIS e COFINS, e de 2029 a 2033 o IBS substitui aos poucos o ICMS e o ISS. Nós acompanhamos cada etapa e ajustamos a apuração da sua empresa.', 22),
  ('rt_mei', 'Reforma Tributária · MEI',
   'Reforma Tributária: para o MEI, o valor fixo mensal continua. Se algo mudar para a sua atividade, a gente avisa.', 23)
) as t(chave, titulo, conteudo, ordem);
