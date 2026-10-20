-- Link do cliente (20/10/2026, pedido de Gabriel): mensagem de envio do link (e-mail e WhatsApp) personalizável só para um cliente.
-- Nulo = usa o modelo padrão de onboarding_textos (msg_link_*), editável em Tech → Onboarding. {nome}, {link} e {prazo} são trocados na tela.
set lock_timeout = '3s';
alter table public.onboarding_links
  add column mensagem_assunto text,
  add column mensagem_texto text;
comment on column public.onboarding_links.mensagem_texto is 'Mensagem de envio do link só deste cliente. Nulo = modelo padrão (onboarding_textos msg_link_*).';

with ca as (select id from public.companies where is_internal order by created_at limit 1)
insert into public.onboarding_textos (company_id, chave, titulo, conteudo, ordem)
select ca.id, t.chave, t.titulo, t.conteudo, t.ordem from ca, (values
  ('msg_link_assunto', 'Envio do link · Assunto do e-mail', 'Contabilidade Alves · {nome}', 30),
  ('msg_link_novo', 'Envio do link · Cliente novo (com documentos)',
   E'Olá, {nome}! Tudo bem?\n\nPara começarmos, separe os documentos da lista e envie por este link, direto do celular:\n{link}\n\nO prazo para envio é {prazo}. Se preferir, também mandamos a lista em PDF. Qualquer dúvida, é só responder esta mensagem.\n\nContabilidade Alves', 31),
  ('msg_link_boas_vindas', 'Envio do link · Já é cliente (só boas-vindas)',
   E'Olá, {nome}! Tudo bem?\n\nPreparamos uma página só sua com o resumo da nossa parceria: quem cuida da sua empresa, o que você recebe todo mês, seus impostos e como falar com a gente:\n{link}\n\nGuarde este link: ele fica sempre atualizado.\n\nContabilidade Alves', 32)
) as t(chave, titulo, conteudo, ordem)
on conflict (company_id, chave) do nothing;
