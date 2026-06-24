## Objetivo

Expandir o controle de acesso por usuário no modal "Novo/Editar Usuário" para incluir o módulo principal **Acessos** e adicionar permissões granulares por **sub-rotas** de Fiscal, Financeiro e Clientes.

## 1. Estrutura de módulos (UserFormDialog.tsx)

Reorganizar a lista em dois níveis: módulos principais + sub-rotas agrupadas por módulo.

**Principais** (mantidos + Acessos adicionado):
- `home` Home
- `legalizacao` Legalização
- `fiscal` Fiscal
- `pessoal_rh` Pessoal/RH
- `financeiro` Financeiro
- `clientes` Clientes
- `acessos` Acessos *(novo)*
- `configuracoes` Configurações

**Sub-rotas** (novas chaves, agrupadas por pai):
- Fiscal: `fiscal_dashboard`, `fiscal_tarefas`, `fiscal_calendario`, `fiscal_colaboradores`, `fiscal_monitor_cnpj`
- Financeiro: `financeiro_dashboard`, `financeiro_lancamentos`, `financeiro_pagar_receber`, `financeiro_boletos`, `financeiro_conta_corrente`, `financeiro_eventos_contabeis`, `financeiro_dre`
- Clientes: `clientes_cliente_fornecedor`, `clientes_disparos`

## 2. UI do modal

Substituir o grid plano por um layout em seções colapsáveis/agrupadas:

```text
[✓] Fiscal                      ── pai
    [✓] Dashboard
    [✓] Tarefas Fiscais
    [✓] Calendário Fiscal
    [✓] Colaboradores
    [✓] Monitor CNPJ
[✓] Financeiro                  ── pai
    [✓] Dashboard
    [✓] Lançamentos
    ...
```

Regras de interação:
- Marcar/desmarcar o pai marca/desmarca todas as sub-rotas.
- Desmarcar a última sub-rota desmarca o pai automaticamente.
- Marcar qualquer sub-rota com pai desmarcado, marca o pai.
- Módulos sem sub-rotas (Home, Legalização, Pessoal/RH, Acessos, Configurações) ficam como checkbox simples.
- Mantém visível apenas para `role === 'colaborador'` (Admin/Super Admin seguem com acesso total).

## 3. Aplicação das permissões (ModuleGuard.tsx + App.tsx)

- Adicionar `acessos` ao `MODULE_ROUTE_MAP` e ao fallback `planModules`.
- Envolver a rota `/acessos` com `<ModuleGuard moduleName="acessos">`.
- Adicionar uma prop opcional `subModule` ao `ModuleGuard`. Quando informada, o guard exige que `allowedModules` contenha tanto o módulo pai quanto a sub-rota. Compatibilidade: se o usuário tiver o pai mas nenhuma sub-rota do pai marcada (cenário de usuários antigos antes desta mudança), considerar como acesso total ao pai (não bloquear) — isto evita quebrar contas existentes.
- Aplicar `subModule` nas rotas:
  - `/fiscal/dashboard` → `fiscal_dashboard`
  - `/fiscal/tarefas` → `fiscal_tarefas`
  - `/fiscal/calendario` → `fiscal_calendario`
  - `/fiscal/colaboradores` → `fiscal_colaboradores`
  - `/fiscal/monitor-cnpj` → `fiscal_monitor_cnpj`
  - `/painel-financeiro` → `financeiro_dashboard`
  - `/movimentacoes` → `financeiro_lancamentos`
  - `/financeiro/pagar-receber` → `financeiro_pagar_receber`
  - `/boletos` → `financeiro_boletos`
  - `/bancos` → `financeiro_conta_corrente`
  - `/categorias` → `financeiro_eventos_contabeis`
  - `/dre` → `financeiro_dre`
  - `/contatos` (+ `/crm/cliente/:id`, `/relatorio-clientes`) → `clientes_cliente_fornecedor`
  - `/disparos` → `clientes_disparos`

## 4. Sidebar (AppSidebar.tsx)

Filtrar itens de sub-menu conforme `allowedModules` para esconder links que o usuário não pode acessar (mantendo o item pai visível quando houver pelo menos uma sub-rota permitida).

## 5. Persistência

`allowed_modules` continua sendo `text[]` em `profiles` — sem migração. As novas chaves de sub-rota são armazenadas no mesmo array. Usuários existentes mantêm comportamento atual graças à regra de compatibilidade do item 3.

## Arquivos a tocar

- `src/components/users/UserFormDialog.tsx` — nova estrutura `MODULE_TREE`, UI agrupada, lógica pai/filho.
- `src/components/auth/ModuleGuard.tsx` — suporte a `subModule` + `acessos`.
- `src/App.tsx` — `subModule` em cada rota e guard em `/acessos`.
- `src/components/layout/AppSidebar.tsx` — filtro de sub-itens por permissão.

## Confirmações antes de implementar

1. **Mapeamentos**: "Conta Corrente" = `/bancos`, "Eventos Contábeis" = `/categorias`, "Lançamentos" = `/movimentacoes`. Confere?
2. **Compatibilidade**: usuários atuais que têm o pai (ex.: `fiscal`) mas nenhuma sub-rota marcada continuam com acesso a tudo do pai. Ok?
