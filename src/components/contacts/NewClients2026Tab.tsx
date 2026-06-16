import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Contact } from '@/hooks/useContacts';
import { Users, DollarSign } from 'lucide-react';

interface NewClients2026TabProps {
  contacts: Contact[];
}

export function NewClients2026Tab({ contacts }: NewClients2026TabProps) {
  const newClients = useMemo(() => {
    return contacts.filter(c => {
      const createdAt = new Date(c.created_at);
      return createdAt.getFullYear() === 2026 && c.origin === 'manual';
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [contacts]);

  const totalClients = newClients.length;
  const totalRevenue = useMemo(() => {
    return newClients.reduce((sum, c) => sum + (c.boleto_value || 0), 0);
  }, [newClients]);

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border/50">
        {newClients.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data de Cadastro</TableHead>
                <TableHead>Nome do Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">Valor do Honorário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newClients.map(client => (
                <TableRow key={client.id}>
                  <TableCell className="text-sm">
                    {format(new Date(client.created_at), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {client.document || <span className="text-muted-foreground/30">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {client.boleto_value ? formatCurrency(client.boleto_value) : <span className="text-muted-foreground/30">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="text-muted-foreground text-center py-16">
            Nenhum cliente cadastrado manualmente em 2026
          </CardContent>
        )}
      </Card>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Novos Clientes</p>
              <p className="text-2xl font-bold text-foreground">{totalClients}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Receita de Novos Honorários</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
