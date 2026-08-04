import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User, Mail, ShieldCheck, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PUBLIC_APP_URL } from '@/lib/environment';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationContext';
import { z } from 'zod';
import { PasswordStrength, isPasswordStrong } from '@/components/ui/PasswordStrength';

import { ALL_MODULE_KEYS, MODULE_TREE } from '@/constants/modules';
import { DEPARTMENT_OPTIONS } from '@/constants/departments';


const ROLE_OPTIONS = [
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

const formSchema = z.object({
  fullName: z.string().min(2, 'Nome completo é obrigatório'),
  email: z.string().email('Email inválido'),
});

export interface EditUserData {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  statusActive: boolean;
  allowedModules: string[];
  department?: string | null;
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSuccess: () => void;
  editUser?: EditUserData;
}

export default function UserFormDialog({ open, onOpenChange, companyId, onSuccess, editUser }: UserFormDialogProps) {
  const isEditMode = !!editUser;
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useNotifications();

  // Cliente Externo (is_internal = false) nasce com o controle de módulos zerado —
  // Gabriel popula manualmente depois. Empresa interna (CA) mantém admin/super_admin
  // com tudo por padrão.
  const { data: companyIsInternal } = useQuery({
    queryKey: ['user-form-company-internal', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('is_internal')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      return (data as any)?.is_internal ?? true;
    },
    enabled: !!companyId,
  });
  const isExternalCompany = companyIsInternal === false;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('colaborador');
  const [department, setDepartment] = useState('');
  const [statusActive, setStatusActive] = useState(true);
  const [allowedModules, setAllowedModules] = useState<string[]>(ALL_MODULE_KEYS);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Interna: só colaborador escolhe módulo (admin/super_admin ganham tudo).
  // Externa: todo mundo escolhe módulo, mesmo admin — nasce zerado.
  const showModulePicker = role === 'colaborador' || isExternalCompany;

  useEffect(() => {
    if (open && editUser) {
      setFullName(editUser.fullName);
      setEmail(editUser.email);
      setRole(editUser.role);
      setDepartment(editUser.department || '');
      setStatusActive(editUser.statusActive);
      setAllowedModules(editUser.allowedModules);
      setNewPassword('');
      setShowNewPassword(false);
      setErrors({});
    } else if (open && !editUser) {
      resetForm();
    }
  }, [open, editUser]);

  const toggleModule = (key: string) => {
    setAllowedModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setNewPassword('');
    setShowNewPassword(false);
    setRole('colaborador');
    setDepartment('');
    setStatusActive(true);
    setAllowedModules(isExternalCompany ? [] : ALL_MODULE_KEYS);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSendResetEmail = async () => {
    if (!editUser) return;
    setSendingResetEmail(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(editUser.email, {
        redirectTo: `${PUBLIC_APP_URL}/redefinir-senha`,
      });
      if (error) throw error;
      toast.success('E-mail de redefinição enviado');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar e-mail de redefinição');
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = formSchema.safeParse({ fullName, email });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Cliente Externo nasce zerado de propósito — Gabriel popula manualmente depois.
    if (!isExternalCompany && role === 'colaborador' && allowedModules.length === 0) {
      toast.error('Selecione pelo menos um módulo de acesso');
      return;
    }

    if (!isEditMode) {
      if (!password) {
        toast.error('Defina uma senha para o novo usuário');
        return;
      }
      if (!isPasswordStrong(password)) {
        toast.error('A senha não atende aos requisitos mínimos');
        return;
      }
    }

    setIsLoading(true);
    try {

      if (isEditMode) {
        const resolvedModules = showModulePicker ? allowedModules : ALL_MODULE_KEYS;

        const emailChanged = email !== editUser!.email;
        const { data: updateData, error: updateError } = await supabase.functions.invoke(
          'admin-update-user',
          {
            body: {
              userId: editUser!.userId,
              fullName,
              email: emailChanged ? email : undefined,
              role,
              statusActive,
              allowedModules: resolvedModules,
              department: department || null,
            },
          }
        );
        if (updateError) throw new Error(updateError.message || 'Erro ao atualizar usuário');
        if (updateData?.error) throw new Error(updateData.error);

        // Atualizar senha (opcional)
        if (newPassword) {
          if (!isPasswordStrong(newPassword)) {
            toast.error('A nova senha não atende aos requisitos mínimos');
            setIsLoading(false);
            return;
          }
          const { data: pwData, error: pwErr } = await supabase.functions.invoke('admin-update-user-password', {
            body: { userId: editUser!.userId, newPassword },
          });
          if (pwErr) throw new Error(pwErr.message || 'Erro ao atualizar senha');
          if (pwData?.error) throw new Error(pwData.error);
          toast.success('Senha atualizada com sucesso!');
        }

        toast.success('Usuário atualizado com sucesso!');
        onSuccess();
        handleClose();
      } else {
        // CREATE MODE
        const resolvedModules = showModulePicker ? allowedModules : ALL_MODULE_KEYS;
        const { data, error: fnError } = await supabase.functions.invoke('create-user-v2', {
          body: {
            email,
            password,
            fullName,
            full_name: fullName,
            companyId,
            company_id: companyId,
            role,
            statusActive,
            status_active: statusActive,
            forcePasswordChange: false,
            force_password_change: false,
            allowedModules: resolvedModules,
            allowed_modules: resolvedModules,
            department: department || null,
          },
        });
        if (fnError) throw new Error(fnError.message || 'Erro ao criar usuário');
        if (data?.error) throw new Error(data.error);

        addNotification({
          title: 'Novo Usuário Criado',
          description: `Usuário "${fullName}" criado com sucesso.`,
          type: 'success',
          category: 'sucesso'
        });

        toast.success('Usuário criado com sucesso!');
        onSuccess();
        handleClose();
      }
    } catch (error: any) {
      console.error('Erro:', error);
      toast.error(error.message || (isEditMode ? 'Erro ao atualizar usuário' : 'Erro ao criar usuário'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome Completo */}
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome Completo *</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="fullName"
                placeholder="João Silva"
                className="pl-10"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
              />
            </div>
            {errors.fullName && <p className="text-destructive text-sm">{errors.fullName}</p>}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="usuario@email.com"
                className="pl-10"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <Label>Status</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{statusActive ? 'Ativo' : 'Inativo'}</span>
              <Switch checked={statusActive} onCheckedChange={setStatusActive} />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>Nível de Acesso</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Setor */}
          <div className="space-y-2">
            <Label>Setor</Label>
            <Select value={department || 'none'} onValueChange={v => setDepartment(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definido</SelectItem>
                {DEPARTMENT_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Módulos — Colaborador sempre escolhe; empresa externa, todo mundo escolhe */}
          {showModulePicker && (
            <div className="space-y-3">
              {isExternalCompany && (
                <p className="text-xs text-muted-foreground">
                  Cliente Externo nasce com tudo desmarcado — libere módulo por módulo.
                </p>
              )}
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <Label className="font-semibold">Módulos de Acesso</Label>
              </div>
              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30 max-h-[320px] overflow-y-auto">
                {MODULE_TREE.map((mod) => {
                  const childKeys = mod.children?.map((c) => c.key) ?? [];
                  const checkedChildren = childKeys.filter((k) => allowedModules.includes(k));
                  const parentChecked = allowedModules.includes(mod.key);
                  const allChildrenChecked = childKeys.length > 0 && checkedChildren.length === childKeys.length;
                  const someChildrenChecked = checkedChildren.length > 0 && !allChildrenChecked;

                  const toggleParent = () => {
                    setAllowedModules((prev) => {
                      const set = new Set(prev);
                      if (parentChecked) {
                        // Uncheck parent + all children
                        set.delete(mod.key);
                        childKeys.forEach((k) => set.delete(k));
                      } else {
                        set.add(mod.key);
                        childKeys.forEach((k) => set.add(k));
                      }
                      return Array.from(set);
                    });
                  };

                  const toggleChild = (childKey: string) => {
                    setAllowedModules((prev) => {
                      const set = new Set(prev);
                      if (set.has(childKey)) {
                        set.delete(childKey);
                        // If no children remain, also remove parent
                        const remaining = childKeys.filter((k) => k !== childKey && set.has(k));
                        if (remaining.length === 0) set.delete(mod.key);
                      } else {
                        set.add(childKey);
                        set.add(mod.key); // ensure parent
                      }
                      return Array.from(set);
                    });
                  };

                  return (
                    <div key={mod.key} className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={parentChecked}
                          ref={(el) => {
                            if (el) el.indeterminate = someChildrenChecked && !parentChecked ? true : someChildrenChecked;
                          }}
                          onChange={toggleParent}
                          className="rounded border-border"
                        />
                        <span className="text-sm font-medium">{mod.label}</span>
                      </label>

                      {mod.children && (
                        <div className="ml-6 grid grid-cols-2 gap-1.5">
                          {mod.children.map((child) => (
                            <label key={child.key} className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={allowedModules.includes(child.key)}
                                onChange={() => toggleChild(child.key)}
                                className="rounded border-border"
                              />
                              <span className="text-sm text-muted-foreground">{child.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Definir senha do usuário"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && <PasswordStrength password={password} />}
            </div>
          )}

          {isEditMode && (
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="newPassword">Redefinir senha (opcional)</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Deixe em branco para não alterar"
                  className="pl-10 pr-10"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword && <PasswordStrength password={newPassword} />}

              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleSendResetEmail}
                disabled={sendingResetEmail}
              >
                {sendingResetEmail ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Enviar e-mail de redefinição de senha
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditMode ? 'Salvar Alterações' : 'Criar Usuário'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
