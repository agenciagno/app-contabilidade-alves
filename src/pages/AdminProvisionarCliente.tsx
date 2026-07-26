import { useMemo, useState, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Copy, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { maskCPFCNPJ, maskPhone, unmaskPhone, getDocumentType } from '@/lib/utils';

function cleanDocument(v: string): string {
  return v.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

interface ProvisionResponse {
  provisional_password?: string;
  error?: string;
}

export default function AdminProvisionarCliente() {
  const { isSuperAdmin, isLoading } = useUserRole();

  const [document, setDocument] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [successOpen, setSuccessOpen] = useState(false);
  const [provisionalPassword, setProvisionalPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const documentType = getDocumentType(document);

  // Confere se o CNPJ/CPF já existe na base de contatos da própria CA (cliente já atendido
  // pelo escritório) — só pra mostrar aviso, não bloqueia nem altera o provisionamento.
  const { data: existingContacts } = useQuery({
    queryKey: ['contacts-document-check-provisionar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('id, name, document');
      if (error) throw error;
      return data ?? [];
    },
  });

  const matchedContact = useMemo(() => {
    const clean = cleanDocument(document);
    if (clean.length !== 11 && clean.length !== 14) return null;
    return existingContacts?.find((c) => cleanDocument(c.document || '') === clean) ?? null;
  }, [document, existingContacts]);

  if (isLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const handleLookup = async () => {
    // Mantém letras — CNPJ alfanumérico (IN RFB 2.229/2024, novas inscrições a partir de 31/07/2026)
    const clean = cleanDocument(document);
    if (clean.length !== 14) {
      toast.error('Informe um CNPJ completo (14 caracteres) para busca.');
      return;
    }
    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
        body: { cnpj: clean },
      });
      if (error) throw new Error(error.message || 'Falha ao consultar CNPJ.');
      if (!data || (data as any).error) {
        throw new Error((data as any)?.error || 'CNPJ não encontrado.');
      }
      const result = data as { razao_social?: string | null; phone?: string | null; email?: string | null };
      if (result.razao_social) setName(result.razao_social);
      if (result.phone) setPhone(maskPhone(result.phone));
      if (result.email && !companyEmail) setCompanyEmail(result.email);
      toast.success('Dados do CNPJ preenchidos.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao buscar CNPJ.');
    } finally {
      setLookingUp(false);
    }
  };

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanDocument(document);
    if (clean.length !== 11 && clean.length !== 14) return toast.error('CPF/CNPJ inválido.');
    if (!name.trim()) return toast.error('Informe o nome da empresa.');
    if (companyEmail.trim() && !isValidEmail(companyEmail)) return toast.error('E-mail da empresa inválido.');
    if (!adminName.trim()) return toast.error('Informe o nome do admin.');
    if (!isValidEmail(adminEmail)) return toast.error('E-mail do admin inválido.');

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-tenant', {
        body: {
          cnpj: clean,
          name: name.trim(),
          phone: unmaskPhone(phone) || null,
          email: companyEmail.trim() || undefined,
          admin_email: adminEmail.trim(),
          admin_name: adminName.trim(),
        },
      });

      let payload = data as ProvisionResponse | null;
      if (error) {
        let msg = error.message || 'Falha ao cadastrar cliente.';
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } catch {
            // ignora
          }
        }
        throw new Error(msg);
      }
      if (!payload || payload.error) {
        throw new Error(payload?.error || 'Falha ao cadastrar cliente.');
      }
      if (!payload.provisional_password) {
        throw new Error('Resposta sem senha provisória.');
      }

      setProvisionalPassword(payload.provisional_password);
      setSuccessOpen(true);
      setCopied(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao cadastrar cliente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    const text = `E-mail: ${adminEmail.trim()} | Senha provisória: ${provisionalPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Credenciais copiadas.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const resetForm = () => {
    setDocument('');
    setName('');
    setPhone('');
    setCompanyEmail('');
    setAdminName('');
    setAdminEmail('');
    setProvisionalPassword('');
    setCopied(false);
  };

  return (
    <div className="min-h-screen flex items-start justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Cadastrar Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="document" className="flex items-center">
                  CPF/CNPJ *
                  {documentType && (
                    <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                      {documentType === 'CPF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                    </Badge>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="document"
                    value={document}
                    onChange={(e) => setDocument(maskCPFCNPJ(e.target.value))}
                    placeholder="CNPJ ou CPF"
                    maxLength={18}
                  />
                  {documentType !== 'CPF' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleLookup}
                      disabled={lookingUp || cleanDocument(document).length < 14}
                    >
                      {lookingUp ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      <span className="ml-2">Buscar</span>
                    </Button>
                  )}
                </div>
                {matchedContact && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Esse documento já está cadastrado como contato na nossa base: <strong>{matchedContact.name}</strong>.
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome da empresa *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-email">E-mail da empresa</Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="contato@empresa.com"
                  />
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold mb-3">
                  Primeiro acesso (Admin do cliente)
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-name">Nome do admin *</Label>
                    <Input
                      id="admin-name"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      maxLength={200}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-email">E-mail do admin *</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      maxLength={255}
                      required
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Cadastrar cliente
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={successOpen}
        onOpenChange={(open) => {
          setSuccessOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cliente provisionado</DialogTitle>
            <DialogDescription>
              Envie as credenciais abaixo ao administrador do cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">
                {adminEmail}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Senha provisória</Label>
              <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">
                {provisionalPassword}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O admin será obrigado a trocar a senha no primeiro acesso.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={handleCopy}>
              {copied ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              Copiar credenciais
            </Button>
            <Button type="button" onClick={() => setSuccessOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
