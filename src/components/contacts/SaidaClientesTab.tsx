import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Contact } from '@/hooks/useContacts';
import { ehCliente, getContactDisplayName } from '@/lib/contact-display';
import { Users, DollarSign } from 'lucide-react';

interface SaidaClientesTabProps {
  contacts: Contact[];
}

/**
 * Saída de Clientes (17/10/2026): todo contato marcado como Cliente cujo Status do Cliente é "Ex-cliente".
 * A data é o Fim do contrato; sem ele, vale a data em que o status virou Ex-cliente (a maioria dos cadastros antigos não tem nenhuma das duas).
 */
export function SaidaClientesTab({ contacts }: SaidaClientesTabProps) {
  const saidas = useMemo(() => {
    return contacts
      .filter(c => ehCliente(c) && c.status_cliente === 'Ex-cliente')
      .map(c => ({ contact: c, data: (c.data_saida_cliente || c.status_cliente_desde || '').slice(0, 10) }))
      .sort((a, b) =>
        // Com data primeiro (mais recente no topo); sem data no fim, em ordem alfabética.
        Number(!!b.data) - Number(!!a.data) ||
        b.data.localeCompare(a.data) ||
        getContactDisplayName(a.contact).localeCompare(getContactDisplayName(b.contact), 'pt-BR', { sensitivity: 'base' }),
      );
  }, [contacts]);

  const totalRevenue = useMemo(
    () => saidas.reduce((sum, s) => sum + (s.contact.boleto_value || 0), 0),
    [saidas],
  );

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border/50">
        {saidas.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data de Saída</TableHead>
                <TableHead>Nome do Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">Valor do Honorário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saidas.map(({ contact, data }) => (
                <TableRow key={contact.id}>
                  <TableCell className="text-sm">
                    {data ? format(parseISO(data), 'dd/MM/yyyy') : <span className="text-muted-foreground/30">—</span>}
                  </TableCell>
                  <TableCell className="font-medium">{getContactDisplayName(contact)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {contact.document || <span className="text-muted-foreground/30">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {contact.boleto_value ? formatCurrency(contact.boleto_value) : <span className="text-muted-foreground/30">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="text-muted-foreground text-center py-16">
            Nenhum cliente com status Ex-cliente
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Clientes que Saíram</p>
              <p className="text-h3-section text-foreground">{saidas.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Honorários que Saíram</p>
              <p className="text-h3-section text-foreground">{formatCurrency(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
