## Adicionar coluna "Dia da Semana" no Relatório Pagar/Receber

Adicionar uma nova coluna à direita (última) chamada **"Dia"** na tabela principal do "Gerar Relatório" do `CashFlowTab`, válida para ambas as sub-abas: **Pagar/Receber** e **A Receber**.

### Onde alterar
Arquivo único: `src/components/transactions/CashFlowReportModal.tsx`

A mesma tabela é renderizada em três formatos de export — atualizar os três para manter consistência:

1. **PDF** (`autoTable`, linhas ~484-536)
   - `head`: acrescentar `'Dia'` ao final de ambos os arrays (receivables e all).
   - `body`: acrescentar `weekdayOf(ref)` ao final de cada linha, onde `ref = r.due_date || r.expected_date` (mesma data-base já usada para Vencimento/Prevista).
   - `columnStyles`: adicionar largura curta (~10mm) e `halign: 'center'` para o novo índice.

2. **XLS** (linhas ~625-677)
   - Acrescentar `'Dia'` nos headers e o valor correspondente em cada `tableRows`.
   - Atualizar `colSpan` (já calculado via `headers.length`, então fica automático).

3. **CSV** (linhas ~699-756)
   - Acrescentar `'Dia'` nos headers e o valor em `dataLines`.

A tabela de "Consulta Mensal" (linhas ~862+) **não** é afetada — é uma matriz mensal por evento, não por linha com data.

### Detalhe técnico — helper

Adicionar utilitário no topo do arquivo:

```ts
const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const weekdayOf = (iso?: string | null) => {
  if (!iso) return '';
  // iso vem como 'YYYY-MM-DD' → parse local para evitar shift de timezone
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAYS_PT[new Date(y, m - 1, d).getDay()];
};
```

A data-fonte é a mesma já usada para ordenação/exibição: `due_date` quando existir, senão `expected_date` (em pagamentos já efetuados, `date`). Isso mantém a coluna coerente com Vencimento/Prevista exibidos na linha.

### Fora do escopo
- Tabela em tela (UI do CashFlowTab) — não solicitada.
- Outros relatórios (DRE, Banks, ContactProfile).