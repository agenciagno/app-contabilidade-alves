import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Separator } from '@/components/ui/separator';
import { Loader2, Upload, Building2, Trash2, History, Users, Building, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import UsersTab from '@/components/users/UsersTab';
import GlobalLogsTab from '@/components/settings/GlobalLogsTab';
import ClientCompaniesTab from '@/components/settings/ClientCompaniesTab';
import TrashTab from '@/components/settings/TrashTab';
import BackupTab from '@/components/settings/BackupTab';
import { useUserRole } from '@/hooks/useUserRole';

// Mask functions
const maskCNPJ = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
};

const maskPhone = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15);
};

const validateCNPJ = (cnpj: string): boolean => {
  const numbers = cnpj.replace(/\D/g, '');
  if (numbers.length !== 14) return false;
  if (/^(\d)\1+$/.test(numbers)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(numbers[i]) * weights1[i];
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(numbers[12]) !== digit1) return false;
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(numbers[i]) * weights2[i];
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  return parseInt(numbers[13]) === digit2;
};

const VALID_DDDS = [
  11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99,
];

const validatePhone = (phone: string): boolean => {
  const numbers = phone.replace(/\D/g, '');
  if (numbers.length === 0) return true;
  if (numbers.length < 10 || numbers.length > 11) return false;
  return VALID_DDDS.includes(parseInt(numbers.substring(0, 2)));
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { isSuperAdmin, isAdmin, isColaborador } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  const defaultTab = searchParams.get('tab') || 'empresa';

  useEffect(() => {
    async function fetchCompanyData() {
      if (!user) return;
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileData?.company_id) {
          setCompanyId(profileData.company_id);
          const { data: company } = await supabase
            .from('companies')
            .select('name, cnpj, phone, logo_url')
            .eq('id', profileData.company_id)
            .maybeSingle();

          if (company) {
            setCompanyName(company.name || '');
            setCnpj(company.cnpj || '');
            setPhone(company.phone || '');
            setLogoUrl(company.logo_url);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados da empresa:', error);
      } finally {
        setLoadingCompany(false);
      }
    }
    fetchCompanyData();
  }, [user]);

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCnpj(maskCNPJ(e.target.value));
    setCnpjError(null);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(maskPhone(e.target.value));
    setPhoneError(null);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    if (!file.type.startsWith('image/')) { toast.error('Por favor, selecione uma imagem'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('A imagem deve ter no máximo 2MB'); return; }
    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${companyId}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      const { error: updateError } = await supabase.from('companies').update({ logo_url: publicUrl }).eq('id', companyId);
      if (updateError) throw updateError;
      setLogoUrl(publicUrl + '?t=' + Date.now());
      toast.success('Logo atualizada com sucesso!');
    } catch (error) {
      toast.error('Erro ao fazer upload da logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!companyId || !logoUrl) return;
    setRemovingLogo(true);
    try {
      const { data: files } = await supabase.storage.from('company-logos').list('', { search: companyId });
      if (files && files.length > 0) {
        const fileToDelete = files.find(f => f.name.startsWith(companyId));
        if (fileToDelete) await supabase.storage.from('company-logos').remove([fileToDelete.name]);
      }
      const { error: updateError } = await supabase.from('companies').update({ logo_url: null }).eq('id', companyId);
      if (updateError) throw updateError;
      setLogoUrl(null);
      toast.success('Logo removida com sucesso!');
    } catch (error) {
      toast.error('Erro ao remover logo');
    } finally {
      setRemovingLogo(false);
    }
  };

  const handleSaveCompany = async () => {
    if (!user || !companyId) return;
    if (cnpj && !validateCNPJ(cnpj)) { setCnpjError('CNPJ inválido'); toast.error('CNPJ inválido.'); return; }
    if (phone && !validatePhone(phone)) { setPhoneError('DDD inválido'); toast.error('Telefone com DDD inválido.'); return; }
    setSavingCompany(true);
    try {
      const { error } = await supabase.from('companies').update({ name: companyName, cnpj, phone }).eq('id', companyId);
      if (error) throw error;
      toast.success('Dados da empresa atualizados com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar dados da empresa');
    } finally {
      setSavingCompany(false);
    }
  };

  // Build tabs based on role
  const tabs: { value: string; label: string; icon: React.ElementType }[] = [];
  if (!isColaborador) {
    tabs.push({ value: 'empresa', label: 'Dados da Empresa', icon: Building2 });
    tabs.push({ value: 'equipe', label: 'Minha Equipe', icon: Users });
  }
  if (!isColaborador) {
    tabs.push({ value: 'empresas', label: 'Empresas Clientes', icon: Building });
  }
  if (isSuperAdmin) {
    tabs.push({ value: 'logs', label: 'Logs Globais', icon: History });
  }
  if (!isColaborador) {
    tabs.push({ value: 'lixeira', label: 'Lixeira', icon: Trash2 });
  }
  if (isSuperAdmin) {
    tabs.push({ value: 'backup', label: 'Backup', icon: Database });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Gerencie a empresa e a equipe</p>
      </div>

      <Tabs defaultValue={tabs.some(t => t.value === defaultTab) ? defaultTab : tabs[0]?.value} className="w-full">
        <TabsList className="mb-6">
          {tabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Dados da Empresa */}
        <TabsContent value="empresa" className="space-y-6 mt-0">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Dados da Empresa</CardTitle>
                  <CardDescription>Informações da sua organização</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingCompany ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Logo */}
                  <div className="space-y-3">
                    <Label>Logo da Empresa</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/50">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo da empresa" className="w-full h-full object-contain" />
                        ) : (
                          <Building2 className="w-10 h-10 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo || removingLogo}>
                            {uploadingLogo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            {logoUrl ? 'Alterar Logo' : 'Enviar Logo'}
                          </Button>
                          {logoUrl && (
                            <Button variant="outline" onClick={handleRemoveLogo} disabled={removingLogo || uploadingLogo} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                              {removingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">PNG, JPG até 2MB</p>
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Nome da Empresa</Label>
                      <Input id="companyName" placeholder="Nome da empresa" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnpj">CNPJ</Label>
                      <Input id="cnpj" placeholder="00.000.000/0000-00" value={cnpj} onChange={handleCNPJChange} maxLength={18} className={cn(cnpjError && 'border-destructive focus-visible:ring-destructive')} />
                      {cnpjError && <p className="text-xs text-destructive">{cnpjError}</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" placeholder="(00) 00000-0000" value={phone} onChange={handlePhoneChange} maxLength={15} className={cn(phoneError && 'border-destructive focus-visible:ring-destructive')} />
                      {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
                    </div>
                  </div>

                  <Button onClick={handleSaveCompany} disabled={savingCompany}>
                    {savingCompany && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Salvar Alterações
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Minha Equipe */}
        <TabsContent value="equipe" className="mt-0">
          {companyId && user && (
            <UsersTab companyId={companyId} currentUserId={user.id} />
          )}
        </TabsContent>

        {/* Empresas Clientes */}
        {!isColaborador && (
          <TabsContent value="empresas" className="mt-0">
            <ClientCompaniesTab />
          </TabsContent>
        )}

        {/* Logs Globais */}
        {isSuperAdmin && (
          <TabsContent value="logs" className="mt-0">
            <GlobalLogsTab />
          </TabsContent>
        )}

        {/* Lixeira */}
        <TabsContent value="lixeira" className="mt-0">
          <TrashTab />
        </TabsContent>

        {/* Backup */}
        {isSuperAdmin && (
          <TabsContent value="backup" className="mt-0">
            <BackupTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
