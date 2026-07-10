import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useParties, type Party, type PartyInput, type PartyTipo } from '@/hooks/useParties';
import { PartyFormDialog } from '@/components/parties/PartyFormDialog';

type TipoFilter = 'todos' | PartyTipo;

const tipoBadge = (tipo: string) => {
  const map: Record<string, { label: string; className: string }> = {
    cliente: { label: 'Cliente', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    fornecedor: { label: 'Fornecedor', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
    ambos: { label: 'Ambos', className: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
  };
  const c = map[tipo] ?? { label: tipo, className: '' };
  return <Badge variant="secondary" className={c.className}>{c.label}</Badge>;
};

export default function PartiesPage() {
  const { data: parties, isLoading, create, update, toggleActive } = useParties();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);

  const filtered = useMemo(() => {
    const list = parties ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (tipoFilter !== 'todos' && p.tipo !== tipoFilter) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        (p.documento ?? '').toLowerCase().includes(q)
      );
    });
  }, [parties, search, tipoFilter]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: Party) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const handleSubmit = (input: PartyInput) => {
    if (editing) {
      update.mutate({ id: editing.id, ...input }, { onSuccess: () => setDialogOpen(false) });
    } else {
      create.mutate(input, { onSuccess: () => setDialogOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes & Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Contrapartes utilizadas em lançamentos financeiros.</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Novo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou documento…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as TipoFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
                <SelectItem value="fornecedor">Fornecedor</SelectItem>
                <SelectItem value="ambos">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
              <div className="p-3 rounded-full bg-muted">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Nenhum registro encontrado</p>
                <p className="text-sm text-muted-foreground">
                  {parties?.length ? 'Ajuste os filtros ou crie um novo.' : 'Cadastre seu primeiro cliente ou fornecedor.'}
                </p>
              </div>
              <Button onClick={openNew} variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> Novo
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="w-[120px]">Ativo</TableHead>
                  <TableHead className="w-[80px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className={p.is_active ? '' : 'opacity-60'}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{tipoBadge(p.tipo)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.documento || '—'}</TableCell>
                    <TableCell className="text-sm">
                      <div>{p.email || '—'}</div>
                      <div className="text-muted-foreground">{p.telefone || ''}</div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PartyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        isLoading={create.isPending || update.isPending}
        initial={editing}
      />
    </div>
  );
}
