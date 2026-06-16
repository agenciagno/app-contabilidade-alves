import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus,
  Trash2,
  Pencil,
  Download,
  Upload,
  LogIn,
  DollarSign,
  Users,
  Building2,
  Landmark,
  Tag,
  RefreshCw,
  FileText,
  Shield,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGlobalLogs, useCompanyUsers, GlobalLogAction, GlobalLogModule } from '@/hooks/useGlobalLogs';

const actionIcons: Record<GlobalLogAction, React.ComponentType<{ className?: string }>> = {
  ADICAO: Plus,
  EXCLUSAO: Trash2,
  ALTERACAO: Pencil,
  DOWNLOAD: Download,
  UPLOAD: Upload,
  LOGIN: LogIn,
};

const actionLabels: Record<GlobalLogAction, string> = {
  ADICAO: 'Adição',
  EXCLUSAO: 'Exclusão',
  ALTERACAO: 'Alteração',
  DOWNLOAD: 'Download',
  UPLOAD: 'Upload',
  LOGIN: 'Login',
};

const actionColors: Record<GlobalLogAction, string> = {
  ADICAO: 'bg-success/20 text-success',
  EXCLUSAO: 'bg-destructive/20 text-destructive',
  ALTERACAO: 'bg-primary/20 text-primary',
  DOWNLOAD: 'bg-blue-500/20 text-blue-500',
  UPLOAD: 'bg-violet-500/20 text-violet-500',
  LOGIN: 'bg-amber-500/20 text-amber-500',
};

const moduleIcons: Record<GlobalLogModule, React.ComponentType<{ className?: string }>> = {
  FINANCEIRO: DollarSign,
  CRM: Users,
  BANCOS: Landmark,
  EVENTOS_CONTABEIS: Tag,
  RECORRENTES: RefreshCw,
  DOCUMENTOS: FileText,
  USUARIOS: Shield,
  EMPRESA: Building2,
  AUTH: LogIn,
};

const moduleLabels: Record<GlobalLogModule, string> = {
  FINANCEIRO: 'Financeiro',
  CRM: 'CRM',
  BANCOS: 'Bancos',
  EVENTOS_CONTABEIS: 'Eventos Contábeis',
  RECORRENTES: 'Recorrentes',
  DOCUMENTOS: 'Documentos',
  USUARIOS: 'Usuários',
  EMPRESA: 'Empresa',
  AUTH: 'Autenticação',
};

export default function GlobalLogsTab() {
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');

  const { logs, isLoading } = useGlobalLogs({
    userId: selectedUser !== 'all' ? selectedUser : undefined,
    module: selectedModule !== 'all' ? selectedModule : undefined,
  });
  const { users } = useCompanyUsers();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Filtros</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-full sm:w-48">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os usuários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name || user.username || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-48">
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os módulos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os módulos</SelectItem>
                  {Object.entries(moduleLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      {logs.length === 0 ? (
        <Card className="bg-card border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma atividade registrada
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const ActionIcon = actionIcons[log.action as GlobalLogAction] || Pencil;
            const ModuleIcon = moduleIcons[log.module as GlobalLogModule] || FileText;
            const actionColor = actionColors[log.action as GlobalLogAction] || 'bg-muted text-muted-foreground';

            return (
              <Card key={log.id} className="bg-card border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Action Icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${actionColor}`}>
                      <ActionIcon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{log.details}</p>
                          {log.entity_name && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {log.entity_name}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-xs">
                            <ModuleIcon className="w-3 h-3 mr-1" />
                            {moduleLabels[log.module as GlobalLogModule] || log.module}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>
                          {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>{log.user_name || 'Usuário'}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
