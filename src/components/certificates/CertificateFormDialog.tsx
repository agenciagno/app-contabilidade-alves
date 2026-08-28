import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateField, segmentedListClass, segmentedTriggerClass } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  CertificateRow, Modelo, TipoPessoa,
  useContactsForCertificado, usePartnersForCertificado, useSalvarCertificado,
} from '@/hooks/useCertificates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate?: CertificateRow | null;
}

export function CertificateFormDialog({ open, onOpenChange, certificate }: Props) {
  const isEditing = !!certificate;
  const { data: contacts = [] } = useContactsForCertificado();
  const { data: partners = [] } = usePartnersForCertificado();
  const salvar = useSalvarCertificado();

  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>('PJ');
  const [contactId, setContactId] = useState('');
  const [socioNome, setSocioNome] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [modelo, setModelo] = useState<Modelo>('A1');
  const [autoridade, setAutoridade] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [socioOpen, setSocioOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (certificate) {
      setTipoPessoa(certificate.tipo_pessoa);
      setContactId(certificate.contact_id);
      setPartnerId(certificate.partner_id ?? '');
      setSocioNome(certificate.contact_partners?.name ?? '');
      setModelo(certificate.modelo);
      setAutoridade(certificate.autoridade_certificadora ?? '');
      setDataEmissao(certificate.data_emissao ?? '');
      setDataValidade(certificate.data_validade);
      setObservacao(certificate.observacao ?? '');
    } else {
      setTipoPessoa('PJ');
      setContactId('');
      setPartnerId('');
      setSocioNome('');
      setModelo('A1');
      setAutoridade('');
      setDataEmissao('');
      setDataValidade('');
      setObservacao('');
    }
    setSenha('');
    setMostrarSenha(false);
    setFile(null);
  }, [open, certificate]);

  // Nomes distintos de sócios pro campo de busca — a mesma pessoa pode ser sócia em várias empresas.
  const nomesUnicos = Array.from(new Set(partners.map((p) => p.name))).sort();
  const empresasDoSocio = socioNome ? partners.filter((p) => p.name === socioNome) : [];

  const empresaSelecionada = contacts.find((c) => c.id === contactId);

  const handlePickSocio = (nome: string) => {
    setSocioNome(nome);
    setSocioOpen(false);
    const matches = partners.filter((p) => p.name === nome);
    if (matches.length === 1) {
      setPartnerId(matches[0].id);
      setContactId(matches[0].contact_id);
    } else {
      setPartnerId('');
      setContactId('');
    }
  };

  const canSubmit = tipoPessoa === 'PJ'
    ? !!contactId && !!dataValidade
    : !!partnerId && !!contactId && !!dataValidade;

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Preencha titular e data de validade.');
      return;
    }
    setSaving(true);
    try {
      const result = await salvar.mutateAsync({
        certificate_id: certificate?.id,
        contact_id: contactId,
        partner_id: tipoPessoa === 'PF' ? partnerId : null,
        tipo_pessoa: tipoPessoa,
        modelo,
        autoridade_certificadora: autoridade || null,
        data_emissao: dataEmissao || null,
        data_validade: dataValidade,
        observacao: observacao || null,
        senha: senha || undefined,
      });

      if (file) {
        const certId = result.id as string;
        if (certificate?.anexo_url) {
          await supabase.storage.from('contact-documents').remove([certificate.anexo_url]);
        }
        const path = `${contactId}/certificado-${certId}-${file.name}`;
        const { error: upErr } = await supabase.storage.from('contact-documents').upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        await salvar.mutateAsync({
          certificate_id: certId,
          contact_id: contactId,
          partner_id: tipoPessoa === 'PF' ? partnerId : null,
          tipo_pessoa: tipoPessoa,
          modelo,
          data_validade: dataValidade,
          anexo_url: path,
          anexo_file_name: file.name,
          anexo_size: file.size,
        });
      }

      toast.success(isEditing ? 'Certificado atualizado.' : 'Certificado cadastrado.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao salvar certificado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[17px]">{isEditing ? 'Editar Certificado' : 'Cadastrar Certificado'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <Tabs value={tipoPessoa} onValueChange={(v) => setTipoPessoa(v as TipoPessoa)}>
            <TabsList className={cn(segmentedListClass, 'w-full')}>
              <TabsTrigger value="PJ" className={cn(segmentedTriggerClass, 'flex-1')}>Pessoa Jurídica</TabsTrigger>
              <TabsTrigger value="PF" className={cn(segmentedTriggerClass, 'flex-1')}>Pessoa Física</TabsTrigger>
            </TabsList>
          </Tabs>

          {tipoPessoa === 'PJ' ? (
            <div className="space-y-1.5">
              <Label className="text-[11.5px] font-medium text-ink-2">Empresa <span className="text-danger">*</span></Label>
              <Popover open={empresaOpen} onOpenChange={setEmpresaOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="flex h-10 w-full items-center justify-between rounded-sm border border-line bg-paper px-3 text-left text-ui">
                    <span className={empresaSelecionada ? 'text-ink' : 'text-muted-ink-2'}>
                      {empresaSelecionada ? (empresaSelecionada.display_name || empresaSelecionada.name) : 'Selecione a empresa...'}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-ink-2" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar empresa..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
                      <CommandGroup>
                        {contacts.map((c) => (
                          <CommandItem key={c.id} value={c.display_name || c.name} onSelect={() => { setContactId(c.id); setEmpresaOpen(false); }}>
                            <Check className={cn('mr-2 h-4 w-4', contactId === c.id ? 'opacity-100' : 'opacity-0')} />
                            {c.display_name || c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11.5px] font-medium text-ink-2">Sócio <span className="text-danger">*</span></Label>
                <Popover open={socioOpen} onOpenChange={setSocioOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className="flex h-10 w-full items-center justify-between rounded-sm border border-line bg-paper px-3 text-left text-ui">
                      <span className={socioNome ? 'text-ink' : 'text-muted-ink-2'}>{socioNome || 'Buscar sócio pelo nome...'}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-ink-2" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar sócio..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>Nenhum sócio encontrado.</CommandEmpty>
                        <CommandGroup>
                          {nomesUnicos.map((nome) => (
                            <CommandItem key={nome} value={nome} onSelect={() => handlePickSocio(nome)}>
                              <Check className={cn('mr-2 h-4 w-4', socioNome === nome ? 'opacity-100' : 'opacity-0')} />
                              {nome}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {socioNome && (
                <div className="space-y-1.5">
                  <Label className="text-[11.5px] font-medium text-ink-2">Sócio de:</Label>
                  {empresasDoSocio.length === 0 ? (
                    <p className="text-meta text-muted-ink">Nenhum vínculo encontrado para este sócio.</p>
                  ) : (
                    <div className="space-y-2">
                      {empresasDoSocio.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPartnerId(p.id); setContactId(p.contact_id); }}
                          className={cn(
                            'flex h-10 w-full items-center rounded-sm border bg-paper px-3 text-left text-ui transition-colors',
                            partnerId === p.id ? 'border-[1.5px] border-action' : 'border-line hover:bg-bg-2',
                          )}
                        >
                          {(p.contacts?.display_name || p.contacts?.name || 'Empresa')}{p.cpf ? ` — ${p.cpf}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11.5px] font-medium text-ink-2">Modelo</Label>
              <Tabs value={modelo} onValueChange={(v) => setModelo(v as Modelo)}>
                <TabsList className={segmentedListClass}>
                  <TabsTrigger value="A1" className={segmentedTriggerClass}>A1</TabsTrigger>
                  <TabsTrigger value="A3" className={segmentedTriggerClass}>A3</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11.5px] font-medium text-ink-2">Autoridade Certificadora</Label>
              <Input value={autoridade} onChange={(e) => setAutoridade(e.target.value)} placeholder="Ex.: Serasa Experian" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11.5px] font-medium text-ink-2">Data de Emissão</Label>
              <DateField value={dataEmissao} onChange={setDataEmissao} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11.5px] font-medium text-ink-2">Data de Validade <span className="text-danger">*</span></Label>
              <DateField value={dataValidade} onChange={setDataValidade} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11.5px] font-medium text-ink-2">Senha do certificado</Label>
            <div className="relative">
              <Input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={isEditing ? 'Deixe em branco para manter a senha atual' : '••••••••'}
                className="pr-9"
              />
              <button type="button" onClick={() => setMostrarSenha((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-ink hover:text-ink">
                {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-meta text-muted-ink-2">Armazenada de forma criptografada.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11.5px] font-medium text-ink-2">Observação</Label>
            <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: certificado emitido em nome do sócio para uso na procuração digital." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11.5px] font-medium text-ink-2">Anexo (comprovante)</Label>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {file ? file.name : certificate?.anexo_file_name || 'Anexar comprovante'}
            </Button>
          </div>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Salvar alterações' : 'Salvar certificado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
