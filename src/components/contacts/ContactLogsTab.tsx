import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  History, 
  Calendar, 
  User, 
  FileText, 
  Edit, 
  Trash2, 
  Plus, 
  MessageSquare, 
  RefreshCw,
  DollarSign,
  CheckCircle,
  Users,
  UserPlus,
  UserMinus
} from 'lucide-react';
import { useContactLogs } from '@/hooks/useContactLogs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactLogsTabProps {
  contactId: string;
}

const actionIcons: Record<string, React.ReactNode> = {
  NOTA_CRIADA: <Plus className="h-4 w-4" />,
  NOTA_EDITADA: <Edit className="h-4 w-4" />,
  NOTA_EXCLUIDA: <Trash2 className="h-4 w-4" />,
  DOCUMENTO_UPLOAD: <FileText className="h-4 w-4" />,
  DOCUMENTO_EXCLUIDO: <Trash2 className="h-4 w-4" />,
  MENSAGEM_ENVIADA: <MessageSquare className="h-4 w-4" />,
  PERFIL_ATUALIZADO: <RefreshCw className="h-4 w-4" />,
  CADASTRO_ALTERADO: <Edit className="h-4 w-4" />,
  HONORARIO_GERADO: <DollarSign className="h-4 w-4" />,
  TRANSACAO_PAGA: <CheckCircle className="h-4 w-4" />,
  SOCIO_ADICIONADO: <UserPlus className="h-4 w-4" />,
  SOCIO_EDITADO: <Users className="h-4 w-4" />,
  SOCIO_REMOVIDO: <UserMinus className="h-4 w-4" />,
};

const actionLabels: Record<string, string> = {
  NOTA_CRIADA: 'Nota Criada',
  NOTA_EDITADA: 'Nota Editada',
  NOTA_EXCLUIDA: 'Nota Excluída',
  DOCUMENTO_UPLOAD: 'Documento Enviado',
  DOCUMENTO_EXCLUIDO: 'Documento Excluído',
  MENSAGEM_ENVIADA: 'Mensagem Enviada',
  PERFIL_ATUALIZADO: 'Perfil Atualizado',
  CADASTRO_ALTERADO: 'Cadastro Alterado',
  HONORARIO_GERADO: 'Honorário Gerado',
  TRANSACAO_PAGA: 'Transação Paga',
  SOCIO_ADICIONADO: 'Sócio Adicionado',
  SOCIO_EDITADO: 'Sócio Editado',
  SOCIO_REMOVIDO: 'Sócio Removido',
};

const actionColors: Record<string, string> = {
  NOTA_CRIADA: 'bg-emerald-500/10 text-emerald-500',
  NOTA_EDITADA: 'bg-blue-500/10 text-blue-500',
  NOTA_EXCLUIDA: 'bg-red-500/10 text-red-500',
  DOCUMENTO_UPLOAD: 'bg-purple-500/10 text-purple-500',
  DOCUMENTO_EXCLUIDO: 'bg-red-500/10 text-red-500',
  MENSAGEM_ENVIADA: 'bg-cyan-500/10 text-cyan-500',
  PERFIL_ATUALIZADO: 'bg-amber-500/10 text-amber-500',
  CADASTRO_ALTERADO: 'bg-orange-500/10 text-orange-500',
  HONORARIO_GERADO: 'bg-emerald-500/10 text-emerald-500',
  TRANSACAO_PAGA: 'bg-green-500/10 text-green-500',
  SOCIO_ADICIONADO: 'bg-indigo-500/10 text-indigo-500',
  SOCIO_EDITADO: 'bg-violet-500/10 text-violet-500',
  SOCIO_REMOVIDO: 'bg-rose-500/10 text-rose-500',
};

export function ContactLogsTab({ contactId }: ContactLogsTabProps) {
  const { logs, isLoading } = useContactLogs(contactId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-[20px]" />
        <Skeleton className="h-20 w-full rounded-[20px]" />
        <Skeleton className="h-20 w-full rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium text-foreground">
          Histórico de Atividades ({logs.length})
        </h3>
      </div>

      {logs.length === 0 ? (
        <Card className="rounded-[20px] border-dashed border-2 border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhuma atividade registrada</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              O histórico de alterações aparecerá aqui
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border/50 hidden sm:block" />

          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="relative flex gap-4">
                {/* Timeline dot */}
                <div className="hidden sm:flex items-start justify-center pt-1">
                  <div className="relative z-10 h-8 w-8 rounded-full bg-card border-2 border-border/50 flex items-center justify-center">
                    <div className={`p-1 rounded-full ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
                      {actionIcons[log.action] || <History className="h-3 w-3" />}
                    </div>
                  </div>
                </div>

                <Card className="flex-1 rounded-[20px] border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-200 hover:shadow-md">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge 
                            variant="secondary" 
                            className={`rounded-lg ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}
                          >
                            <span className="sm:hidden mr-1">
                              {actionIcons[log.action] || <History className="h-3 w-3" />}
                            </span>
                            {actionLabels[log.action] || log.action}
                          </Badge>
                        </div>
                        <p className="text-foreground text-sm sm:text-base">
                          {log.description}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1 text-xs sm:text-sm text-muted-foreground shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(log.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground/70">
                            {format(new Date(log.created_at), "HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <User className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[150px]">
                            {log.user_name || 'Usuário'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
