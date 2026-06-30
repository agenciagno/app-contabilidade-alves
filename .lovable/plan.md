## Problema

O filtro de Regime Tributário em `/clientes` compara o valor selecionado diretamente com `contact.tax_regime`, mas os valores armazenados no banco não batem com os valores das opções do `Select`:

- Banco: `simples_nacional` (208), `isento` (42), `NULL` (3)
- Filtro envia: `simples_nacional`, `lucro_presumido`, `lucro_real`, `mei`, `nao_aplica`

Resultado: só "Simples Nacional" funciona (é o único valor que casa). "Isento / Não contribuinte" envia `nao_aplica`, mas o banco tem `isento` → 0 resultados. Não existe opção para clientes com regime **ausente** (NULL).

## Correção (somente frontend — `src/pages/Contacts.tsx`)

1. **Mapear o valor do filtro** para os valores reais do banco antes de comparar. Tratar `isento` e `nao_aplica` como sinônimos para a opção "Isento / Não contribuinte":
   ```ts
   if (filterRegime !== 'all') {
     const regime = ((c as any).tax_regime || '').toString().toLowerCase().trim();
     if (filterRegime === 'ausente') {
       matchesRegime = regime === '';
     } else if (filterRegime === 'nao_aplica') {
       matchesRegime = regime === 'nao_aplica' || regime === 'isento';
     } else {
       matchesRegime = regime === filterRegime;
     }
   }
   ```

2. **Adicionar a opção "Ausente / Não informado"** no `SelectContent` (valor `ausente`) para localizar clientes sem regime definido.

3. Manter as demais opções (Lucro Presumido / Lucro Real / MEI) — hoje retornam vazio simplesmente porque não há clientes com esses valores no banco; após o ajuste continuarão funcionando assim que existir algum cliente cadastrado nessas faixas.

Sem mudanças em banco, hooks, ou demais módulos.