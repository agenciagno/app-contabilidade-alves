## Objetivo

Tornar o botão "Gerar Relatório" independente em cada sub-aba de `/financeiro/pagar-receber`, lendo os dados exatamente como a aba ativa os exibe.

Hoje cada `CashFlowTab` já tem seu próprio botão e abre seu próprio `CashFlowReportModal` com `mode` (`'all'` ou `'receivables'`). O problema é que o modal só usa `mode` para definir o `typeFilter` inicial — o restante da lógica continua tratando tudo como "Pagar/Receber" (filtra por `expected_date`, mostra KPI de Saídas, título "Contas a Pagar/Receber", etc.). Resultado: o relatório da aba "A Receber" sai praticamente idêntico ao da aba "Pagar/Receber".

## Mudanças (somente `src/components/transactions/CashFlowReportModal.tsx`)

Espelhar no modal as mesmas regras que `CashFlowTab` aplica quando `mode === 'receivables'`:

1. **Pré-filtro de transações** (equivalente às linhas 434–437 de `CashFlowTab`):
   - Em `receivables`, antes de qualquer outro cálculo, filtrar `transactions` para `t.type === 'receita' && Number(t.amount) > 0`. Usar esse conjunto em `filteredRows`, `monthlyMatrix` e `monthlyHierarchicalMatrix`.

2. **Chave de data**:
   - Em `receivables`, trocar `expected_date` por `due_date` no:
     - filtro `!t.is_paid && t.expected_date` → `!t.is_paid && (t.due_date || t.expected_date)`
     - filtro de período (`startDate`/`endDate`) usa `due_date`
     - ordenação final usa `due_date`
   - Em `all`, mantém `expected_date` como hoje.

3. **KPIs**:
   - Em `receivables`, remover o card "Saídas" do bloco visual e do PDF (passar a 3 cards: Capital de Giro, Entradas, Saldos Atuais), idêntico ao `grid-cols-3` da aba.
   - Recalcular `capitalDeGiro` = `totalBankBalance + entradas` quando `receivables` (sem saídas), igual à aba.

4. **Títulos e labels**:
   - Título principal e do PDF: `"Relatório de A Receber"` em receivables; manter `"Relatório de Contas a Pagar/Receber"` em `all`.
   - `typeLabel` fixo em "A Receber" quando receivables (já inicializa em `receita`, mas travar para evitar troca manual via UI — esconder o filtro de tipo).
   - Coluna "Data Prevista" da tabela do relatório vira "Vencimento" em receivables (espelha a remoção de Data Prevista feita na aba).

5. **Matriz mensal**:
   - Em receivables, o pré-filtro do passo 1 já garante apenas receitas; também usar `due_date` como referência de mês quando `monthlyStatus === 'pending'` em receivables (em `paid` continua usando `t.date`).

## Detalhes técnicos

- Toda a lógica fica condicionada a `isReceivables` (já existente na linha 71). Nenhuma nova prop é necessária — `mode` já é passado por `CashFlowTab` (linha 1042).
- `CashFlowTab.tsx` e `PagarReceber.tsx` **não mudam**.
- KPIs, totais, fontes do PDF/XLS/CSV permanecem com a mesma formatação e estilos.

## Ajuste final

Na sub-aba "A Receber" (`mode='receivables'`), além do pré-filtro de receitas, restringir a exibição apenas às transações cujo **Evento Contábil** seja **Honorários Contábeis**:

- Em `CashFlowTab.tsx`, o `useMemo` de pré-filtro agora inclui `t.category?.name === 'Honorários Contábeis'`.
- Em `CashFlowReportModal.tsx`, o mesmo filtro é espelhado no pré-filtro `txns` para que o relatório da aba "A Receber" também contenha somente essas transações.

## Fora do escopo

- Aba "Pagar / Receber" (`mode='all'`): nenhuma mudança visual ou de cálculo.
- Sidebar, rotas, autenticação, RLS, outras telas.
