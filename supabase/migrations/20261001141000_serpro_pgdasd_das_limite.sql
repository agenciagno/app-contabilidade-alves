-- DAS gerado: guarda a data limite de acolhimento (prazo real para pagar os valores consolidados).
alter table public.serpro_pgdasd_das add column limite_acolhimento date;
comment on column public.serpro_pgdasd_das.limite_acolhimento is 'Data limite para pagar o DAS gerado com os valores consolidados (dataLimiteAcolhimento). Em DAS vencido, o vencimento é o original e este é o prazo real do documento.';
