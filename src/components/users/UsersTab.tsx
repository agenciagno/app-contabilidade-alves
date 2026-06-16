import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Users, Shield, Pencil, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import UserFormDialog, { EditUserData } from './UserFormDialog';
import ActiveSessionsPanel from './ActiveSessionsPanel';
import { useUserRole } from '@/hooks/useUserRole';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const MODULE_LABELS: Record<string, string> = {
  financeiro: 'Financeiro',
  crm: 'CRM',
  comercial: 'Comercial',
  fiscal: 'Fiscal',
  pessoal_rh: 'Pessoal/RH',
  configuracoes: 'Config.',
};

const ROLE_LABELS: Record<string, string> = {
  colaborador: 'Colaborador',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  status_active: boolean;
  status: string | null;
  is_super_admin: boolean;
  allowed_modules: string[];
  created_at: string;
}

interface UsersTabProps {
  companyId: string;
  currentUserId: string;
}

export default function UsersTab({ companyId, currentUserId }: UsersTabProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<EditUserData | undefined>(undefined);
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useUserRole();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['company-users', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, role, status_active, status, is_super_admin, allowed_modules, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Profile[];
    },
    staleTime: 30000
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('user_roles').delete().eq('user_id', userId);
      const { error } = await supabase.from('profiles').delete().eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      toast.success('Usuário removido com sucesso!');
      setDeleteUserId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover usuário');
    }
  });

  const updateStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals-count'] });
      toast.success(status === 'active' ? 'Usuário aprovado!' : 'Usuário bloqueado.');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar status');
    },
  });

  const handleDelete = (userId: string) => {
    if (userId === currentUserId) {
      toast.error('Você não pode excluir seu próprio usuário');
      return;
    }
    setDeleteUserId(userId);
  };

  const handleEdit = (user: Profile) => {
    setEditUser({
      userId: user.user_id,
      fullName: user.full_name || '',
      email: user.email,
      role: user.role || 'colaborador',
      statusActive: user.status_active ?? true,
      allowedModules: user.allowed_modules ?? [],
    });
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) setEditUser(undefined);
  };

  const confirmDelete = () => {
    if (deleteUserId) {
      deleteUser.mutate(deleteUserId);
    }
  };

  return (
    <>
    <Card className="bg-card border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Minha Equipe</CardTitle>
              <CardDescription>Gerencie os usuários que podem acessar o sistema</CardDescription>
            </div>
          </div>
          <Button onClick={() => { setEditUser(undefined); setIsDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-foreground">Nenhum usuário cadastrado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione usuários para acessar o sistema
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Nível de Acesso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name || '-'}
                    {user.user_id === currentUserId && (
                      <Badge variant="outline" className="ml-2 text-xs">Você</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    {user.role === 'super_admin' || user.is_super_admin ? (
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                        <Shield className="w-3 h-3 mr-1" />
                        Super Admin
                      </Badge>
                    ) : (
                      <Badge variant="outline">{ROLE_LABELS[user.role] || user.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {(user.status ?? 'active') === 'pending' ? (
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20">
                          Aguardando aprovação
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                          title="Aprovar"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ userId: user.user_id, status: 'active' })}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Recusar"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ userId: user.user_id, status: 'blocked' })}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (user.status ?? 'active') === 'blocked' ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : (
                      <Badge variant={user.status_active ? 'default' : 'secondary'}>
                        {user.status_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.role === 'super_admin' || user.is_super_admin ? (
                      <span className="text-xs text-muted-foreground">Acesso total</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(user.allowed_modules ?? []).slice(0, 3).map(mod => (
                          <Badge key={mod} variant="outline" className="text-xs px-1.5 py-0">
                            {MODULE_LABELS[mod] ?? mod}
                          </Badge>
                        ))}
                        {(user.allowed_modules ?? []).length > 3 && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            +{(user.allowed_modules ?? []).length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(user)}
                        className="text-muted-foreground hover:text-primary"
                        title="Editar usuário"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(user.user_id)}
                        disabled={user.user_id === currentUserId || deleteUser.isPending}
                        className="text-muted-foreground hover:text-destructive"
                        title="Excluir usuário"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <UserFormDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        companyId={companyId}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['company-users'] })}
        editUser={editUser}
      />

      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este usuário? Esta ação removerá o acesso imediatamente e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>

      {isSuperAdmin && <ActiveSessionsPanel />}
    </>
  );
}
