import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ds';
import { Contact } from '@/hooks/useContacts';
import { ehCliente, getContactDisplayName } from '@/lib/contact-display';
import { Users, DollarSign, X } from 'lucide-react';

interface EntradaClientesTabProps {
  contacts: Contact[];
}

export function EntradaClientesTab({ contacts }: EntradaClientesTabProps) {
  // Regra (17/10/2026): entra quem está marcado como Cliente e tem Início do contrato no ano corrente (2026 hoje).
  // O período começa no ano corrente e pode ser ajustado; quem for cadastrado depois, com início no ano, entra sozinho.
  const anoAtual = new Date().getFullYear();
  const inicioPadrao = `${anoAtual}-01-01`;
  const fimPadrao = `${anoAtual}-12-31`;
  const [dateStart, setDateStart] = useState(inicioPadrao);
  const [dateEnd, setDateEnd] = useState(fimPadrao);
  const periodoAlterado = dateStart !== inicioPadrao || dateEnd !== fimPadrao;

  const newClients = useMemo(() => {
    return contacts
      .filter(c => {
        if (!ehCliente(c)) return false;
        const inicio = c.data_inicio_contrato?.slice(0, 10);
        if (!inicio) return false;
        if (dateStart && inicio < dateStart) return false;
        if (dateEnd && inicio > dateEnd) return false;
        return true;
      })
      .sort((a, b) =>
        (b.data_inicio_contrato || '').localeCompare(a.data_inicio_contrato || '') ||
        getContactDisplayName(a).localeCompare(getContactDisplayName(b), 'pt-BR', { sensitivity: 'base' }),
      );
  }, [contacts, dateStart, dateEnd]);

  const totalClients = newClients.length;
  const totalRevenue = useMemo(() => {
    return newClients.reduce((sum, c) => sum + (c.boleto_value || 0), 0);
  }, [newClients]);

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-ink-2 px-1">Início do contrato — de</p>
          <DateField value={dateStart} onChange={setDateStart} className="w-[160px]" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-ink-2 px-1">Até</p>
          <DateField value={dateEnd} onChange={setDateEnd} className="w-[160px]" />
        </div>
        {periodoAlterado && (
          <Button
            variant="ghost" size="sm" className="gap-1.5"
            onClick={() => { setDateStart(inicioPadrao); setDateEnd(fimPadrao); }}
          >
            <X className="h-3.5 w-3.5" /> Voltar para {anoAtual}
          </Button>
        )}
      </div>

      <Card className="bg-card border-border/50">
        {newClients.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Início do Contrato</TableHead>
                <TableHead>Nome do Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">Valor do Honorário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newClients.map(client => (
                <TableRow key={client.id}>
                  <TableCell className="text-sm">
                    {format(parseISO(client.data_inicio_contrato!), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">{getContactDisplayName(client)}</TableCell>
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
            Nenhum cliente com início de contrato no período selecionado
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
              <p className="text-h3-section text-foreground">{totalClients}</p>
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
              <p className="text-h3-section text-foreground">{formatCurrency(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
