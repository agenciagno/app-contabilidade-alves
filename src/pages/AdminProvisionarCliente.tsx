import { useState, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Search, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { maskCNPJ, maskPhone, unmaskPhone } from '@/lib/utils';

interface ProvisionResponse {
  provisional_password?: string;
  error?: string;
}

export default function AdminProvisionarCliente() {
  const { isSuperAdmin, isLoading } = useUserRole();

  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [successOpen, setSuccessOpen] = useState(false);
  const [provisionalPassword, setProvisionalPassword] = useState('');
  const [copied, setCopied] = useState(false);

  if (isLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const handleLookup = async () => {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) {
      toast.error('CNPJ inválido. Informe 14 dígitos.');
      return;
    }
    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
        body: { cnpj: digits },
      });
      if (error) throw new Error(error.message || 'Falha ao consultar CNPJ.');
      if (!data || (data as any).error) {
        throw new Error((data as any)?.error || 'CNPJ não encontrado.');
      }
      const result = data as { razao_social?: string | null; phone?: string | null };
      if (result.razao_social) setName(result.razao_social);
      if (result.phone) setPhone(maskPhone(result.phone));
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
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return toast.error('CNPJ inválido.');
    if (!name.trim()) return toast.error('Informe o nome da empresa.');
    if (!adminName.trim()) return toast.error('Informe o nome do admin.');
    if (!isValidEmail(adminEmail)) return toast.error('E-mail do admin inválido.');

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-tenant', {
        body: {
          cnpj: digits,
          name: name.trim(),
          phone: unmaskPhone(phone) || null,
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
      toast.error(err?.message ?? 'Erro ao provisionar cliente.');
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
    setCnpj('');
    setName('');
    setPhone('');
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
                <Label htmlFor="cnpj">CNPJ *</Label>
                <div className="flex gap-2">
                  <Input
                    id="cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    maxLength={18}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLookup}
                    disabled={lookingUp}
                  >
                    {lookingUp ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="ml-2">Buscar</span>
                  </Button>
                </div>
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

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                />
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
