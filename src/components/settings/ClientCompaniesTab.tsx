import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { PasswordStrength, isPasswordStrong } from '@/components/ui/PasswordStrength';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2,
  Plus,
  Users,
  Loader2,
  Trash2,
  UserPlus,
  Search,
  Eye,
  EyeOff,
  ChevronRight,
  RefreshCw,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULE_OPTIONS = [
  { key: 'financeiro', label: 'Financeiro', soon: false },
  { key: 'crm', label: 'CRM / Clientes', soon: false },
  { key: 'relatorios', label: 'Relatórios', soon: false },
  { key: 'comercial', label: 'Comercial', soon: true },
  { key: 'fiscal', label: 'Fiscal', soon: true },
  { key: 'pessoal_rh', label: 'Pessoal / RH', soon: true },
  { key: 'configuracoes', label: 'Configurações', soon: false },
];

const maskCNPJ = (v: string) =>
  v.replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);

interface Company {
  id: string;
  name: string;
  cnpj: string;
  status: string;
  plan_modules: string[];
  created_at: string;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  allowed_modules: string[];
  created_at: string;
}

export default function ClientCompaniesTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [crmMode, setCrmMode] = useState(false);
  const [createAdmin, setCreateAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [crmSearch, setCrmSearch] = useState('');

  // Edit user state
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    fullName: '',
    password: '',
    allowedModules: [] as string[],
  });
  const [savingUser, setSavingUser] = useState(false);

  // Company form
  const [companyForm, setCompanyForm] = useState({
    name: '',
    cnpj: '',
    planModules: ['financeiro', 'crm', 'relatorios'] as string[],
  });

  // New user form
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    password: '',
    allowedModules: ['financeiro', 'crm', 'relatorios'] as string[],
  });

  // Admin user for new company
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    password: '',
  });

  // Load all companies
  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ['all-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, cnpj, status, plan_modules, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Company[];
    },
  });

  // Load users for selected company
  const { data: companyUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['company-users', selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, allowed_modules, created_at')
        .eq('company_id', selectedCompanyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!selectedCompanyId,
  });

  // Load CRM contacts for import
  const { data: crmContacts = [] } = useQuery({
    queryKey: ['crm-contacts-for-import'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, document, email')
        .in('type', ['cliente', 'ambos', 'fornecedor'])
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: crmMode,
  });

  const filteredCrm = crmContacts.filter((c) =>
    c.name.toLowerCase().includes(crmSearch.toLowerCase()) ||
    (c.document || '').includes(crmSearch)
  );

  // Toggle company status
  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('companies')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-companies'] });
      toast.success('Status da empresa atualizado!');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar status'),
  });

  // Create company (+ optional admin user)
  const [creatingCompany, setCreatingCompany] = useState(false);
  const handleCreateCompany = async () => {
    if (!companyForm.name.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }
    if (createAdmin && adminForm.password && !isPasswordStrong(adminForm.password)) {
      toast.error('A senha do administrador não atende aos requisitos de segurança');
      return;
    }
    setCreatingCompany(true);
    try {
      // Insert company
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyForm.name.trim(),
          cnpj: companyForm.cnpj.replace(/\D/g, ''),
          status: 'active',
          plan_modules: companyForm.planModules,
        })
        .select()
        .single();

      if (companyError) throw companyError;

      // Optionally create admin user via edge function
      if (createAdmin && adminForm.email && adminForm.password && adminForm.fullName) {
        const { data: result, error: fnError } = await supabase.functions.invoke('create-user-v2', {
          body: {
            email: adminForm.email,
            password: adminForm.password,
            fullName: adminForm.fullName,
            companyId: newCompany.id,
            allowedModules: companyForm.planModules,
          },
        });
        if (fnError) throw new Error(fnError.message || 'Erro ao criar usuário admin');
        if (result?.error) throw new Error(result.error);
      }

      toast.success('Empresa criada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['all-companies'] });
      setNewCompanyOpen(false);
      resetCompanyForm();
      setSelectedCompanyId(newCompany.id);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar empresa');
    } finally {
      setCreatingCompany(false);
    }
  };

  const resetCompanyForm = () => {
    setCompanyForm({ name: '', cnpj: '', planModules: ['financeiro', 'crm', 'relatorios'] });
    setAdminForm({ fullName: '', email: '', password: '' });
    setCrmMode(false);
    setCreateAdmin(false);
    setCrmSearch('');
  };

  // Create user for selected company
  const [creatingUser, setCreatingUser] = useState(false);
  const handleCreateUser = async () => {
    if (!selectedCompanyId) return;
    if (!userForm.fullName || !userForm.email || !userForm.password) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (!isPasswordStrong(userForm.password)) {
      toast.error('A senha não atende aos requisitos de segurança (8+ chars, maiúscula, minúscula, número)');
      return;
    }
    setCreatingUser(true);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('create-user-v2', {
        body: {
          email: userForm.email,
          password: userForm.password,
          fullName: userForm.fullName,
          companyId: selectedCompanyId,
          allowedModules: userForm.allowedModules,
        },
      });
      if (fnError) throw new Error(fnError.message || 'Erro ao criar usuário');
      if (result?.error) throw new Error(result.error);
      toast.success('Usuário criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['company-users', selectedCompanyId] });
      setAddUserOpen(false);
      setUserForm({ fullName: '', email: '', password: '', allowedModules: ['financeiro', 'crm', 'relatorios'] });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar usuário');
    } finally {
      setCreatingUser(false);
    }
  };

  // Edit user
  const openEditUser = (u: Profile) => {
    setEditingUser(u);
    setEditUserForm({ fullName: u.full_name || '', password: '', allowedModules: u.allowed_modules ?? [] });
    setShowEditPassword(false);
    setEditUserOpen(true);
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    if (!editUserForm.fullName.trim()) {
      toast.error('Nome completo é obrigatório');
      return;
    }
    if (editUserForm.password && !isPasswordStrong(editUserForm.password)) {
      toast.error('A senha não atende aos requisitos de segurança (8+ chars, maiúscula, minúscula, número)');
      return;
    }
    if (editUserForm.allowedModules.length === 0) {
      toast.error('Selecione pelo menos um módulo de acesso');
      return;
    }
    setSavingUser(true);
    try {
      const payload: Record<string, unknown> = {
        userId: editingUser.user_id,
        fullName: editUserForm.fullName,
        allowedModules: editUserForm.allowedModules,
      };
      if (editUserForm.password) payload.password = editUserForm.password;

      const { data: result, error: fnError } = await supabase.functions.invoke('create-user-v2', {
        body: payload,
      });
      if (fnError) throw new Error(fnError.message || 'Erro ao atualizar usuário');
      if (result?.error) throw new Error(result.error);
      toast.success('Usuário atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['company-users', selectedCompanyId] });
      setEditUserOpen(false);
      setEditingUser(null);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar usuário');
    } finally {
      setSavingUser(false);
    }
  };

  // Delete user
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('user_roles').delete().eq('user_id', userId);
      const { error } = await supabase.from('profiles').delete().eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users', selectedCompanyId] });
      toast.success('Usuário removido com sucesso!');
      setDeleteUserId(null);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover usuário'),
  });

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  const toggleModule = (modules: string[], key: string): string[] =>
    modules.includes(key) ? modules.filter((m) => m !== key) : [...modules, key];

  return (
    <div className="flex gap-6 h-full min-h-[600px]">
      {/* LEFT PANEL — Companies */}
      <div className="w-80 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Empresas Clientes
          </h3>
          <Button size="sm" onClick={() => setNewCompanyOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nova
          </Button>
        </div>

        {loadingCompanies ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : companies.length === 0 ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma empresa cadastrada
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {companies.map((company) => (
              <Card
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={cn(
                  'cursor-pointer transition-all border-border/50 hover:border-primary/50',
                  selectedCompanyId === company.id && 'border-primary bg-primary/5'
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-foreground truncate">{company.name}</p>
                        <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {company.cnpj
                          ? company.cnpj.replace(
                              /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                              '$1.$2.$3/$4-$5'
                            )
                          : 'CNPJ não informado'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          company.status === 'active'
                            ? 'border-primary/50 text-primary bg-primary/10'
                            : 'border-destructive/50 text-destructive bg-destructive/10'
                        )}
                      >
                        {company.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Switch
                        checked={company.status === 'active'}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(checked) =>
                          toggleStatus.mutate({ id: company.id, status: checked ? 'active' : 'inactive' })
                        }
                        className="scale-75"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT PANEL — Users of selected company */}
      <div className="flex-1 min-w-0">
        {!selectedCompany ? (
          <Card className="h-full border-dashed border-border/50">
            <CardContent className="h-full flex flex-col items-center justify-center text-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Selecione uma empresa para gerenciar seus usuários</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    {selectedCompany.name}
                  </CardTitle>
                  <CardDescription>
                    Usuários com acesso a esta empresa
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setAddUserOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5 mr-1" />
                  Adicionar Usuário
                </Button>
              </div>

              {/* Plan modules */}
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedCompany.plan_modules?.map((m) => (
                  <Badge key={m} variant="secondary" className="text-xs capitalize">
                    {MODULE_OPTIONS.find((o) => o.key === m)?.label || m}
                  </Badge>
                ))}
              </div>
            </CardHeader>

            <CardContent>
              {loadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : companyUsers.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Nenhum usuário cadastrado para esta empresa
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Módulos</TableHead>
                      <TableHead>Criado em</TableHead>
                         <TableHead className="w-[90px]">Ações</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {companyUsers.map((u) => (
                       <TableRow key={u.id}>
                         <TableCell className="font-medium">{u.full_name || '-'}</TableCell>
                         <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                         <TableCell>
                           <div className="flex flex-wrap gap-1">
                             {(u.allowed_modules as string[] || []).map((m) => (
                               <Badge key={m} variant="secondary" className="text-xs">
                                 {MODULE_OPTIONS.find((o) => o.key === m)?.label || m}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(u.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-1">
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => openEditUser(u)}
                               className="text-muted-foreground hover:text-primary"
                               title="Editar usuário"
                             >
                               <Pencil className="w-4 h-4" />
                             </Button>
                             <Button
                               variant="ghost"
                               size="icon"
                               onClick={() => setDeleteUserId(u.user_id)}
                               className="text-muted-foreground hover:text-destructive"
                               disabled={u.user_id === user?.id}
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
          </Card>
        )}
      </div>

      {/* MODAL — Nova Empresa */}
      <Dialog open={newCompanyOpen} onOpenChange={(o) => { setNewCompanyOpen(o); if (!o) resetCompanyForm(); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Empresa Cliente</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* CRM Import Toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <Switch
                checked={crmMode}
                onCheckedChange={setCrmMode}
                id="crm-mode"
              />
              <Label htmlFor="crm-mode" className="cursor-pointer">
                Importar dados de cliente existente no CRM
              </Label>
            </div>

            {/* CRM Search */}
            {crmMode && (
              <div className="space-y-2">
                <Label>Buscar no CRM</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Nome ou CNPJ..."
                    className="pl-9"
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                  />
                </div>
                {filteredCrm.length > 0 && (
                  <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
                    {filteredCrm.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm border-b border-border last:border-0"
                        onClick={() => {
                          setCompanyForm((prev) => ({
                            ...prev,
                            name: c.name,
                            cnpj: c.document
                              ? c.document.replace(
                                  /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                                  '$1.$2.$3/$4-$5'
                                )
                              : '',
                          }));
                          setCrmSearch('');
                        }}
                      >
                        <p className="font-medium">{c.name}</p>
                        <p className="text-muted-foreground text-xs">{c.document || 'Sem CNPJ'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Company fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome da Empresa *</Label>
                <Input
                  placeholder="Ex: Empresa ABC Ltda"
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  placeholder="00.000.000/0000-00"
                  value={companyForm.cnpj}
                  onChange={(e) =>
                    setCompanyForm((p) => ({ ...p, cnpj: maskCNPJ(e.target.value) }))
                  }
                  maxLength={18}
                />
              </div>

              <div className="space-y-2">
                <Label>Módulos do Plano</Label>
                <div className="flex flex-wrap gap-3">
                  {MODULE_OPTIONS.map((m) => (
                    <div key={m.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`plan-${m.key}`}
                        checked={companyForm.planModules.includes(m.key)}
                        onCheckedChange={() =>
                          setCompanyForm((p) => ({
                            ...p,
                            planModules: toggleModule(p.planModules, m.key),
                          }))
                        }
                      />
                      <Label htmlFor={`plan-${m.key}`} className="cursor-pointer font-normal">
                        {m.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Create admin toggle */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={createAdmin}
                  onCheckedChange={setCreateAdmin}
                  id="create-admin"
                />
                <Label htmlFor="create-admin" className="cursor-pointer">
                  Criar usuário administrador agora
                </Label>
              </div>

              {createAdmin && (
                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                  <div className="space-y-1.5">
                    <Label>Nome Completo *</Label>
                    <Input
                      placeholder="João Silva"
                      value={adminForm.fullName}
                      onChange={(e) => setAdminForm((p) => ({ ...p, fullName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      placeholder="joao@empresa.com"
                      value={adminForm.email}
                      onChange={(e) => setAdminForm((p) => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Senha Provisória *</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Mínimo 8 caracteres"
                        value={adminForm.password}
                        onChange={(e) => setAdminForm((p) => ({ ...p, password: e.target.value }))}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={adminForm.password} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setNewCompanyOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateCompany} disabled={creatingCompany}>
                {creatingCompany && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Empresa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL — Adicionar Usuário à Empresa */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              Adicionar Usuário — {selectedCompany?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome Completo *</Label>
              <Input
                placeholder="Maria Souza"
                value={userForm.fullName}
                onChange={(e) => setUserForm((p) => ({ ...p, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="maria@empresa.com"
                value={userForm.email}
                onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Senha Provisória *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  value={userForm.password}
                  onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength password={userForm.password} />
            </div>

            <div className="space-y-2">
              <Label>Módulos de Acesso</Label>
              <div className="flex flex-wrap gap-3">
                {MODULE_OPTIONS.map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`user-mod-${m.key}`}
                      checked={userForm.allowedModules.includes(m.key)}
                      onCheckedChange={() =>
                        setUserForm((p) => ({
                          ...p,
                          allowedModules: toggleModule(p.allowedModules, m.key),
                        }))
                      }
                    />
                    <Label htmlFor={`user-mod-${m.key}`} className="cursor-pointer font-normal">
                      {m.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setAddUserOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateUser} disabled={creatingUser}>
                {creatingUser && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Usuário
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ALERT — Delete user */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este usuário? O acesso ao sistema será removido imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserId && deleteUser.mutate(deleteUserId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL — Editar Usuário */}
      <Dialog open={editUserOpen} onOpenChange={(o) => { setEditUserOpen(o); if (!o) setEditingUser(null); }}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário — {editingUser?.full_name || editingUser?.email}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome Completo *</Label>
              <Input
                placeholder="Nome completo"
                value={editUserForm.fullName}
                onChange={(e) => setEditUserForm((p) => ({ ...p, fullName: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Nova Senha (deixe em branco para manter)</Label>
              <div className="relative">
                <Input
                  type={showEditPassword ? 'text' : 'password'}
                  placeholder="Deixe em branco para manter"
                  value={editUserForm.password}
                  onChange={(e) => setEditUserForm((p) => ({ ...p, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {editUserForm.password && <PasswordStrength password={editUserForm.password} />}
            </div>

            <div className="space-y-2">
              <Label>Módulos de Acesso *</Label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 bg-muted/30">
                {MODULE_OPTIONS.map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`edit-mod-${m.key}`}
                      checked={editUserForm.allowedModules.includes(m.key)}
                      onCheckedChange={() =>
                        setEditUserForm((p) => ({
                          ...p,
                          allowedModules: toggleModule(p.allowedModules, m.key),
                        }))
                      }
                    />
                    <Label htmlFor={`edit-mod-${m.key}`} className="cursor-pointer font-normal text-sm">
                      {m.label}
                      {m.soon && (
                        <Badge variant="outline" className="ml-1 text-xs px-1 py-0 h-4">Em breve</Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditUserOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleEditUser} disabled={savingUser}>
                {savingUser && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

