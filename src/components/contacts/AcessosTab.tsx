import { useState } from 'react';
import { Plus, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AcessoPortal, useAcessosCliente } from '@/hooks/useAcessosCliente';
import { AcessosTable } from './AcessosTable';
import { AcessoFormDialog } from './AcessoFormDialog';
import { AlvarasSection } from './AlvarasCertificadosTab';

interface Props {
  contactId: string;
}

export function AcessosTab({ contactId }: Props) {
  const { data: acessos, isLoading, isError } = useAcessosCliente(contactId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AcessoPortal | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (a: AcessoPortal) => {
    setEditing(a);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Acessos a Portais</h2>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Adicionar acesso
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
            Não foi possível carregar os acessos. Tente novamente.
          </div>
        ) : !acessos || acessos.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum acesso cadastrado para este cliente. Clique em{' '}
            <strong>+ Adicionar acesso</strong>.
          </div>
        ) : (
          <AcessosTable acessos={acessos} contactId={contactId} onEdit={openEdit} />
        )}

        <AcessoFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          contactId={contactId}
          acesso={editing}
        />
      </div>

      <AlvarasSection contactId={contactId} />
    </div>
  );
}
