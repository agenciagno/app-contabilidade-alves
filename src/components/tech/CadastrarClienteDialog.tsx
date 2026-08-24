import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, Copy, Check, Link2, Ban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { maskCPFCNPJ, maskPhone, unmaskPhone, getDocumentType } from '@/lib/utils';
import { EmailField, isValidEmail, normalizeEmail } from './EmailField';
import { useInvalidateTenants, useTenants } from '@/hooks/useTenants';
import { PUBLIC_APP_URL } from '@/lib/environment';
import { EXTERNAL_MODULE_ALL_KEYS } from '@/constants/modules';
import { ModulosPickerTree, toggleModuloKey } from './ModulosPickerTree';

function cleanDocument(v: string): string {
  return v.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado com o id do cliente recém-criado, para abrir o detalhe dele. */
  onCreated?: (companyId: string) => void;
}

export function CadastrarClienteDialog({ open, onOpenChange, onCreated }: Props) {
  const invalidate = useInvalidateTenants();
  const { data: tenants } = useTenants();

  const [step, setStep] = useState<'dados' | 'modulos'>('dados');
  const [document, setDocument] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  // Pacote padrão pré-marcado — o admin herda exatamente os mesmos módulos da
  // empresa, os dois vêm desta mesma lista (pedido de Gabriel, 24/08).
  const [modulosSelecionados, setModulosSelecionados] = useState<string[]>(EXTERNAL_MODULE_ALL_KEYS);

  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const documentType = getDocumentType(document);
  const clean = cleanDocument(document);

  // Documento já é contato da base contábil da CA? Se sim, vincula o tenant a esse
  // contato (companies.contact_id) e reaproveita os dados dele — mais confiável que
  // a Receita, e é a base pro futuro switch "área interna × área externa" do cliente.
  const { data: existingContacts } = useQuery({
    queryKey: ['contacts-document-check-provisionar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('id, name, document, phone, email');
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const matchedContact = useMemo(() => {
    if (clean.length !== 11 && clean.length !== 14) return null;
    return existingContacts?.find((c) => cleanDocument(c.document || '') === clean) ?? null;
  }, [clean, existingContacts]);

  // Bloqueio real: o documento já é cliente externo. O UNIQUE do banco pega, mas o erro
  // chegava cru na tela — e não pegava a matriz, que está gravada com pontuação.
  const duplicatedTenant = useMemo(() => {
    if (clean.length !== 11 && clean.length !== 14) return null;
    return tenants?.find((t) => cleanDocument(t.cnpj || '') === clean) ?? null;
  }, [clean, tenants]);

  // Preenche a partir do contato só o que ainda está vazio — nunca sobrescreve o
  // que o operador já digitou.
  useEffect(() => {
    if (!matchedContact || duplicatedTenant) return;
    if (documentType === 'CPF') {
      setAdminName((prev) => prev || matchedContact.name);
    } else {
      setName((prev) => prev || matchedContact.name);
      if (matchedContact.email) setCompanyEmail((prev) => prev || matchedContact.email!);
    }
    if (matchedContact.phone) setPhone((prev) => prev || maskPhone(matchedContact.phone!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedContact, duplicatedTenant, documentType]);

  const reset = () => {
    setDocument(''); setName(''); setPhone(''); setCompanyEmail('');
    setAdminName(''); setAdminEmail(''); setCreated(null); setCopied(false);
    setStep('dados'); setModulosSelecionados(EXTERNAL_MODULE_ALL_KEYS);
  };

  const handleLookup = async () => {
    if (clean.length !== 14) {
      toast.error('Informe um CNPJ completo (14 caracteres) para busca.');
      return;
    }
    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', { body: { cnpj: clean } });
      if (error) throw new Error(error.message || 'Falha ao consultar CNPJ.');
      if (!data || (data as any).error) throw new Error((data as any)?.error || 'CNPJ não encontrado.');
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

  // Etapa 1 → 2: valida os dados e só então mostra o seletor de módulos.
  const avancar = (e: FormEvent) => {
    e.preventDefault();
    if (clean.length !== 11 && clean.length !== 14) return toast.error('CPF/CNPJ inválido.');
    if (duplicatedTenant) return toast.error(`Esse documento já é o cliente externo "${duplicatedTenant.name}".`);
    // CPF é pessoa física: não existe "empresa" — o registro do tenant usa o
    // próprio nome do admin, sem campo separado pra digitar de novo.
    if (documentType !== 'CPF') {
      if (!name.trim()) return toast.error('Informe o nome da empresa.');
      if (companyEmail.trim() && !isValidEmail(companyEmail)) return toast.error('E-mail da empresa inválido.');
    }
    if (!adminName.trim()) return toast.error('Informe o nome do admin.');
    if (!isValidEmail(adminEmail)) return toast.error('E-mail do admin inválido.');
    setStep('modulos');
  };

  // Etapa 2: cria o tenant com os módulos marcados. A empresa e o admin nascem
  // com exatamente o mesmo pacote — um array só, sem duplicar a lista.
  const handleSubmit = async () => {
    if (modulosSelecionados.length === 0) return toast.error('Marque pelo menos um módulo.');

    setSubmitting(true);
    try {
      const email = normalizeEmail(adminEmail);
      const { data, error } = await supabase.functions.invoke('provision-tenant', {
        body: {
          cnpj: clean,
          name: documentType === 'CPF' ? adminName.trim() : name.trim(),
          phone: unmaskPhone(phone) || null,
          email: documentType === 'CPF' || !companyEmail.trim() ? undefined : normalizeEmail(companyEmail),
          admin_email: email,
          admin_name: adminName.trim(),
          contact_id: matchedContact?.id,
          modules: modulosSelecionados,
        },
      });

      if (error) {
        let msg = error.message || 'Falha ao cadastrar cliente.';
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } catch { /* mantém a mensagem original */ }
        }
        throw new Error(msg);
      }
      const payload = data as { company_id?: string; provisional_password?: string; error?: string } | null;
      if (!payload || payload.error) throw new Error(payload?.error || 'Falha ao cadastrar cliente.');
      if (!payload.provisional_password || !payload.company_id) throw new Error('Resposta incompleta do servidor.');

      setCreated({ id: payload.company_id, email, password: payload.provisional_password });
      setCopied(false);
      invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao cadastrar cliente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(
        `Acesso: ${PUBLIC_APP_URL} | E-mail: ${created.email} | Senha provisória: ${created.password}`,
      );
      setCopied(true);
      toast.success('Credenciais copiadas.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const finish = () => {
    const id = created?.id;
    reset();
    onOpenChange(false);
    if (id) onCreated?.(id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Enquanto a senha provisória está na tela, só sai pelo botão — fechar por
        // engano aqui significava perder a senha, que não era reemitível.
        if (!o && created) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {created ? 'Cliente provisionado' : step === 'dados' ? 'Cadastrar cliente' : 'Módulos do cliente'}
          </DialogTitle>
          <DialogDescription>
            {created
              ? 'Copie as credenciais antes de fechar — a senha provisória não é exibida de novo.'
              : step === 'dados'
                ? 'Etapa 1 de 2 — dados do cliente e do primeiro acesso.'
                : 'Etapa 2 de 2 — o admin nasce com exatamente estes módulos.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Link de acesso</Label>
              <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">{PUBLIC_APP_URL}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">{created.email}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Senha provisória</Label>
              <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">{created.password}</div>
            </div>
            <p className="text-xs text-muted-foreground">
              O admin troca a senha obrigatoriamente no primeiro acesso. Se perder, dá para
              reemitir em Usuários → Reemitir senha.
            </p>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Copiar credenciais
              </Button>
              <Button type="button" onClick={finish}>Abrir cliente</Button>
            </DialogFooter>
          </div>
        ) : step === 'dados' ? (
          <form onSubmit={avancar} className="space-y-5">
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
                  <Button type="button" variant="outline" onClick={handleLookup} disabled={lookingUp || clean.length < 14}>
                    {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="ml-2">Buscar</span>
                  </Button>
                )}
              </div>

              {duplicatedTenant && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                  <Ban className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Esse documento já é cliente externo: <strong>{duplicatedTenant.name}</strong>. Abra o
                    cliente existente em vez de cadastrar de novo.
                  </span>
                </div>
              )}

              {!duplicatedTenant && matchedContact && (
                <div className="flex items-start gap-2 rounded-md border border-ok/30 bg-ok/10 p-2.5 text-xs text-ok">
                  <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Esse documento já é cliente contábil da CA: <strong>{matchedContact.name}</strong>. Os dados
                    dele preenchem o formulário e o cadastro fica vinculado a esse contato.
                  </span>
                </div>
              )}
            </div>

            {documentType !== 'CPF' && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome da empresa *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
              </div>
            )}

            <div className={documentType === 'CPF' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                />
              </div>
              {documentType !== 'CPF' && (
                <EmailField
                  id="company-email"
                  label="E-mail da empresa"
                  value={companyEmail}
                  onChange={setCompanyEmail}
                  placeholder="contato@empresa.com.br"
                />
              )}
            </div>

            <div className="pt-4 border-t space-y-4">
              <h3 className="text-sm font-semibold">Primeiro acesso (Admin do cliente)</h3>
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
              <EmailField
                id="admin-email"
                label="E-mail do admin"
                value={adminEmail}
                onChange={setAdminEmail}
                required
                placeholder="nome@empresa.com.br"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!!duplicatedTenant}>
                Avançar
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Define o que {documentType === 'CPF' ? adminName.trim() : name.trim()} enxerga. O admin nasce
              com exatamente estes módulos — não precisa configurar separado.
            </p>
            <div className="rounded-md border border-border p-3 max-h-[50vh] overflow-y-auto">
              <ModulosPickerTree
                selecionados={modulosSelecionados}
                onToggle={toggleModuloKey(setModulosSelecionados)}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setStep('dados')} disabled={submitting}>
                Voltar
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Cadastrar cliente
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
