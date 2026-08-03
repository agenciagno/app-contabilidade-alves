import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { PageHeader, DsBadge, IconBox } from '@/components/ds';

type TipoFilter = 'todos' | PartyTipo;
type AtivoFilter = 'todos' | 'ativo' | 'inativo';

const tipoLabel: Record<PartyTipo, string> = {
  cliente: 'Cliente',
  fornecedor: 'Fornecedor',
  ambos: 'Ambos',
};

const monthYear = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const partySubtitle = (p: Party) => {
  if (!p.is_active) return `inativo desde ${monthYear(p.updated_at)}`;
  if (p.observacoes?.trim()) return p.observacoes.trim();
  const label = p.tipo === 'ambos' ? 'cliente e fornecedor' : tipoLabel[p.tipo].toLowerCase();
  return `${label} desde ${monthYear(p.created_at)}`;
};

export default function PartiesPage() {
  const { data: parties, isLoading, create, update, toggleActive } = useParties();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos');
  const [ativoFilter, setAtivoFilter] = useState<AtivoFilter>('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);

  const filtered = useMemo(() => {
    const list = parties ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (tipoFilter !== 'todos' && p.tipo !== tipoFilter) return false;
      if (ativoFilter === 'ativo' && !p.is_active) return false;
      if (ativoFilter === 'inativo' && p.is_active) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q) ||
        (p.documento ?? '').toLowerCase().includes(q)
      );
    });
  }, [parties, search, tipoFilter, ativoFilter]);

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
      <PageHeader
        kicker="~/financeiro · cadastros"
        title="Clientes & fornecedores."
        subtitle={`Contrapartes usadas nos lançamentos · ${parties?.length ?? 0} cadastradas.`}
        actions={
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Nova contraparte
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink-2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou documento..."
            className="h-10 border-line bg-paper pl-9 text-ui"
          />
        </div>

        <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as TipoFilter)}>
          <SelectTrigger className="h-9 w-[130px] border-line bg-paper text-ui">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="cliente">Cliente</SelectItem>
            <SelectItem value="fornecedor">Fornecedor</SelectItem>
            <SelectItem value="ambos">Ambos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ativoFilter} onValueChange={(v) => setAtivoFilter(v as AtivoFilter)}>
          <SelectTrigger className="h-9 w-[120px] border-line bg-paper text-ui">
            <SelectValue placeholder="Ativo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <IconBox tone="neutral" icon={<Users strokeWidth={1.75} />} />
            <div>
              <p className="text-ui-strong text-ink">Nenhum registro encontrado</p>
              <p className="text-meta text-muted-ink">
                {parties?.length ? 'Ajuste os filtros ou crie um novo.' : 'Cadastre seu primeiro cliente ou fornecedor.'}
              </p>
            </div>
            <Button onClick={openNew} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Nova contraparte
            </Button>
          </div>
        ) : (
          <>
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
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium text-ink">{p.display_name || p.nome}</p>
                      <p className="text-meta text-muted-ink">{partySubtitle(p)}</p>
                    </TableCell>
                    <TableCell className="text-ink">{tipoLabel[p.tipo]}</TableCell>
                    <TableCell className="font-mono text-mono-sm text-muted-ink">{p.documento || '—'}</TableCell>
                    <TableCell className="text-ink">{p.email || p.telefone || '—'}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleActive.mutate({ id: p.id, is_active: !p.is_active })}
                        title={p.is_active ? 'Clique para desativar' : 'Clique para ativar'}
                        className="cursor-pointer"
                      >
                        <DsBadge tone={p.is_active ? 'ok' : 'neutral'}>
                          {p.is_active ? 'ativo' : 'inativo'}
                        </DsBadge>
                      </button>
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
            <div className="border-t border-line px-5 py-3 text-meta text-muted-ink">
              {filtered.length} de {parties?.length ?? 0} contrapartes
            </div>
          </>
        )}
      </div>

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
