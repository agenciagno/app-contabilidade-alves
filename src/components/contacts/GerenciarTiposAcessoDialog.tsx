import { useState } from 'react';
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AcessoTipo,
  tipoProtegido,
  useAcessoTipos,
  useExcluirAcessoTipo,
  useRenomearAcessoTipo,
} from '@/hooks/useAcessoTipos';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Avisa o formulário quando um tipo some (para sair da seleção que não existe mais). */
  onExcluido?: (id: string, movidoPara: string | null) => void;
}

const plural = (n: number) => `${n} ${n === 1 ? 'acesso' : 'acessos'}`;

export function GerenciarTiposAcessoDialog({ open, onOpenChange, onExcluido }: Props) {
  const { data: tipos = [] } = useAcessoTipos();
  const renomear = useRenomearAcessoTipo();
  const excluir = useExcluirAcessoTipo();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [excluindo, setExcluindo] = useState<AcessoTipo | null>(null);
  const [destino, setDestino] = useState('');

  const iniciarEdicao = (t: AcessoTipo) => {
    setEditandoId(t.id);
    setNome(t.nome);
  };

  const salvarNome = async () => {
    if (!editandoId) return;
    const novo = nome.trim();
    if (novo.length < 2) {
      toast.error('Use entre 2 e 60 letras no nome do tipo.');
      return;
    }
    try {
      await renomear.mutateAsync({ id: editandoId, nome: novo });
      toast.success('Nome atualizado');
      setEditandoId(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao renomear.');
    }
  };

  const abrirExclusao = (t: AcessoTipo) => {
    setExcluindo(t);
    setDestino('');
  };

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    const precisaMover = excluindo.total > 0;
    if (precisaMover && !destino) return;
    try {
      const movidos = await excluir.mutateAsync({
        id: excluindo.id,
        moverPara: precisaMover ? destino : null,
      });
      toast.success(
        movidos > 0
          ? `Tipo "${excluindo.nome}" excluído; ${plural(movidos)} movido${movidos === 1 ? '' : 's'}.`
          : `Tipo "${excluindo.nome}" excluído.`
      );
      onExcluido?.(excluindo.id, precisaMover ? destino : null);
      setExcluindo(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao excluir o tipo.');
    }
  };

  const outrosTipos = tipos.filter((t) => t.id !== excluindo?.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tipos de acesso</DialogTitle>
            <DialogDescription>
              A lista vale para todos os clientes. Mudar o nome atualiza os acessos que já usam o tipo.
            </DialogDescription>
          </DialogHeader>

          <ul className="divide-y rounded-md border">
            {tipos.map((t) => {
              const emEdicao = editandoId === t.id;
              const protegido = tipoProtegido(t);
              return (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                  {emEdicao ? (
                    <>
                      <Input
                        autoFocus
                        value={nome}
                        maxLength={60}
                        onChange={(e) => setNome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); salvarNome(); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditandoId(null); }
                        }}
                        className="h-8"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={salvarNome}
                        disabled={renomear.isPending}
                        title="Salvar nome"
                      >
                        {renomear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditandoId(null)}
                        title="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{t.nome}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t.total > 0 ? plural(t.total) : 'sem acessos'}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => iniciarEdicao(t)}
                        title="Renomear"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => abrirExclusao(t)}
                        disabled={protegido}
                        title={protegido ? 'Usado pelo sistema: pode renomear, não excluir' : 'Excluir'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && !excluir.isPending && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{excluindo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo && excluindo.total > 0
                ? `${plural(excluindo.total)} de clientes usa${excluindo.total === 1 ? '' : 'm'} este tipo. Escolha o tipo que vai receber ${excluindo.total === 1 ? 'esse acesso' : 'esses acessos'}; depois o tipo é excluído.`
                : 'Nenhum cliente usa este tipo. Ele sai da lista.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {excluindo && excluindo.total > 0 && (
            <div className="space-y-2">
              <Label>Mover os acessos para</Label>
              <Select value={destino} onValueChange={(v) => v && setDestino(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {outrosTipos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmarExclusao}
              disabled={excluir.isPending || (!!excluindo && excluindo.total > 0 && !destino)}
            >
              {excluir.isPending
                ? 'Excluindo...'
                : excluindo && excluindo.total > 0
                  ? `Mover ${plural(excluindo.total)} e excluir`
                  : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
