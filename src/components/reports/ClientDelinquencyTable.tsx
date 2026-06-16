import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, User, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DelinquentClient {
  id: string;
  name: string;
  phone?: string | null;
  openAmount: number;
  daysOverdue: number;
}

interface ClientDelinquencyTableProps {
  clients: DelinquentClient[];
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const getSeverityBadge = (days: number) => {
  if (days > 60) return { label: 'Crítico', className: 'bg-red-500/10 text-red-500 border-red-500/20' };
  if (days > 30) return { label: 'Alto', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' };
  if (days > 15) return { label: 'Médio', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
  return { label: 'Baixo', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
};

export function ClientDelinquencyTable({ clients }: ClientDelinquencyTableProps) {
  const { toast } = useToast();
  const totalOpenAmount = clients.reduce((sum, c) => sum + c.openAmount, 0);

  const handleWhatsApp = (client: DelinquentClient) => {
    if (!client.phone) {
      toast({ title: 'Telefone não cadastrado', variant: 'destructive' });
      return;
    }
    const phone = client.phone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Olá ${client.name}, identificamos um valor em aberto de ${formatCurrency(client.openAmount)}. Por favor, entre em contato para regularização.`
    );
    window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Inadimplência por Cliente
          </CardTitle>
          {clients.length > 0 && (
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
              Total: {formatCurrency(totalOpenAmount)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <User className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhuma inadimplência</p>
            <p className="text-sm">Todos os clientes estão em dia!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor Vencido</TableHead>
                  <TableHead className="text-center">Dias de Atraso</TableHead>
                  <TableHead className="text-center">Risco</TableHead>
                  <TableHead className="text-center">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const severity = getSeverityBadge(client.daysOverdue);
                  return (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{client.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-500">
                        {formatCurrency(client.openAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{client.daysOverdue}</span>
                        <span className="text-muted-foreground text-xs ml-1">dias</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={severity.className}>
                          {severity.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                          onClick={() => handleWhatsApp(client)}
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
