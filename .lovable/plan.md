# Correção: divergência do dia da semana em Pagar/Receber

## Causa raiz

Na página **Pagar/Receber** e nos relatórios exportados (PDF, XLS, CSV) existem duas datas distintas por lançamento:
- `expected_date` (Data Prevista)
- `due_date` (Vencimento)

A coluna **Dia** (dia da semana) hoje calcula a partir de uma delas independentemente do que a linha mostra. Em muitos casos as duas datas caem em dias diferentes — então o usuário vê, por exemplo, Prevista=13/07 mas "Dia = Terça" (porque foi calculado sobre o Vencimento=14/07).

Além disso, a função `weekdayOf` do relatório está correta (usa componentes numéricos, sem timezone), mas a ordem de fallback está invertida em relação ao modo exibido:

| Local | Modo | Data mostrada na linha | Data usada p/ Dia hoje | Correto |
|---|---|---|---|---|
| `CashFlowTab.tsx` L985 | Pagar/Receber (all) | Prevista + Vencimento | `expected_date \|\| due_date` | Manter `expected_date` (leftmost) |
| `CashFlowTab.tsx` L985 | A Receber | só Vencimento | `expected_date \|\| due_date` ❌ | usar `due_date` |
| `CashFlowReportModal.tsx` PDF/XLS/CSV | all | Prevista + Vencimento | `due_date \|\| expected_date` ❌ | usar `expected_date` (coluna primária/leftmost) |
| `CashFlowReportModal.tsx` PDF/XLS/CSV | A Receber | só Vencimento | `due_date \|\| expected_date` | Manter `due_date` |

## Alterações

### 1. `src/components/transactions/CashFlowTab.tsx` (L985)
No modo `receivables` (A Receber) calcular o dia a partir de `due_date` (única data mostrada). No modo padrão manter `expected_date` (coluna leftmost mostrada).

```tsx
{(() => {
  const d = isReceivables ? row.due_date : (row.expected_date || row.due_date);
  return d ? getDayOfWeek(d) : '—';
})()}
```

### 2. `src/components/transactions/CashFlowReportModal.tsx` (L506, L517, L651, L662, L726, L737)
Inverter fallback no modo "all" para casar com a coluna Prevista (leftmost). Modo receivables permanece `due_date`.

- Linhas em modo `isReceivables`: `weekdayOf(r.due_date || r.expected_date)` (sem mudança)
- Linhas em modo `all` (PDF L517, XLS L662, CSV L737): trocar por `weekdayOf(r.expected_date || r.due_date)`

## Não altero
- Nada em business-days/holidays, nem tabelas/hooks/queries.
- Nenhum outro arquivo além dos dois acima.
- A lógica de parsing de data (`weekdayOf` e `getDayOfWeek` já usam abordagem segura contra timezone).

## Verificação
- `tsgo --noEmit` para checar tipos.
- Conferir na UI: linha com Prevista=13/07 e Vencimento=14/07 deve mostrar "Dia = Segunda" (segunda-feira 13/07/2026).
- Gerar PDF e conferir coluna Dia alinhada com coluna Prevista (modo all) ou Vencimento (modo A Receber).
