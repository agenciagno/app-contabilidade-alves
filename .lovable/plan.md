## Objetivo

Transformar `src/pages/PagarReceber.tsx` numa estrutura com duas abas (shadcn `Tabs`), mantendo a aba atual intacta e adicionando uma nova aba **"A Receber"** com filtros, colunas, KPIs e relatório restritos a entradas.

## Arquivos afetados

- `src/pages/PagarReceber.tsx` — envolver conteúdo em `Tabs`
- `src/components/transactions/CashFlowTab.tsx` — adicionar prop `mode?: 'all' | 'receivables'` (default `'all'`)
- `src/components/transactions/CashFlowReportModal.tsx` — adicionar prop `mode?: 'all' | 'receivables'` (default `'all'`)

Nenhum outro arquivo é alterado. Nenhuma migração / mudança no banco / RLS.

## Estratégia de implementação

Em vez de duplicar ~2.350 linhas de `CashFlowTab` + `CashFlowReportModal`, parametrizamos os dois componentes com uma prop `mode`. Quando `mode === 'all'` (default), o comportamento é **idêntico** ao atual — a aba 1 não sofre nenhuma alteração visível ou lógica. Quando `mode === 'receivables'`, aplicamos as diferenças abaixo.

### Diferenças quando `mode === 'receivables'`

1. **Filtragem de dados**
   - Filtrar as transações recebidas via prop: `t.type === 'receita' && (t.amount ?? 0) > 0` (equivalente ao `a_receber IS NOT NULL AND a_receber > 0` descrito).
   - Filtro de data principal aplicado sobre `due_date` (Vencimento) ao invés de `expected_date` (Data Prevista). Label do filtro: **"Data de Vencimento"** (De / Até).

2. **Tabela**
   - Remover a coluna **"A Pagar"**.
   - Manter: Data Prevista, Cliente/Fornecedor, A Receber, Vencimento, Evento Contábil, Histórico, Saldo Atual, Status.
   - Saldo progressivo recalculado apenas sobre entradas (cumulativo de `a_receber`).

3. **Cards de KPI**
   - Manter: **Capital de Giro**, **Entradas**, **Saldos Atuais**.
   - Remover o card **Saídas**.
   - Ajustar grid de KPIs para 3 colunas nessa aba.

4. **Botão "Gerar Relatório"**
   - Continua no canto superior direito.
   - Abre `CashFlowReportModal` com `mode="receivables"`: o modal esconde/remove seções, filtros, colunas e totais de "A Pagar"; usa o mesmo intervalo de vencimento; exporta somente entradas.

### Layout `PagarReceber.tsx`

```text
[H1] Pagar / Receber  (i)
[Tabs]
  ├── [TabsTrigger] Pagar / Receber   ← default, conteúdo atual intacto
  └── [TabsTrigger] A Receber
[TabsContent "all"]           → <CashFlowTab ... />                (sem prop mode)
[TabsContent "receivables"]   → <CashFlowTab ... mode="receivables" />
```

Tabs ficam abaixo do título e acima do filtro de data, conforme pedido.

## Estados e UX

- Loading / vazio / erro: reutilizar exatamente o que `CashFlowTab` já renderiza (sem novos componentes de estado).
- Estilo da aba ativa: variantes padrão do `Tabs` shadcn já em uso no projeto.
- Permissões, RLS, `company_id`, sidebar e rota permanecem inalterados.

## Verificação

- Aba 1 abre exatamente como hoje (mesma tabela, mesmos 4 KPIs, mesmo relatório).
- Aba 2 mostra somente recebíveis, filtro com label "Data de Vencimento", 3 KPIs (sem Saídas), coluna "A Pagar" ausente, saldo progressivo só de entradas, relatório sem seções de A Pagar.
