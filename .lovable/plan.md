Corrigir o alinhamento da coluna "Data Prevista" na tabela de Pagar/Receber.

**Problema:** Na ultima alteracao, o cabecalho da coluna "Data Prevista" foi mantido apenas no modo "Pagar / Receber" (`!isReceivables`), mas a celula de dados correspondente foi removida completamente das linhas da tabela. Isso desalinha todas as colunas na aba "Pagar / Receber": o cabecalho tem 10 colunas, mas cada linha renderiza apenas 9 celulas.

**Alteracao unica:**
- Arquivo: `src/components/transactions/CashFlowTab.tsx`
- Acrescentar de volta a celula "Data Prevista" no inicio de cada linha, renderizada condicionalmente com `{!isReceivables && (...)}`, espelhando exatamente o cabecalho.
- A celula deve exibir a data formatada de `row.expected_date` (ou `—` quando vazia), como no comportamento anterior.
- Nenhuma outra logica, filtro, KPI ou modal sera alterada.
- O `colSpan` do estado vazio ja esta correto (`isReceivables ? 8 : 10`) e nao precisa de ajuste.

**Validacao:** Verificar visualmente na aba "Pagar / Receber" que a coluna "Data Prevista" volta a aparecer e que as colunas seguintes (Cliente/Fornecedor, A Receber, A Pagar, Vencimento etc.) ficam alinhadas corretamente aos respectivos cabecalhos. Na aba "A Receber" a coluna permanece oculta, como solicitado anteriormente.
