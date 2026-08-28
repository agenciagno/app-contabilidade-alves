import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Bell, Copy, Download, Eye, Loader2, MoreHorizontal, Pencil, Plus, RotateCw, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader, StatCardRow, DsBadge, SearchField, segmentedListClass, segmentedTriggerClass } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { abrirDocumentoViaEdge } from '@/lib/documento-baixar';
import {
  CertificateRow, diasParaVencer, statusVisual, titularDocumento, titularLabel,
  useCertificates, useExcluirCertificado, useRevelarSenhaCertificado,
} from '@/hooks/useCertificates';
import { CertificateFormDialog } from '@/components/certificates/CertificateFormDialog';
import { RenovarCertificadoDialog } from '@/components/certificates/RenovarCertificadoDialog';
import { NotificarClienteDialog } from '@/components/certificates/NotificarClienteDialog';

type FiltroTipo = 'todos' | 'PJ' | 'PF';
type FiltroModelo = 'todos' | 'A1' | 'A3';

export default function CadastroCertificados() {
  const { data: certificates = [], isLoading } = useCertificates();
  const excluir = useExcluirCertificado();
  const revelar = useRevelarSenhaCertificado();

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [filtroModelo, setFiltroModelo] = useState<FiltroModelo>('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroVencimento, setFiltroVencimento] = useState('todos');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CertificateRow | null>(null);
  const [renovando, setRenovando] = useState<CertificateRow | null>(null);
  const [notificando, setNotificando] = useState<CertificateRow | null>(null);
  const [excluindo, setExcluindo] = useState<CertificateRow | null>(null);
  const [revelado, setRevelado] = useState<{ cert: CertificateRow; senha: string | null } | null>(null);
  const [revelandoId, setRevelandoId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = certificates.length;
    const vencidos = certificates.filter((c) => diasParaVencer(c.data_validade) < 0).length;
    const vencendo30 = certificates.filter((c) => {
      const d = diasParaVencer(c.data_validade);
      return d >= 0 && d <= 30;
    }).length;
    const ativos = total - vencidos - vencendo30;
    return { total, vencidos, vencendo30, ativos };
  }, [certificates]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return certificates
      .filter((c) => filtroTipo === 'todos' || c.tipo_pessoa === filtroTipo)
      .filter((c) => filtroModelo === 'todos' || c.modelo === filtroModelo)
      .filter((c) => {
        if (filtroStatus === 'todos') return true;
        return statusVisual(c).estado === filtroStatus;
      })
      .filter((c) => {
        if (filtroVencimento === 'todos') return true;
        return diasParaVencer(c.data_validade) <= Number(filtroVencimento);
      })
      .filter((c) => !q || titularLabel(c).toLowerCase().includes(q))
      .sort((a, b) => diasParaVencer(a.data_validade) - diasParaVencer(b.data_validade));
  }, [certificates, busca, filtroTipo, filtroModelo, filtroStatus, filtroVencimento]);

  const handleNovo = () => { setEditing(null); setFormOpen(true); };
  const handleEditar = (c: CertificateRow) => { setEditing(c); setFormOpen(true); };

  const handleRevelar = async (c: CertificateRow) => {
    setRevelandoId(c.id);
    try {
      const senha = await revelar.mutateAsync({ certificate_id: c.id, acao: 'REVELAR' });
      setRevelado({ cert: c, senha });
    } catch {
      toast.error('Sem permissão ou senha não cadastrada.');
    } finally {
      setRevelandoId(null);
    }
  };

  const handleCopiarSenha = async () => {
    if (!revelado) return;
    try {
      const senha = await revelar.mutateAsync({ certificate_id: revelado.cert.id, acao: 'COPIAR' });
      if (!senha) { toast.error('Senha não cadastrada.'); return; }
      await navigator.clipboard.writeText(senha);
      toast.success('Senha copiada.');
    } catch {
      toast.error('Falha ao copiar a senha.');
    }
  };

  const handleBaixar = async (c: CertificateRow) => {
    if (!c.anexo_url) return;
    await abrirDocumentoViaEdge('contact-documents', c.anexo_url);
  };

  const handleExcluir = async () => {
    if (!excluindo) return;
    try {
      await excluir.mutateAsync(excluindo);
      toast.success('Certificado excluído.');
      setExcluindo(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao excluir certificado.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/cadastros · certificados"
        title="Certificados."
        subtitle="Vencimento de certificados digitais (e-CNPJ e e-CPF) dos clientes."
        actions={(
          <Button onClick={handleNovo}>
            <Plus className="mr-1.5 h-4 w-4" /> Cadastrar
          </Button>
        )}
      />

      <StatCardRow
        items={[
          { label: 'Total de certificados', value: stats.total, hint: 'PF + PJ cadastrados' },
          { label: 'Vencidos', value: stats.vencidos, hint: 'renovar com urgência', emphasis: stats.vencidos > 0 ? 'warm' : 'none' },
          { label: 'Vencendo em 30 dias', value: stats.vencendo30, hint: 'notificar clientes' },
          { label: 'Ativos', value: stats.ativos, hint: 'dentro da validade' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField
          placeholder="Buscar por titular..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          wrapperClassName="max-w-[429px] flex-1"
        />
        <Tabs value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as FiltroTipo)}>
          <TabsList className={segmentedListClass}>
            <TabsTrigger value="todos" className={segmentedTriggerClass}>Todos</TabsTrigger>
            <TabsTrigger value="PJ" className={segmentedTriggerClass}>PJ</TabsTrigger>
            <TabsTrigger value="PF" className={segmentedTriggerClass}>PF</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={filtroModelo} onValueChange={(v) => setFiltroModelo(v as FiltroModelo)}>
          <TabsList className={segmentedListClass}>
            <TabsTrigger value="todos" className={segmentedTriggerClass}>Todos</TabsTrigger>
            <TabsTrigger value="A1" className={segmentedTriggerClass}>A1</TabsTrigger>
            <TabsTrigger value="A3" className={segmentedTriggerClass}>A3</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="a_vencer">A vencer</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroVencimento} onValueChange={setFiltroVencimento}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Qualquer prazo</SelectItem>
            <SelectItem value="7">Vence em 7 dias</SelectItem>
            <SelectItem value="15">Vence em 15 dias</SelectItem>
            <SelectItem value="30">Vence em 30 dias</SelectItem>
            <SelectItem value="60">Vence em 60 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum certificado encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titular</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Dias p/ vencer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((c) => {
                const sv = statusVisual(c);
                return (
                  <TableRow key={c.id} className={cn(sv.estado === 'vencido' && 'bg-danger-soft hover:bg-danger-soft')}>
                    <TableCell>
                      <p className="text-ui text-ink">{titularLabel(c)}</p>
                      {titularDocumento(c) && <p className="font-mono text-meta text-muted-ink-2">{titularDocumento(c)}</p>}
                    </TableCell>
                    <TableCell>
                      <DsBadge tone={sv.estado === 'vencido' ? 'danger' : 'neutral'} className={sv.estado === 'vencido' ? 'border border-danger' : undefined}>
                        {c.tipo_pessoa}
                      </DsBadge>
                    </TableCell>
                    <TableCell>
                      <DsBadge tone={sv.estado === 'vencido' ? 'danger' : 'neutral'} className={sv.estado === 'vencido' ? 'border border-danger' : undefined}>
                        {c.modelo}
                      </DsBadge>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{format(new Date(`${c.data_validade}T00:00:00`), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className={cn('font-mono text-ui', sv.estado === 'vencido' && 'text-danger')}>
                      {sv.dias >= 0 ? `${sv.dias} dias` : `${sv.dias} dias`}
                    </TableCell>
                    <TableCell>
                      <DsBadge tone={sv.tone} className={sv.estado === 'vencido' ? 'border border-danger' : undefined}>
                        {sv.label}
                      </DsBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver senha" onClick={() => handleRevelar(c)}>
                          {revelandoId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Baixar comprovante" disabled={!c.anexo_url} onClick={() => handleBaixar(c)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setRenovando(c)}>
                              <RotateCw className="mr-2 h-4 w-4" /> Renovar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditar(c)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setNotificando(c)}>
                              <Bell className="mr-2 h-4 w-4" /> Notificação
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-danger focus:text-danger" onClick={() => setExcluindo(c)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!revelado} onOpenChange={(o) => !o && setRevelado(null)}>
        <DialogContent className="max-w-[380px] p-0">
          <DialogHeader className="border-b border-line-2 px-6 py-5">
            <DialogTitle className="text-[16px]">Senha do certificado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-6 py-5">
            {revelado && <p className="text-ui text-muted-ink">{titularLabel(revelado.cert)}</p>}
            <div className="flex h-10 items-center rounded-sm border border-line bg-bg-2 px-3 font-mono text-ui text-ink">
              {revelado?.senha ?? 'Senha não cadastrada'}
            </div>
          </div>
          <DialogFooter className="border-t border-line-2 px-6 py-4">
            <Button variant="outline" onClick={() => setRevelado(null)}>Fechar</Button>
            <Button onClick={handleCopiarSenha} disabled={!revelado?.senha}>
              <Copy className="mr-2 h-4 w-4" /> Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CertificateFormDialog open={formOpen} onOpenChange={setFormOpen} certificate={editing} />
      <RenovarCertificadoDialog open={!!renovando} onOpenChange={(o) => !o && setRenovando(null)} certificate={renovando} />
      <NotificarClienteDialog open={!!notificando} onOpenChange={(o) => !o && setNotificando(null)} certificate={notificando} />

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir certificado?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo && `${titularLabel(excluindo)} — esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
