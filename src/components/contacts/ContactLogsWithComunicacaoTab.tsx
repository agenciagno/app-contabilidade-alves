import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { History, MessageSquare, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useContactMessages } from '@/hooks/useContactMessages';
import { ContactLogsTab } from './ContactLogsTab';

interface Props {
  contactId: string;
}

export function ContactLogsWithComunicacaoTab({ contactId }: Props) {
  return (
    <Tabs defaultValue="auditoria" className="w-full">
      <TabsList className="grid w-full grid-cols-2 max-w-md">
        <TabsTrigger value="auditoria" className="flex items-center gap-2">
          <History className="h-4 w-4" />
          Auditoria
        </TabsTrigger>
        <TabsTrigger value="comunicacao" className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comunicação
        </TabsTrigger>
      </TabsList>

      <TabsContent value="auditoria" className="mt-6">
        <ContactLogsTab contactId={contactId} />
      </TabsContent>

      <TabsContent value="comunicacao" className="mt-6">
        <ComunicacaoLog contactId={contactId} />
      </TabsContent>
    </Tabs>
  );
}

function ComunicacaoLog({ contactId }: { contactId: string }) {
  const { messages, isLoading } = useContactMessages(contactId);

  if (isLoading) return <Skeleton className="h-64 rounded-[20px]" />;

  return (
    <Card className="rounded-[20px] border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Log de Disparos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {messages && messages.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((msg) => (
                <TableRow key={msg.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(msg.sent_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    {msg.channel === 'whatsapp' ? (
                      <div className="flex items-center gap-1 text-emerald-500">
                        <MessageSquare className="h-4 w-4" />
                        <span className="text-sm">WhatsApp</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-blue-500">
                        <Mail className="h-4 w-4" />
                        <span className="text-sm">E-mail</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={msg.message}>
                    {msg.message}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        msg.status === 'enviado'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : msg.status === 'pendente'
                          ? 'bg-yellow-500/10 text-yellow-500'
                          : 'bg-red-500/10 text-red-500'
                      }
                    >
                      {msg.status === 'enviado' ? 'Enviado' : msg.status === 'pendente' ? 'Pendente' : 'Falhou'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum disparo registrado
          </div>
        )}
      </CardContent>
    </Card>
  );
}
