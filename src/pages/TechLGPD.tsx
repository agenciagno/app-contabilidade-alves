import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Pencil, ShieldCheck, ListChecks } from 'lucide-react';

const BASES_LEGAIS: { value: string; label: string }[] = [
  { value: 'contrato', label: 'Execução de contrato' },
  { value: 'obrigacao_legal', label: 'Obrigação legal' },
  { value: 'consentimento', label: 'Consentimento' },
  { value: 'legitimo_interesse', label: 'Legítimo interesse' },
  { value: 'protecao_credito', label: 'Proteção ao crédito' },
  { value: 'exercicio_direitos', label: 'Exercício de direitos' },
];

const baseLegalLabel = (v: string) =>
  BASES_LEGAIS.find((b) => b.value === v)?.label ?? v;

interface TratamentoRow {
  id: string;
  titular_tipo: string;
  titular_id: string;
  finalidade: string;
  base_legal: string;
  versao_termo: string | null;
  evidencia_url: string | null;
  consentimento_em: string | null;
  created_at: string;
}

interface LogRow {
  id: string;
  created_at: string;
  usuario_id: string;
  recurso: string;
  recurso_id: string | null;
  titular_tipo: string | null;
  titular_id: string | null;
  acao: string;
}

export default function TechLGPD() {
  const { isSuperAdmin, isAdmin, isLoading: roleLoading } = useUserRole();
  const canManage = isSuperAdmin || isAdmin;

  if (!roleLoading && !canManage) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-xl">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conformidade LGPD</h1>
          <p className="text-sm text-muted-foreground">
            Registros de tratamento e log de acessos a dados pessoais
          </p>
        </div>
      </div>

      <Tabs defaultValue="tratamentos" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-lg">
          <TabsTrigger value="tratamentos" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Registros de Tratamento
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Log de Acessos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tratamentos" className="mt-6">
          <TratamentosTab canEdit={canManage} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
   Tab A — Registros de Tratamento
   ============================================================ */

function TratamentosTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [baseFilter, setBaseFilter] = useState<string>('all');
  const [editing, setEditing] = useState<TratamentoRow | null>(null);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['lgpd-tratamentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lgpd_tratamentos')
        .select('id, titular_tipo, titular_id, finalidade, base_legal, versao_termo, evidencia_url, consentimento_em, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TratamentoRow[];
    },
  });

  const contactIds = useMemo(
    () => Array.from(new Set((rows ?? []).filter((r) => r.titular_tipo === 'contato').map((r) => r.titular_id))),
    [rows]
  );

  const { data: nameMap } = useQuery({
    queryKey: ['lgpd-contact-names', contactIds],
    queryFn: async () => {
      if (contactIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((c: any) => (map[c.id] = c.name));
      return map;
    },
    enabled: contactIds.length > 0,
  });

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (baseFilter !== 'all') list = list.filter((r) => r.base_legal === baseFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((r) => {
        const nm = r.titular_tipo === 'contato' ? (nameMap?.[r.titular_id] ?? '') : '';
        return (
          nm.toLowerCase().includes(s) ||
          r.finalidade.toLowerCase().includes(s) ||
          r.titular_id.toLowerCase().includes(s)
        );
      });
    }
    return list;
  }, [rows, baseFilter, search, nameMap]);

  useEffect(() => {
    if (error) toast.error('Erro ao carregar registros de tratamento');
  }, [error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registros de Tratamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Buscar por nome, finalidade ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-sm"
          />
          <Select value={baseFilter} onValueChange={setBaseFilter}>
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="Base legal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as bases legais</SelectItem>
              {BASES_LEGAIS.map((b) => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            Nenhum registro de tratamento encontrado.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titular</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>Base legal</TableHead>
                  <TableHead>Versão do termo</TableHead>
                  <TableHead>Consentimento em</TableHead>
                  <TableHead>Registrado em</TableHead>
                  {canEdit && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const nome = r.titular_tipo === 'contato' ? (nameMap?.[r.titular_id] ?? '—') : '—';
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{nome}</TableCell>
                      <TableCell><Badge variant="outline">{r.titular_tipo}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate" title={r.finalidade}>{r.finalidade}</TableCell>
                      <TableCell><Badge variant="secondary">{baseLegalLabel(r.base_legal)}</Badge></TableCell>
                      <TableCell>{r.versao_termo ?? '—'}</TableCell>
                      <TableCell>
                        {r.consentimento_em ? format(new Date(r.consentimento_em), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(r.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editing && (
        <EditTratamentoDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['lgpd-tratamentos'] });
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function EditTratamentoDialog({
  row,
  onClose,
  onSaved,
}: {
  row: TratamentoRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [finalidade, setFinalidade] = useState(row.finalidade);
  const [baseLegal, setBaseLegal] = useState(row.base_legal);
  const [versao, setVersao] = useState(row.versao_termo ?? '');
  const [evidencia, setEvidencia] = useState(row.evidencia_url ?? '');
  const [consentimento, setConsentimento] = useState(
    row.consentimento_em ? row.consentimento_em.substring(0, 10) : ''
  );
  const [saving, setSaving] = useState(false);

  const isConsent = baseLegal === 'consentimento';

  const save = async () => {
    if (!finalidade.trim()) {
      toast.error('Finalidade é obrigatória');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('lgpd_tratamentos')
      .update({
        finalidade: finalidade.trim(),
        base_legal: baseLegal,
        versao_termo: versao.trim() || null,
        evidencia_url: evidencia.trim() || null,
        consentimento_em: isConsent && consentimento ? consentimento : null,
      })
      .eq('id', row.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Erro ao salvar');
      return;
    }
    toast.success('Registro atualizado');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar registro de tratamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Finalidade</label>
            <Textarea value={finalidade} onChange={(e) => setFinalidade(e.target.value)} rows={3} />
          </div>
          <div>
            <label className="text-sm font-medium">Base legal</label>
            <Select value={baseLegal} onValueChange={setBaseLegal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BASES_LEGAIS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Versão do termo</label>
            <Input value={versao} onChange={(e) => setVersao(e.target.value)} placeholder="Ex: v1.0" />
          </div>
          <div>
            <label className="text-sm font-medium">URL da evidência</label>
            <Input value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className="text-sm font-medium">Data do consentimento</label>
            <Input
              type="date"
              value={consentimento}
              onChange={(e) => setConsentimento(e.target.value)}
              disabled={!isConsent}
            />
            {!isConsent && (
              <p className="text-xs text-muted-foreground mt-1">
                Habilitado apenas quando a base legal é "Consentimento".
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Tab B — Log de Acessos
   ============================================================ */

function LogsTab() {
  const [acao, setAcao] = useState<string>('all');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['lgpd-logs', acao, from, to],
    queryFn: async () => {
      let q = supabase
        .from('data_access_log')
        .select('id, created_at, usuario_id, recurso, recurso_id, titular_tipo, titular_id, acao')
        .order('created_at', { ascending: false })
        .limit(100);
      if (acao !== 'all') q = q.eq('acao', acao);
      if (from) q = q.gte('created_at', `${from}T00:00:00`);
      if (to) q = q.lte('created_at', `${to}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const userIds = useMemo(() => Array.from(new Set((logs ?? []).map((l) => l.usuario_id))), [logs]);
  const contactIds = useMemo(
    () => Array.from(new Set((logs ?? []).filter((l) => l.titular_tipo === 'contato' && l.titular_id).map((l) => l.titular_id!))),
    [logs]
  );

  const { data: userMap } = useQuery({
    queryKey: ['lgpd-users', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => (map[p.user_id] = p.full_name || p.email || p.user_id));
      return map;
    },
    enabled: userIds.length > 0,
  });

  const { data: contactMap } = useQuery({
    queryKey: ['lgpd-log-contacts', contactIds],
    queryFn: async () => {
      if (contactIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((c: any) => (map[c.id] = c.name));
      return map;
    },
    enabled: contactIds.length > 0,
  });

  useEffect(() => {
    if (error) toast.error('Erro ao carregar log de acessos');
  }, [error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log de Acessos (últimos 100)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={acao} onValueChange={setAcao}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              <SelectItem value="view">Visualização</SelectItem>
              <SelectItem value="download">Download</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (logs?.length ?? 0) === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            Nenhum acesso registrado no período.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Recurso</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>ID recurso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs!.map((l) => {
                  const titular =
                    l.titular_tipo === 'contato' && l.titular_id
                      ? (contactMap?.[l.titular_id] ?? l.titular_id)
                      : (l.titular_id ?? '—');
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                      </TableCell>
                      <TableCell>{userMap?.[l.usuario_id] ?? l.usuario_id}</TableCell>
                      <TableCell><Badge variant={l.acao === 'download' ? 'default' : 'secondary'}>{l.acao}</Badge></TableCell>
                      <TableCell>{l.recurso}</TableCell>
                      <TableCell>{titular}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{l.recurso_id ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
