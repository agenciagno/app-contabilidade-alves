import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Eye, EyeOff, Upload, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  AcessoPortal,
  PORTAL_OPTIONS,
  PortalTipo,
  useSalvarAcesso,
} from '@/hooks/useAcessosCliente';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactId: string;
  acesso?: AcessoPortal | null;
  /** Quando true, o portal é fixado em certificado_digital e o seletor de portal fica oculto. */
  lockCertificado?: boolean;
}

export function AcessoFormDialog({ open, onOpenChange, contactId, acesso, lockCertificado }: Props) {
  const isEdit = !!acesso;
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const [portal, setPortal] = useState<PortalTipo>('gov_br');
  const [portalLabel, setPortalLabel] = useState('');
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [validade, setValidade] = useState<Date | undefined>(undefined);
  const [observacao, setObservacao] = useState('');
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const salvar = useSalvarAcesso();

  useEffect(() => {
    if (open) {
      setPortal(lockCertificado ? 'certificado_digital' : ((acesso?.portal as PortalTipo) ?? 'gov_br'));
      setPortalLabel(acesso?.portal_label ?? '');
      setLogin(acesso?.login ?? '');
      setSenha('');
      setShowSenha(false);
      setValidade(acesso?.validade_certificado ? new Date(acesso.validade_certificado + 'T00:00:00') : undefined);
      setObservacao(acesso?.observacao ?? '');
      setAnexoFile(null);
    }
  }, [open, acesso, lockCertificado]);

  const isCertificado = portal === 'certificado_digital';

  const handleSubmit = async () => {
    if (!isEdit && !senha) {
      toast.error('Informe a senha.');
      return;
    }
    try {
      const data = await salvar.mutateAsync({
        acesso_id: acesso?.id,
        contact_id: contactId,
        portal,
        portal_label: portalLabel || null,
        login: login || null,
        senha: senha || undefined,
        validade_certificado: validade ? format(validade, 'yyyy-MM-dd') : null,
        observacao: observacao || null,
      });

      // Upload do anexo (apenas certificados) — após salvar para garantir ID
      if (isCertificado && anexoFile) {
        setUploading(true);
        const acessoId = (data as any)?.id ?? acesso?.id;
        if (acessoId) {
          const path = `${contactId}/certificado-${acessoId}-${Date.now()}-${anexoFile.name}`;
          const { error: upErr } = await supabase.storage
            .from('contact-documents').upload(path, anexoFile);
          if (upErr) {
            toast.error('Acesso salvo, mas falhou o upload do anexo.');
          } else {
            await supabase.from('acessos_portais')
              .update({ anexo_url: path } as any)
              .eq('id', acessoId);
          }
        }
        setUploading(false);
      }

      qc.invalidateQueries({ queryKey: ['acessos-portais', contactId] });
      toast.success('Acesso salvo com segurança');
      onOpenChange(false);
    } catch (e: any) {
      setUploading(false);
      toast.error(e?.message ?? 'Falha ao salvar acesso.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? (isCertificado ? 'Editar certificado' : 'Editar acesso')
              : (isCertificado ? 'Adicionar Certificado' : 'Adicionar acesso')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!lockCertificado && (
            <div className="space-y-2">
              <Label>Portal</Label>
              <Select value={portal} onValueChange={(v) => setPortal(v as PortalTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PORTAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 1. Rótulo / descrição */}
          <div className="space-y-2">
            <Label>Rótulo / descrição</Label>
            <Input
              value={portalLabel}
              onChange={(e) => setPortalLabel(e.target.value)}
              placeholder={isCertificado ? 'Ex: Certificado A1 2025' : 'Ex: Prefeitura de BH'}
            />
          </div>

          {/* 2. Login (apenas se faz sentido para o portal) */}
          <div className="space-y-2">
            <Label>Login / Usuário</Label>
            <Input value={login} onChange={(e) => setLogin(e.target.value)} />
          </div>

          {/* 3. Senha (cofre) */}
          <div className="space-y-2">
            <Label>Senha</Label>
            <div className="relative">
              <Input
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={isEdit ? 'Deixe em branco para manter a atual' : ''}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSenha((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* 4. Validade (sempre disponível para certificado; opcional para outros) */}
          {isCertificado && (
            <div className="space-y-2">
              <Label>Validade / vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !validade && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {validade ? format(validade, 'dd/MM/yyyy') : 'Selecione uma data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={validade}
                    onSelect={setValidade}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* 5. Observação */}
          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
            />
          </div>

          {/* 6. Anexo (apenas certificado) */}
          {isCertificado && (
            <div className="space-y-2">
              <Label>Anexo (PDF ou imagem)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.pfx,.p12"
                className="hidden"
                onChange={(e) => setAnexoFile(e.target.files?.[0] || null)}
              />
              <Button variant="outline" type="button" className="w-full" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                {anexoFile ? anexoFile.name : (acesso?.anexo_url ? 'Substituir arquivo' : 'Selecionar arquivo')}
              </Button>
              {acesso?.anexo_url && !anexoFile && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> Arquivo já anexado
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={salvar.isPending || uploading}>
            {salvar.isPending || uploading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
