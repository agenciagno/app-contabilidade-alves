
## 1) FISCAL → Dashboard (`src/pages/FiscalDashboard.tsx`)

**Linha 1 — KPIs principais (compactos)**
- Manter apenas 4 cards, nesta ordem: **Pendente** (`a_fazer` + não atrasada), **Em Andamento** (`em_progresso`), **Atrasadas** (`status != concluido` e `due_date < hoje`), **Concluídas** (`concluido`).
- Remover cards: Total, Sem Responsável, Taxa de Cumprimento, Comparativo Mês Anterior.
- Reduzir padding (`p-5` → `p-3`), número `text-3xl` → `text-2xl`, ícone menor; grid `grid-cols-2 md:grid-cols-4`.

**Remover do dashboard**
- `RateKpiCard` ("Taxa de Cumprimento") + `computeComplianceRate`.
- `ComparisonKpiCard` ("Comparativo Mês Anterior") + hook `useFiscalTasksPrevMonth`.
- Gráfico "Tarefas por Colaborador" (bloco `BarChart` / `chartData`).
- Box "Próximos Vencimentos (7 dias)" (tabela `upcoming` / `useUpcomingFiscalTasks`).
- `<RevenueLimitsSection />` (migra para Monitor CNPJ — ver §2).

**Linha 2 — "Próximos Vencimentos" (substitui o "Nas próximas 48h")**
- Renomear o box `tasks48h` para **Próximos Vencimentos**.
- Filtro em botões (`ToggleGroup single`): `2 dias`, `7 dias`, `15 dias`, `30 dias`, `Personalizado`.
- "Personalizado" → `Popover` com `Calendar mode="range"` (mesmo padrão do `DateRangePicker` usado em Transações).
- Refatorar `useFiscalTasks48h` em `useFiscalUpcomingTasksRange(start, end)` parametrizando `gte/lte` de `fiscal_due_date`. Default = hoje → +2 dias. Limite 10 → 50.

**Pendências por Cliente (`RiskRadarCard`)**
- Clique no cliente navega para o Kanban com filtro do cliente: `navigate('/fiscal/tarefas?view=kanban&contact_id=<id>')`.
- Em `FiscalTasks.tsx`, ler `contact_id` (e `view`) da query string no mount e setar o filtro/visão existente.
- Cabeçalho fixo + rolagem interna (mesmo padrão das tabelas em Transações): wrapper `max-h-[420px] overflow-y-auto`, `<thead>` com `sticky top-0 bg-card z-10`. Remover `slice(0, 10)`.

## 2) Monitor CNPJ (`src/pages/MonitorCNPJ.tsx`)

- Envolver o conteúdo atual em `Tabs` (`@/components/ui/tabs`):
  - **Monitor CNPJ** → conteúdo atual.
  - **Faturamento e Teto SN — 2026** → `<RevenueLimitsSection />` (sem alterações de conteúdo).
- Estado da aba com `useState`, default `"monitor"`.

## 3) Regra de conclusão de tarefa (`TaskDetailModal.tsx`)

Nova regra unificada: **toda conclusão exige justificativa** — anexo OU observação OU número de protocolo.

Fluxo:
1. Ao mudar `status` para "Concluído" (ou clicar "Concluir"):
   - Se já existe `attachment_url` → conclui direto (`completion_type = 'attachment'`, `completed_at = now()`).
   - Se **não** há anexo → abrir `Dialog` de confirmação com dois campos:
     - **Número de protocolo** (opcional)
     - **Observação** (opcional, textarea)
   - Validação: pelo menos **um** dos dois deve estar preenchido (protocolo ≥ 1 caractere OU observação ≥ 10 caracteres). Caso contrário, toast de erro e bloqueia.
   - Salvar:
     - Se só protocolo → `completion_type = 'protocol'`, `protocol_number`, `completion_notes` (se houver).
     - Se só observação → `completion_type = 'transmitted'`, `completion_notes`.
     - Se ambos → `completion_type = 'protocol'`, grava `protocol_number` e `completion_notes`.
   - Em todos os casos: `status='concluido'`, `completed_at = new Date().toISOString()`.
2. O `RadioGroup` atual de 3 tipos é substituído por este modal único — não pedimos mais ao usuário "escolher o tipo"; o sistema infere pelos campos preenchidos.

## 4) FISCAL → Tarefas Fiscais → Modal (`TaskDetailModal.tsx`)

**Layout**
- Corrigir sobreposições no `SheetHeader`: `flex flex-col gap-2`, `Label` sempre acima do campo com `mb-1.5`, `space-y-4` por seção.
- Ampliar para `sm:max-w-2xl`. Seções separadas por `border-t pt-4`.
- Mover badge "Originalmente atribuída a …" para abaixo do header, dentro da seção de Responsável.

**Menções `@` (somente notificar)**
- Textarea de "Notas" detecta `@` na posição do cursor → abre `Popover` ancorado com lista filtrada de `profiles` (props).
- Inserir `@Nome` no texto; armazenar `mentions: [{profile_id, name}]` na nota persistida (estender `TeamNote`).
- Renderizar menções com destaque (`text-primary font-medium`).
- Ao salvar, chamar nova função `notifyTaskMention` em `src/lib/fiscal-notifications.ts` que insere `notifications` `type='task_mention'` para cada mencionado (sem alterar responsável).
- Adicionar `task_mention` em `TYPE_OPTIONS` de `src/pages/FiscalNotifications.tsx`.

## 5) Esclarecimento — sub-rota Notificações (`/fiscal/notificacoes`)

Sem mudança de código além do novo tipo `task_mention`. Como funciona hoje:
- Lê `notifications` filtrando por `company_id` com filtros por tipo, colaborador, período e status (lida/não lida).
- Tipos hoje produzidos automaticamente:
  - `task_completed` — trigger DB `notify_task_completed` + helper `notifyTaskCompleted` (admins/super-admins, exceto quem concluiu).
  - `task_assigned` — `notifyTaskAssigned` (novo responsável).
  - `calendar_generated` — `notifyCalendarLaunched` após `generate_monthly_fiscal_tasks` (contagem por colaborador).
  - `task_due` / `task_overdue` / `transfer_start` / `transfer_end` / `system` — previstos no filtro, sem produtor automático hoje (placeholders).

### Layout final do Dashboard
````text
[ KPIs: Pendente | Em Andamento | Atrasadas | Concluídas ]
[ Próximos Vencimentos  (2d | 7d | 15d | 30d | Personalizado) ]
[ Radar de Risco (clique → /fiscal/tarefas?view=kanban&contact_id=…) ]
````

### Arquivos tocados
- `src/pages/FiscalDashboard.tsx`
- `src/hooks/useFiscalDashboard.ts` (`useFiscalTasks48h` → range; remover `useFiscalTasksPrevMonth`, `useUpcomingFiscalTasks`)
- `src/pages/FiscalTasks.tsx` (deep-link `?contact_id` / `?view=kanban`)
- `src/pages/MonitorCNPJ.tsx` (Tabs + Faturamento)
- `src/components/fiscal/TaskDetailModal.tsx` (layout + nova regra de conclusão + menções)
- `src/lib/fiscal-notifications.ts` (`notifyTaskMention`)
- `src/pages/FiscalNotifications.tsx` (tipo `task_mention`)
