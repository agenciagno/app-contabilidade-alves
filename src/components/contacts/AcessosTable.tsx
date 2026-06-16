import { useState } from 'react';
import { differenceInDays, format } from 'date-fns';
import { Copy, Eye, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AcessoPortal,
  PORTAL_LABELS,
  useExcluirAcesso,
  useRevelarSenha,
} from '@/hooks/useAcessosCliente';

interface Props {
  acessos: AcessoPortal[];
  contactId: string;
  onEdit: (acesso: AcessoPortal) => void;
}

function ValidadeBadge({ data }: { data: string }) {
  const dias = differenceInDays(new Date(data + 'T00:00:00'), new Date());
  if (dias < 30) {
    return <Badge variant="destructive">⚠ Vence em {dias} dias</Badge>;
  }
  if (dias <= 60) {
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
        Vence em {dias} dias
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
      {format(new Date(data + 'T00:00:00'), 'dd/MM/yyyy')}
    </Badge>
  );
}

export function AcessosTable({ acessos, contactId, onEdit }: Props) {
  const [revealed, setRevealed] = useState<{ id: string; value: string } | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AcessoPortal | null>(null);

  const revelar = useRevelarSenha();
  const excluir = useExcluirAcesso(contactId);

  const handleRevelar = async (a: AcessoPortal) => {
    setLoadingAction(a.id + ':rev');
    try {
      const senha = await revelar.mutateAsync({ acesso_id: a.id, acao: 'REVELAR' });
      setRevealed({ id: a.id, value: senha });
      setTimeout(() => {
        setRevealed((cur) => (cur?.id === a.id ? null : cur));
      }, 5000);
    } catch {
      toast.error('Sem permissão ou senha não cadastrada');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopiar = async (a: AcessoPortal) => {
    setLoadingAction(a.id + ':cp');
    try {
      const senha = await revelar.mutateAsync({ acesso_id: a.id, acao: 'COPIAR' });
      await navigator.clipboard.writeText(senha);
      toast.success('Senha copiada!');
    } catch {
      toast.error('Sem permissão ou senha não cadastrada');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await excluir.mutateAsync(toDelete.id);
      toast.success('Acesso removido');
      setToDelete(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao excluir');
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portal</TableHead>
              <TableHead>Login</TableHead>
              <TableHead>Senha</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Obs</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {acessos.map((a) => {
              const isRevealed = revealed?.id === a.id;
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{PORTAL_LABELS[a.portal] ?? a.portal}</span>
                      {a.portal_label && (
                        <span className="text-xs text-muted-foreground">{a.portal_label}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{a.login ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {isRevealed ? revealed!.value : '••••••••'}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleRevelar(a)}
                        disabled={loadingAction === a.id + ':rev'}
                        title="Revelar"
                      >
                        {loadingAction === a.id + ':rev' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleCopiar(a)}
                        disabled={loadingAction === a.id + ':cp'}
                        title="Copiar"
                      >
                        {loadingAction === a.id + ':cp' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.portal === 'certificado_digital' && a.validade_certificado ? (
                      <ValidadeBadge data={a.validade_certificado} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {a.observacao ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setToDelete(a)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O acesso ao portal{' '}
              <strong>{toDelete && PORTAL_LABELS[toDelete.portal]}</strong> será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
