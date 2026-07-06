## Objetivo
Adicionar filtro dropdown "Colaborador Responsável" na rota `/contatos`, ao lado dos filtros já existentes (Status, Categoria, Regime Tributário).

## Comportamento
- Opções do dropdown:
  - **Todos** (padrão, sem filtro)
  - **Sem responsável** — contatos com `responsible_id IS NULL`
  - Uma opção por colaborador ativo (nome completo), usando `id` do profile como value
- Ao selecionar, `filteredContacts` também filtra por `contact.responsible_id`.
- Adicionado ao `hasActiveFilters` e resetado por `clearFilters()`.

## Alterações
**`src/pages/Contacts.tsx`** (único arquivo):
1. Importar `useAllFiscalProfiles` de `@/hooks/useCollaboratorCoverage` (hook já existente que retorna todos os profiles ativos da empresa com acesso ao módulo — reutilizável aqui, sem criar hook novo).
2. Novo state `filterResponsible` (`'all' | 'none' | <profileId>`, default `'all'`).
3. Novo `<Select>` inserido logo após o Select de "Regime Tributário", seguindo o mesmo estilo (`w-[200px] h-9 bg-background/50 border-border/50`).
4. Atualizar `filteredContacts` com o filtro; atualizar `hasActiveFilters` e `clearFilters`.

## Fora de escopo
- Sem mudanças no banco, hooks, ou outros componentes.
- Sem mudança na aba "Entrada de Clientes 2026".
