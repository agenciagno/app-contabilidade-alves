import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Database, Download, Upload, Loader2, FileJson, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

const BACKUP_TABLES = [
  'categories',
  'contacts',
  'banks',
  'transactions',
  'recurring_transactions',
  'contact_partners',
  'contact_notes',
  'contact_documents',
  'contact_messages',
  'contact_logs',
  'boleto_controls',
  'transaction_attachments',
  'global_logs',
  'dre_budgets',
  'fiscal_tasks',
] as const;

type TableName = typeof BACKUP_TABLES[number];

// Order matters for upsert (FK dependencies)
const RESTORE_ORDER: TableName[] = [
  'categories',
  'contacts',
  'banks',
  'recurring_transactions',
  'transactions',
  'contact_partners',
  'contact_notes',
  'contact_documents',
  'contact_messages',
  'contact_logs',
  'boleto_controls',
  'transaction_attachments',
  'global_logs',
  'dre_budgets',
  'fiscal_tasks',
];

async function fetchAllRows(table: string, extraFilter?: (q: any) => any) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let query = (supabase.from as any)(table).select('*').range(from, from + PAGE - 1);
    if (extraFilter) query = extraFilter(query);
    const { data, error } = await query;
    if (error) throw new Error(`Erro ao buscar ${table}: ${error.message}`);
    if (!data || data.length === 0) { hasMore = false; break; }
    all = all.concat(data);
    if (data.length < PAGE) hasMore = false;
    else from += PAGE;
  }
  return all;
}

interface BackupPayload {
  version: number;
  exported_at: string;
  tables: Record<string, any[]>;
}

function validateBackup(obj: any): obj is BackupPayload {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.version !== 'number' || !obj.tables || typeof obj.tables !== 'object') return false;
  for (const key of Object.keys(obj.tables)) {
    if (!Array.isArray(obj.tables[key])) return false;
  }
  return true;
}

// ── Hard Reset types ──
interface CleanupModule {
  key: string;
  label: string;
  description: string;
}

const CLEANUP_MODULES: CleanupModule[] = [
  { key: 'transactions', label: 'Transações', description: 'Transações, anexos, recorrências e logs globais' },
  { key: 'clients', label: 'Clientes', description: 'Clientes, sócios, notas, documentos, mensagens e logs' },
  { key: 'boletos', label: 'Boletos', description: 'Controles de boletos' },
  { key: 'categories', label: 'Eventos Contábeis', description: 'Categorias de receita e despesa' },
  { key: 'banks', label: 'Conta Corrente / Bancos', description: 'Todas as contas bancárias' },
];

async function deleteAll(table: string) {
  const { error } = await (supabase.from as any)(table)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw new Error(`Erro ao apagar ${table}: ${error.message}`);
}

export default function BackupTab() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStep, setRestoreStep] = useState('');
  const [pendingFile, setPendingFile] = useState<BackupPayload | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Hard Reset state
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>(
    Object.fromEntries(CLEANUP_MODULES.map(m => [m.key, true]))
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetProgress, setResetProgress] = useState(0);
  const [resetStep, setResetStep] = useState('');

  // ── EXPORT ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const tables: Record<string, any[]> = {};
      for (const table of BACKUP_TABLES) {
        const extra = table === 'transactions'
          ? (q: any) => q.is('deleted_at', null)
          : undefined;
        tables[table] = await fetchAllRows(table, extra);
      }
      const payload: BackupPayload = {
        version: 1,
        exported_at: new Date().toISOString(),
        tables,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_contabilidade_${format(new Date(), 'yyyy-MM-dd')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalRows = Object.values(tables).reduce((s, arr) => s + arr.length, 0);
      toast.success(`Backup exportado com sucesso! (${totalRows.toLocaleString('pt-BR')} registros)`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao exportar backup');
    } finally {
      setExporting(false);
    }
  };

  // ── FILE HANDLING ──
  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.json')) {
      toast.error('Selecione um arquivo .json válido');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (!validateBackup(parsed)) {
          toast.error('Estrutura do arquivo inválida. Esperado: { version, tables }');
          return;
        }
        setPendingFile(parsed);
        setShowConfirm(true);
      } catch {
        toast.error('Erro ao ler o arquivo JSON');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  // ── RESTORE ──
  const handleRestore = async () => {
    if (!pendingFile) return;
    setShowConfirm(false);
    setRestoring(true);
    setRestoreProgress(0);

    const totalSteps = RESTORE_ORDER.filter(t => pendingFile.tables[t]?.length).length;
    let done = 0;

    try {
      for (const table of RESTORE_ORDER) {
        const rows = pendingFile.tables[table];
        if (!rows || rows.length === 0) continue;

        setRestoreStep(`Restaurando ${table} (${rows.length} registros)...`);

        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const { error } = await (supabase.from as any)(table).upsert(batch, { onConflict: 'id' });
          if (error) throw new Error(`Erro em ${table}: ${error.message}`);
        }

        done++;
        setRestoreProgress(Math.round((done / totalSteps) * 100));
      }

      toast.success('Restauração concluída! Recarregando o sistema...');
      queryClient.invalidateQueries();
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      toast.error(err.message || 'Erro durante a restauração');
      setRestoring(false);
      setRestoreProgress(0);
      setRestoreStep('');
    } finally {
      setPendingFile(null);
    }
  };

  // ── HARD RESET ──
  const handleHardReset = async () => {
    setShowResetConfirm(false);
    setResetConfirmText('');
    setResetting(true);
    setResetProgress(0);

    // Build ordered delete steps based on selected modules
    const steps: { table: string; label: string }[] = [];

    if (selectedModules.transactions) {
      steps.push({ table: 'transaction_attachments', label: 'Anexos de transações' });
    }
    if (selectedModules.clients) {
      steps.push({ table: 'contact_documents', label: 'Documentos de clientes' });
      steps.push({ table: 'contact_partners', label: 'Sócios de clientes' });
      steps.push({ table: 'contact_notes', label: 'Notas de clientes' });
      steps.push({ table: 'contact_messages', label: 'Mensagens de clientes' });
      steps.push({ table: 'contact_logs', label: 'Logs de clientes' });
    }
    if (selectedModules.boletos) {
      steps.push({ table: 'boleto_controls', label: 'Controles de boletos' });
    }
    if (selectedModules.transactions) {
      steps.push({ table: 'global_logs', label: 'Logs globais' });
      steps.push({ table: 'transactions', label: 'Transações' });
    }
    if (selectedModules.clients) {
      steps.push({ table: 'contacts', label: 'Clientes' });
    }
    if (selectedModules.categories) {
      steps.push({ table: 'categories', label: 'Eventos contábeis' });
    }
    if (selectedModules.transactions) {
      steps.push({ table: 'recurring_transactions', label: 'Transações recorrentes' });
    }
    if (selectedModules.banks) {
      steps.push({ table: 'banks', label: 'Contas bancárias' });
    }

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setResetStep(`Apagando ${step.label}...`);
        await deleteAll(step.table);
        setResetProgress(Math.round(((i + 1) / steps.length) * 100));
      }

      // Log audit entry after all deletes
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('company_id, full_name, username')
            .eq('user_id', userData.user.id)
            .single();

          if (profile) {
            const modulesDeleted = CLEANUP_MODULES
              .filter(m => selectedModules[m.key])
              .map(m => m.label)
              .join(', ');

            await supabase.from('global_logs').insert({
              company_id: profile.company_id,
              user_id: userData.user.id,
              user_name: profile.full_name || profile.username || 'Usuário',
              action: 'HARD_RESET',
              module: 'configuracoes',
              details: `Limpeza de dados executada. Módulos apagados: ${modulesDeleted}`,
            });
          }
        }
      } catch (logErr) {
        console.error('Erro ao registrar log de auditoria:', logErr);
      }

      toast.success('Limpeza concluída com sucesso! Recarregando...');
      queryClient.invalidateQueries();
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      toast.error(err.message || 'Erro durante a limpeza');
      setResetting(false);
      setResetProgress(0);
      setResetStep('');
    }
  };

  const anyModuleSelected = Object.values(selectedModules).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Export Card */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Exportar Backup</CardTitle>
              <CardDescription>Baixe todos os dados do sistema em formato JSON</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            O backup inclui: transações, clientes, categorias, bancos, recorrências, sócios, anotações, documentos, mensagens, logs de clientes, boletos, anexos, logs globais, orçamentos DRE e tarefas fiscais.
          </p>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {exporting ? 'Exportando...' : 'Exportar Backup (JSON)'}
          </Button>
        </CardContent>
      </Card>

      {/* Restore Card */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Upload className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <CardTitle>Restaurar Backup</CardTitle>
              <CardDescription>Importe um arquivo JSON de backup para restaurar os dados</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              A restauração pode sobrescrever dados existentes. Registros com o mesmo ID serão atualizados; registros ausentes serão recriados.
            </p>
          </div>

          {restoring ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{restoreStep}</span>
              </div>
              <Progress value={restoreProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{restoreProgress}%</p>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'}
              `}
            >
              <FileJson className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Arraste um arquivo .json aqui</p>
              <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hard Reset Card */}
      <Card className="bg-card border-destructive/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Limpeza de Sistema / Reset</CardTitle>
              <CardDescription>Apague dados selecionados permanentemente. Esta ação é irreversível.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">
              <strong>Atenção:</strong> Os dados apagados não podem ser recuperados. Faça um backup antes de prosseguir.
            </p>
          </div>

          {resetting ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{resetStep}</span>
              </div>
              <Progress value={resetProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{resetProgress}%</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {CLEANUP_MODULES.map((mod) => (
                  <label key={mod.key} className="flex items-start gap-3 cursor-pointer group">
                    <Checkbox
                      checked={selectedModules[mod.key]}
                      onCheckedChange={(checked) =>
                        setSelectedModules(prev => ({ ...prev, [mod.key]: !!checked }))
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {mod.label}
                      </span>
                      <p className="text-xs text-muted-foreground">{mod.description}</p>
                    </div>
                  </label>
                ))}
              </div>

              <Button
                variant="destructive"
                onClick={() => setShowResetConfirm(true)}
                disabled={!anyModuleSelected}
                className="mt-2"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Apagar Dados Selecionados
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirmar Restauração
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Atenção:</strong> A restauração pode sobrescrever dados atuais. Deseja continuar?
              {pendingFile && (
                <span className="block mt-2 text-xs">
                  Arquivo exportado em: {format(new Date(pendingFile.exported_at), 'dd/MM/yyyy HH:mm')}
                  {' · '}
                  {Object.entries(pendingFile.tables)
                    .filter(([, v]) => v.length > 0)
                    .map(([k, v]) => `${k}: ${v.length}`)
                    .join(', ')}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} className="bg-amber-600 hover:bg-amber-700 text-white">
              Sim, Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hard Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={(open) => {
        setShowResetConfirm(open);
        if (!open) setResetConfirmText('');
      }}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Exclusão Definitiva de Dados
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm">
                  <strong className="text-destructive">Esta operação é irreversível.</strong> Todos os dados dos módulos selecionados serão permanentemente apagados do banco de dados.
                </p>

                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-xs font-medium text-foreground">Módulos selecionados para exclusão:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {CLEANUP_MODULES.filter(m => selectedModules[m.key]).map(m => (
                      <li key={m.key}>• {m.label} — {m.description}</li>
                    ))}
                  </ul>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={exporting}
                  className="w-full border-primary text-primary hover:bg-primary/10"
                >
                  {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Baixar Backup Antes de Apagar
                </Button>

                <div className="space-y-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Digite <strong className="text-foreground">CONFIRMAR</strong> para desbloquear a exclusão:
                  </p>
                  <Input
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Digite CONFIRMAR"
                    className="text-center font-mono tracking-widest"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={resetConfirmText !== 'CONFIRMAR'}
              onClick={handleHardReset}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Executar Exclusão Definitiva
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
