import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, Loader2, ExternalLink, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import {
  useAiAgentConfig, type AiAgentConfigInput,
} from '@/hooks/useAiAgentConfig';
import {
  useAiAgentRoutingRules, SETORES, COLUNAS_RESPONSAVEL, type AiAgentRoutingRule, type AiAgentRoutingRuleInput,
} from '@/hooks/useAiAgentRoutingRules';
import {
  useAiAgentExceptions, type AiAgentException, type AiAgentExceptionInput,
} from '@/hooks/useAiAgentExceptions';
import { useAiAgentLogs } from '@/hooks/useAiAgentLogs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Chatwoot roda numa única conta para a CA (chat.contabilidadealves.com.br, account id 1).
const CHATWOOT_ACCOUNT_ID = 1;
const chatwootConversationUrl = (conversationId: number) =>
  `https://chat.contabilidadealves.com.br/app/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}`;

const DIAS_SEMANA_OPCOES = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

const statusLabel = (s: string) => ({
  atribuido: 'Atribuído',
  ia_pausada: 'IA pausada',
  stop_keyword: 'Stop keyword',
  fora_horario: 'Fora do horário',
  feriado: 'Feriado',
  excecao: 'Exceção',
}[s] ?? s);

export default function TechAgenteIA() {
  const { isSuperAdmin, isAdmin, isLoading: roleLoading } = useUserRole();
  const canManage = isSuperAdmin || isAdmin;

  if (!roleLoading && !canManage) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-xl">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agente de Pré-Atendimento</h1>
          <p className="text-sm text-muted-foreground">
            Saudação, identificação de setor e transferência automática no WhatsApp (Chatwoot)
          </p>
        </div>
      </div>

      <Tabs defaultValue="status">
        <TabsList>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="roteamento">Roteamento</TabsTrigger>
          <TabsTrigger value="excecoes">Exceções</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="status" className="mt-4">
          <AbaStatus />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <AbaConfiguracao />
        </TabsContent>
        <TabsContent value="roteamento" className="mt-4">
          <AbaRoteamento />
        </TabsContent>
        <TabsContent value="excecoes" className="mt-4">
          <AbaExcecoes />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <AbaLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────── Status ───────────────────────────────

function AbaStatus() {
  const { config, isLoading, update } = useAiAgentConfig();
  const { logs, isLoading: logsLoading } = useAiAgentLogs(0, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">
              {config?.is_active ? 'Agente ativo' : 'Agente inativo'}
            </div>
            <p className="text-sm text-muted-foreground">
              Quando ativo, responde automaticamente as conversas do WhatsApp e transfere para o setor certo.
            </p>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <Switch
              checked={!!config?.is_active}
              onCheckedChange={(v) => update.mutate({ is_active: v })}
              disabled={update.isPending}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Última atividade</CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma atividade registrada ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell>{l.telefone ?? '—'}</TableCell>
                      <TableCell>{l.setor_identificado ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{statusLabel(l.status)}</Badge></TableCell>
                      <TableCell>
                        {l.chatwoot_conversation_id && (
                          <a
                            href={chatwootConversationUrl(l.chatwoot_conversation_id)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title="Abrir conversa no Chatwoot"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────── Configuração ───────────────────────────────

function AbaConfiguracao() {
  const { config, isLoading, update } = useAiAgentConfig();
  const [form, setForm] = useState<AiAgentConfigInput>({});

  useEffect(() => {
    if (config) {
      setForm({
        tom_de_voz: config.tom_de_voz,
        diretrizes: config.diretrizes,
        mensagem_saudacao: config.mensagem_saudacao,
        mensagem_handoff_template: config.mensagem_handoff_template,
        horario_inicio: config.horario_inicio,
        horario_fim: config.horario_fim,
        dias_semana: config.dias_semana,
        mensagem_fora_horario: config.mensagem_fora_horario,
        mensagem_feriado: config.mensagem_feriado,
        stop_keyword: config.stop_keyword,
      });
    }
  }, [config]);

  const toggleDia = (dia: number, checked: boolean) => {
    setForm((prev) => {
      const atual = prev.dias_semana ?? [];
      return { ...prev, dias_semana: checked ? [...atual, dia].sort() : atual.filter((d) => d !== dia) };
    });
  };

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Tom de voz</Label>
            <Input
              value={form.tom_de_voz ?? ''}
              onChange={(e) => setForm({ ...form, tom_de_voz: e.target.value })}
              placeholder="Ex.: Cordial, direto e profissional"
            />
          </div>
          <div className="space-y-2">
            <Label>Palavra de stop</Label>
            <Input
              value={form.stop_keyword ?? ''}
              onChange={(e) => setForm({ ...form, stop_keyword: e.target.value })}
              placeholder="Ex.: atendente"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Diretrizes</Label>
          <Textarea
            rows={4}
            value={form.diretrizes ?? ''}
            onChange={(e) => setForm({ ...form, diretrizes: e.target.value })}
            placeholder="Regras que o agente deve seguir ao conversar e classificar o assunto"
          />
        </div>

        <div className="space-y-2">
          <Label>Mensagem de saudação</Label>
          <Textarea
            rows={2}
            value={form.mensagem_saudacao ?? ''}
            onChange={(e) => setForm({ ...form, mensagem_saudacao: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Template de handoff</Label>
          <Textarea
            rows={2}
            value={form.mensagem_handoff_template ?? ''}
            onChange={(e) => setForm({ ...form, mensagem_handoff_template: e.target.value })}
            placeholder="Use {{responsavel}} e {{setor}} como variáveis"
          />
          <p className="text-xs text-muted-foreground">A IA usa este texto como base para gerar a mensagem final.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Horário início</Label>
            <Input
              type="time"
              value={(form.horario_inicio ?? '08:00:00').slice(0, 5)}
              onChange={(e) => setForm({ ...form, horario_inicio: e.target.value + ':00' })}
            />
          </div>
          <div className="space-y-2">
            <Label>Horário fim</Label>
            <Input
              type="time"
              value={(form.horario_fim ?? '18:00:00').slice(0, 5)}
              onChange={(e) => setForm({ ...form, horario_fim: e.target.value + ':00' })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Dias de atendimento</Label>
          <div className="flex flex-wrap gap-4">
            {DIAS_SEMANA_OPCOES.map((d) => (
              <label key={d.value} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={(form.dias_semana ?? []).includes(d.value)}
                  onCheckedChange={(v) => toggleDia(d.value, v === true)}
                />
                <span className="text-sm">{d.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Mensagem fora do horário</Label>
          <Textarea
            rows={2}
            value={form.mensagem_fora_horario ?? ''}
            onChange={(e) => setForm({ ...form, mensagem_fora_horario: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensagem de feriado</Label>
          <Textarea
            rows={2}
            value={form.mensagem_feriado ?? ''}
            onChange={(e) => setForm({ ...form, mensagem_feriado: e.target.value })}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => update.mutate(form)} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar configuração
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────── Roteamento ───────────────────────────────

const emptyRule: AiAgentRoutingRuleInput = {
  setor: 'fiscal',
  palavras_chave: [],
  usa_responsavel_cliente: false,
  coluna_responsavel: null,
  chatwoot_team_id: null,
  chatwoot_agent_id: null,
  prioridade: 0,
  ativo: true,
};

function AbaRoteamento() {
  const { rules, isLoading, create, update, remove } = useAiAgentRoutingRules();
  const [editing, setEditing] = useState<AiAgentRoutingRule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiAgentRoutingRule | null>(null);
  const [form, setForm] = useState<AiAgentRoutingRuleInput>(emptyRule);
  const [keywordsText, setKeywordsText] = useState('');

  const openNew = () => {
    setEditing(null);
    setForm(emptyRule);
    setKeywordsText('');
    setDialogOpen(true);
  };

  const openEdit = (rule: AiAgentRoutingRule) => {
    setEditing(rule);
    setForm({
      setor: rule.setor,
      palavras_chave: rule.palavras_chave,
      usa_responsavel_cliente: rule.usa_responsavel_cliente,
      coluna_responsavel: rule.coluna_responsavel,
      chatwoot_team_id: rule.chatwoot_team_id,
      chatwoot_agent_id: rule.chatwoot_agent_id,
      prioridade: rule.prioridade,
      ativo: rule.ativo,
    });
    setKeywordsText(rule.palavras_chave.join(', '));
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload: AiAgentRoutingRuleInput = {
      ...form,
      palavras_chave: keywordsText.split(',').map((k) => k.trim()).filter(Boolean),
    };
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: () => setDialogOpen(false) });
    } else {
      create.mutate(payload, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Regras de roteamento</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova regra</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rules.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma regra cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead>Palavras-chave</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Prioridade</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {SETORES.find((s) => s.value === r.setor)?.label ?? r.setor}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                      {r.palavras_chave.join(', ') || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.usa_responsavel_cliente
                        ? (COLUNAS_RESPONSAVEL.find((c) => c.value === r.coluna_responsavel)?.label ?? 'Cliente')
                        : (r.chatwoot_team_id ? `Time ${r.chatwoot_team_id}` : r.chatwoot_agent_id ? `Agente ${r.chatwoot_agent_id}` : '—')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.prioridade}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.ativo}
                        onCheckedChange={(v) => update.mutate({ id: r.id, ativo: v } as any)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar regra' : 'Nova regra de roteamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Setor</Label>
              <Select value={form.setor} onValueChange={(v) => setForm({ ...form, setor: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SETORES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Textarea rows={2} value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch
                checked={form.usa_responsavel_cliente}
                onCheckedChange={(v) => setForm({ ...form, usa_responsavel_cliente: v })}
              />
              <span className="text-sm">Usa o responsável cadastrado no cliente</span>
            </label>
            {form.usa_responsavel_cliente ? (
              <div className="space-y-2">
                <Label>Coluna de responsável (em Contatos)</Label>
                <Select
                  value={form.coluna_responsavel ?? ''}
                  onValueChange={(v) => setForm({ ...form, coluna_responsavel: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {COLUNAS_RESPONSAVEL.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Team ID fixo (Chatwoot)</Label>
                  <Input
                    type="number"
                    value={form.chatwoot_team_id ?? ''}
                    onChange={(e) => setForm({ ...form, chatwoot_team_id: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Agente ID fixo (Chatwoot)</Label>
                  <Input
                    type="number"
                    value={form.chatwoot_agent_id ?? ''}
                    onChange={(e) => setForm({ ...form, chatwoot_agent_id: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={form.prioridade}
                  onChange={(e) => setForm({ ...form, prioridade: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                  <span className="text-sm">Ativa</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover regra?</AlertDialogTitle>
            <AlertDialogDescription>
              A regra do setor "{deleteTarget?.setor}" será removida. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) remove.mutate(deleteTarget.id); setDeleteTarget(null); }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─────────────────────────────── Exceções ───────────────────────────────

const emptyException: AiAgentExceptionInput = {
  data: new Date().toISOString().slice(0, 10),
  motivo: '',
  mensagem_custom: '',
  hora_inicio: null,
  hora_fim: null,
  ativo: true,
};

const formatJanela = (inicio: string | null, fim: string | null) => {
  if (!inicio && !fim) return 'Dia inteiro';
  return `${(inicio ?? '00:00').slice(0, 5)}–${(fim ?? '23:59').slice(0, 5)}`;
};

function AbaExcecoes() {
  const { exceptions, isLoading, create, update, remove } = useAiAgentExceptions();
  const [editing, setEditing] = useState<AiAgentException | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiAgentException | null>(null);
  const [form, setForm] = useState<AiAgentExceptionInput>(emptyException);

  const openNew = () => { setEditing(null); setForm(emptyException); setDialogOpen(true); };
  const openEdit = (exc: AiAgentException) => {
    setEditing(exc);
    setForm({
      data: exc.data,
      motivo: exc.motivo ?? '',
      mensagem_custom: exc.mensagem_custom ?? '',
      hora_inicio: exc.hora_inicio,
      hora_fim: exc.hora_fim,
      ativo: exc.ativo,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editing) {
      update.mutate({ id: editing.id, ...form }, { onSuccess: () => setDialogOpen(false) });
    } else {
      create.mutate(form, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Exceções (dias sem atendimento automático)</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova exceção</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : exceptions.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Nenhuma exceção cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Janela</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((exc) => (
                  <TableRow key={exc.id}>
                    <TableCell className="tabular-nums">{exc.data}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatJanela(exc.hora_inicio, exc.hora_fim)}</TableCell>
                    <TableCell>{exc.motivo || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">{exc.mensagem_custom || '—'}</TableCell>
                    <TableCell>
                      <Switch checked={exc.ativo} onCheckedChange={(v) => update.mutate({ id: exc.id, ativo: v } as any)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(exc)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(exc)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar exceção' : 'Nova exceção'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início da janela (opcional)</Label>
                <Input
                  type="time"
                  value={form.hora_inicio ? form.hora_inicio.slice(0, 5) : ''}
                  onChange={(e) => setForm({ ...form, hora_inicio: e.target.value ? e.target.value + ':00' : null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim da janela (opcional)</Label>
                <Input
                  type="time"
                  value={form.hora_fim ? form.hora_fim.slice(0, 5) : ''}
                  onChange={(e) => setForm({ ...form, hora_fim: e.target.value ? e.target.value + ':00' : null })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Deixe os dois vazios para valer o dia inteiro. Preencha só a parte do dia em que o atendimento fica indisponível (ex.: 13:00–18:00 pra um treinamento à tarde).</p>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input value={form.motivo ?? ''} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ex.: Confraternização da equipe" />
            </div>
            <div className="space-y-2">
              <Label>Mensagem personalizada (opcional)</Label>
              <Textarea rows={2} value={form.mensagem_custom ?? ''} onChange={(e) => setForm({ ...form, mensagem_custom: e.target.value })} placeholder="Se vazio, usa a mensagem de feriado padrão" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <span className="text-sm">Ativa</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover exceção?</AlertDialogTitle>
            <AlertDialogDescription>
              A exceção de {deleteTarget?.data} será removida. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) remove.mutate(deleteTarget.id); setDeleteTarget(null); }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─────────────────────────────── Log ───────────────────────────────

function AbaLog() {
  const [page, setPage] = useState(0);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [setor, setSetor] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const filters = useMemo(() => ({
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    setor: setor || undefined,
    status: status || undefined,
  }), [dataInicio, dataFim, setor, status]);

  useEffect(() => { setPage(0); }, [filters]);

  const { logs, total, pageSize, isLoading } = useAiAgentLogs(page, filters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const STATUSES = ['atribuido', 'ia_pausada', 'stop_keyword', 'fora_horario', 'feriado', 'excecao'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log de atendimentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-[160px]" placeholder="De" />
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-[160px]" placeholder="Até" />
          <Select value={setor || 'all'} onValueChange={(v) => setSetor(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Setor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {SETORES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Nenhum registro encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>{l.telefone ?? '—'}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm">{l.mensagem_recebida ?? '—'}</TableCell>
                    <TableCell>{l.setor_identificado ?? '—'}</TableCell>
                    <TableCell>{l.coverage_aplicada ? <Badge variant="outline">Sim</Badge> : '—'}</TableCell>
                    <TableCell><Badge variant="outline">{statusLabel(l.status)}</Badge></TableCell>
                    <TableCell>
                      {l.chatwoot_conversation_id && (
                        <a
                          href={chatwootConversationUrl(l.chatwoot_conversation_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            {total} registro{total === 1 ? '' : 's'} — página {page + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
