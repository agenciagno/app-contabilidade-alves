-- 12/10/2026 (decisão de Gabriel): apagar as 21 tarefas abertas de Edmilson de Souza (Baixada), que a limpeza anterior tinha mantido.
-- Mesma função da limpeza geral: grava cada tarefa em fiscal_tarefas_dispensadas (com cópia em `tarefa`) antes de apagar.
select public.fiscal_dispensar_tarefas_cliente('a4741e93-71de-4ea0-9a7a-cee74f4b1a2b', 'limpeza');
