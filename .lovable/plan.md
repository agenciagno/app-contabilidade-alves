## Problemas identificados em `Lançamentos` (Transações)

### 1. Filtros de coluna mostram só valores da página atual
Os filtros de **Valor** e **Recebido** (`NumericMultiFilter`) recebem `uniqueAmounts` / `uniquePaidAmounts` calculados a partir de `transactions`, que vem paginado (99 linhas por página). Por isso só aparecem valores da página visível.

Colunas que **já usam universo completo** (não precisam mudar):
- Cliente → vem de `contacts`
- Evento Contábil → vem de `categories`
- Status → enum fixo (Pago / Pendente)
- Datas (Vencimento, Prevista, Pagamento, Emissão) → filtro por range, não por lista

Colunas que **precisam ser corrigidas**:
- **Valor** (`amount`)
- **Recebido** (`paid_amount`)

### 2. Limpar um filtro volta para página 1
Em `Transactions.tsx` há um `useEffect` que reseta `currentPage = 1` sempre que **qualquer** filtro muda — inclusive ao limpar. O usuário quer permanecer na página atual ao limpar/alterar um filtro existente (e que a página seja ajustada apenas se ficar fora do `totalPages`).

---

## Solução proposta

### A) Buscar valores distintos do servidor para os filtros numéricos

Criar um novo hook `useDistinctTransactionValues(column, filters)` em `src/hooks/useServerTransactions.ts` que:

- Recebe `column: 'amount' | 'paid_amount'` e o mesmo `ServerFilters` da listagem **excluindo o filtro da própria coluna** (padrão Excel — o filtro não se restringe a si mesmo).
- Faz `select(column)` com `applyFilters(...)`, sem paginação, mas com `.limit(5000)` por segurança.
- Retorna lista única ordenada de valores não-nulos + flag `hasEmpty` se houver `null`.
- `staleTime: 30s`, habilitado apenas quando o popover do filtro estiver aberto (passar `enabled`).

Em `Transactions.tsx`:
- Adicionar estado `openColumnFilter: 'amount' | 'paid_amount' | null` controlado pelo `NumericMultiFilter` (passar prop `onOpenChange`).
- Substituir `uniqueAmounts` / `uniquePaidAmounts` pelos dados retornados do hook (só fetch quando o popover correspondente abrir).
- Exibir “Carregando…” enquanto `isFetching`.

`applyFilters` precisa ganhar a opção de pular a coluna sendo filtrada (ex.: param `excludeColumn?: 'amount' | 'paid_amount'`) para não auto-restringir.

### B) Manter a página ao limpar/alterar filtros

Em `src/pages/Transactions.tsx`:

1. **Remover** o `useEffect` que faz `setCurrentPage(1)` em qualquer mudança de filtro (linhas 658-661).
2. Adicionar um `useEffect` de “clamp” que ajusta a página somente quando ela passa do total disponível:
   ```ts
   useEffect(() => {
     if (!isLoading && totalPages > 0 && currentPage > totalPages) {
       setCurrentPage(totalPages);
     }
   }, [totalPages, currentPage, isLoading]);
   ```
3. Resultado: aplicar/limpar filtros mantém o usuário na mesma página; só recua se a página atual ficar vazia.

---

## Arquivos a alterar

- `src/hooks/useServerTransactions.ts` — adicionar `useDistinctTransactionValues` e suportar `excludeColumn` em `applyFilters`.
- `src/pages/Transactions.tsx` — trocar fonte dos valores únicos, controlar `open` dos popovers numéricos, remover reset de página, adicionar clamp.
- `src/components/transactions/TransactionFilters.tsx` — não precisa (é o filtro superior, não os de coluna). Sem alterações.
- O `NumericMultiFilter` em `Transactions.tsx` (linha 148) ganha props `loading?: boolean` e `onOpenChange?: (open: boolean) => void`.

## Observações

- Mantemos a lógica atual de paginação no servidor (99/página) — performance preservada.
- O limite de 5000 valores distintos por filtro evita payloads gigantes; para a base atual (~4.288 transações) cobre tudo. Se um dia ultrapassar, exibimos um aviso “mostrando os primeiros 5000”.
- A correção do reset de página vale para todos os filtros (topo e coluna).