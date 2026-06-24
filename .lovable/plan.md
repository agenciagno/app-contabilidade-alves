## Objetivo

Reorganizar a navegação:
- Renomear módulo **Clientes → Contatos** e eliminar sua sub-rota; o conteúdo de `/contatos` passa a ser a página principal do módulo.
- Criar novo módulo **Tech** logo abaixo de Home, contendo a sub-rota **Disparos** (movida de Clientes).

## 1. Sidebar (`AppSidebar.tsx`)

- Adicionar entrada **Tech** logo após Home, como módulo `collapsible` com `moduleKey: 'tech'` e sub-item `Disparos` (`/disparos`, `subKey: 'tech_disparos'`).
- Substituir a entrada `Clientes` (collapsible) por uma entrada `simple` chamada **Contatos** (`/contatos`, `moduleKey: 'contatos'`, ícone `Users`).
- Remover do bloco Clientes os sub-itens `Cliente/Fornecedor` e `Disparos`.
- Atualizar `SUB_MODULES_BY_PARENT`: remover entrada `clientes`, adicionar `tech: ['tech_disparos']`.
- Incluir `'contatos'` e `'tech'` no fallback `planModules` e na `MODULE_PRIORITY`.

## 2. ModuleGuard (`ModuleGuard.tsx`)

- Em `MODULE_ROUTE_MAP`: remover `clientes`, adicionar `contatos: '/contatos'` e `tech: '/disparos'`.
- Em `MODULE_PRIORITY`: substituir `'clientes'` por `'contatos'` e adicionar `'tech'` (depois de Home).
- `SUB_MODULES_BY_PARENT`: remover `clientes`, adicionar `tech: ['tech_disparos']`.
- Atualizar `planModules` default trocando `'clientes'` → `'contatos'` e adicionando `'tech'`.

## 3. Rotas (`App.tsx`)

- `/contatos`, `/crm/cliente/:id`, `/relatorio-clientes` → `<ModuleGuard moduleName="contatos">` (sem subModule, pois não há mais sub-rotas).
- `/disparos` → `<ModuleGuard moduleName="tech" subModule="tech_disparos">`.

## 4. Modal de Usuário (`UserFormDialog.tsx`)

`MODULE_TREE` passa a ser:

```text
Home
Tech
  └ Disparos
Legalização
Fiscal
  └ Dashboard, Tarefas Fiscais, Calendário Fiscal, Colaboradores, Monitor CNPJ
Pessoal / RH
Financeiro
  └ Dashboard, Lançamentos, Pagar/Receber, Boletos, Conta Corrente, Eventos Contábeis, DRE
Contatos
Acessos
Configurações
```

- Remover o nó `clientes` (e seus filhos `clientes_cliente_fornecedor` / `clientes_disparos`).
- Adicionar nó `contatos` (sem filhos).
- Adicionar nó `tech` com filho `tech_disparos` (label "Disparos").

## 5. Compatibilidade com usuários existentes

Tabela `profiles.allowed_modules` é `text[]` — sem migração. Para evitar que colaboradores percam acesso após o rename:

- No `ModuleGuard` e na sidebar, ao avaliar `contatos`, considerar também a chave legada `clientes` como equivalente (se o usuário tem `clientes`, vê `contatos`).
- Ao avaliar `tech_disparos`, considerar também a chave legada `clientes_disparos` como equivalente.
- Esse mapeamento legado é apenas leitura. Quando o admin salvar o usuário pelo novo modal, as chaves novas substituem as antigas.

## Arquivos a tocar

- `src/components/users/UserFormDialog.tsx` — novo MODULE_TREE.
- `src/components/auth/ModuleGuard.tsx` — mapas, prioridade, compatibilidade legada.
- `src/components/layout/AppSidebar.tsx` — nova entrada Tech, Contatos como simples, fallback `planModules`, compatibilidade legada.
- `src/App.tsx` — guards das rotas `/contatos`, `/crm/cliente/:id`, `/relatorio-clientes`, `/disparos`.
