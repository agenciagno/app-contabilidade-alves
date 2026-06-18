## Correção 1: Guarda de transação existente no auto-cálculo de Data Prevista

**Arquivo:** `src/components/transactions/TransactionFormDialog.tsx`

**Local:** useEffect nas linhas 126-138 que depende de `[dueDate, type]` e contém a lógica `addBusinessDays`.

**Alteração:** Adicionar `if (transaction) return;` como primeira linha dentro desse useEffect.

**Motivo:** O auto-cálculo da data prevista (receita = vencimento + 2 dias úteis, despesa = vencimento) deve aplicar-se apenas a transações NOVAS. Para transações existentes, o valor `transaction.expected_date` vindo do banco deve ser preservado intacto, pois o outro useEffect (linhas 140-173) já popula corretamente os campos do formulário.

---

## Correção 2: Renomear label do KPI "Saldo Bancário" → "Saldo Disponível"

**Arquivo:** `src/pages/Transactions.tsx`

**Local:** Card de KPI nas linhas 875-884, elemento `<p>` na linha 879.

**Alteração:** Trocar o texto `"Saldo Bancário"` para `"Saldo Disponível"`.

**Motivo:** Ajuste de nomenclatura solicitado. Apenas o label do card é alterado; a lógica de cálculo (`bankTotals.totalBalance`) permanece inalterada.

---

## Escopo e restrições

- Nenhum outro arquivo será modificado.
- Nenhuma lógica de cálculo, estado, estilo ou comportamento será alterado além dos dois pontos acima.
- Nenhuma tabela ou schema do Supabase será criado ou modificado.