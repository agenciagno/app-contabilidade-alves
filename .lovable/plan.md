## 1) Kanban — Conclusão de cards agrupados (checklist)

**Problema:** `KanbanBoard.tsx` calcula `displayStatus` do grupo via `STATUS_PRECEDENCE` (status mais avançado vence). Se uma tarefa do grupo é concluída, o card inteiro pula para "Concluído".

**Correção em `src/components/fiscal/KanbanBoard.tsx`:**
- Para `GroupItem`, novo cálculo:
  - Se **todas** as tarefas estão `concluido` → `displayStatus = 'concluido'`.
  - Senão, considerar apenas as tarefas não concluídas e aplicar a precedência atual (a_fazer → em_progresso → aguardando_cliente) para escolher o status do card.
- Cards únicos (sem agrupamento) continuam seguindo o status da própria tarefa.
- No `GroupedTaskCard` (visual), exibir um contador "X/Y concluídas" quando houver pelo menos uma concluída e o grupo ainda não estiver 100% concluído (sem mudar layout).

## 2) Modal de Tarefa — Layout

**Em `src/components/fiscal/TaskDetailModal.tsx`:**
- Aumentar largura para `sm:max-w-3xl`, usar `max-h-[90vh]` com rolagem interna.
- Reorganizar em seções com `space-y-6` e grid `md:grid-cols-2` para campos curtos (Status / Vencimento / Responsável / Cliente).
- Garantir `Label` acima do campo (não sobreposto), `gap-2` em cada bloco e `Separator` entre seções (Informações, Anexo, Notas, Histórico).
- Ajustar o `Popover` de menções (`@`) para não cobrir o textarea (posicionar `side="top" align="start"`).
- Padding consistente (`px-6 py-5`) e remover `flex` sem `gap` que cause sobreposição.

## 3) Remover sub-rota "Notificações" e melhorar o sininho

**Sidebar / Rotas:**
- Remover entrada `'/fiscal/notificacoes'` em `src/components/layout/AppSidebar.tsx` (`menuEntries` Fiscal + filtros e o badge `unreadCount` ligado ao item).
- Remover rota em `src/App.tsx` e arquivo `src/pages/FiscalNotifications.tsx`.

**Sininho (`src/components/notifications/NotificationBellDropdown.tsx` + `src/hooks/useNotifications.ts`):**
- Já existe `markAsRead` e `markAllAsRead`. Garantir no dropdown:
  - Botão "Marcar todas como lidas" no topo (já existe — manter / estilizar).
  - Em cada item, ícone/botão "Marcar como lida" (check) visível quando `!read_at`, chamando `markAsRead(id)` sem fechar o popover.
  - Clique no corpo do item: navega para `action_url` E marca como lida.
- Listar tipos relevantes (`task_completed`, `task_assigned`, `task_mention`, `calendar_generated`, etc.) — o hook já busca tudo de `notifications`.

## 4) Edição em Lote — Clientes/Fornecedores

**`src/components/contacts/ContactBulkEditDialog.tsx`** — adicionar novos toggles + campos (cada um com `Switch` "editar este campo"):

- **Porte**: select `mei | me | epp | medio | grande` → `contacts.porte`.
- **Status do Cliente**: select `ativo | inativo | prospecto | suspenso` → `contacts.client_status` (ajustar para o enum existente em `contacts`).
- **Obrigações Fiscais**: multi-select de `fiscal_obligations_catalog`. Aplicação: para cada contato selecionado, fazer upsert/delete em `client_obligations` (modo "substituir" — desmarca obrigações ausentes, insere novas).
- **Categorias (controle de acesso)**: multi-select de `categories` → atualizar `contacts.allowed_category_ids` (array).
- **Configurações de Cobrança**: agrupar todos os campos de `boleto_controls` editáveis em lote (status ativo, dia de vencimento, valor padrão, juros, multa, descrição padrão, instruções, etc.). Aplicação: upsert em `boleto_controls` por `contact_id`.

Refatorar o diálogo:
- Trocar para layout `sm:max-w-2xl` com `ScrollArea`.
- Agrupar em seções colapsáveis: Dados Cadastrais, Acesso & Permissões, Fiscais, Cobrança.
- Mantém o padrão "Switch + campo" para aplicar somente o que está marcado.

## 5) Configurações > Minha Equipe — Editar senha do usuário

**`src/components/users/UserFormDialog.tsx`** (modo edição):
- Adicionar seção "Redefinir senha (opcional)" com input de nova senha + `PasswordStrength`, botão olho, mesmo padrão do create.
- Se preenchido no submit em edit, chamar nova edge function `admin-update-user-password`.

**Nova edge function `supabase/functions/admin-update-user-password/index.ts`:**
- `verify_jwt = false` (validar JWT em código).
- Recebe `{ userId, newPassword }`, valida força mínima (Zod).
- Verifica que o caller é `admin` ou `super_admin` da mesma `company_id` do `userId` alvo (consulta `profiles` com service role).
- Chama `supabase.auth.admin.updateUserById(userId, { password })`.
- Retorna sucesso/erro. CORS padrão.

Sem migrations necessárias.

## Arquivos alterados

- `src/components/fiscal/KanbanBoard.tsx`
- `src/components/fiscal/GroupedTaskCard.tsx`
- `src/components/fiscal/TaskDetailModal.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/App.tsx` (remover rota)
- `src/pages/FiscalNotifications.tsx` (delete)
- `src/components/notifications/NotificationBellDropdown.tsx`
- `src/components/contacts/ContactBulkEditDialog.tsx`
- `src/components/users/UserFormDialog.tsx`
- `supabase/functions/admin-update-user-password/index.ts` (novo)
