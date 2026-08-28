import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ds';
import { CertificateRow, titularLabel, useSalvarCertificado } from '@/hooks/useCertificates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate: CertificateRow | null;
}

export function RenovarCertificadoDialog({ open, onOpenChange, certificate }: Props) {
  const salvar = useSalvarCertificado();
  const [novaValidade, setNovaValidade] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNovaValidade('');
  }, [open]);

  if (!certificate) return null;

  const hoje = format(new Date(), 'dd/MM/yyyy');
  const venceu = format(new Date(`${certificate.data_validade}T00:00:00`), 'dd/MM/yyyy');

  const handleConfirm = async () => {
    if (!novaValidade) {
      toast.error('Informe a nova validade.');
      return;
    }
    setSaving(true);
    try {
      await salvar.mutateAsync({
        renovar_de_id: certificate.id,
        contact_id: certificate.contact_id,
        tipo_pessoa: certificate.tipo_pessoa,
        modelo: certificate.modelo,
        data_validade: novaValidade,
      });
      toast.success('Certificado renovado.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao renovar certificado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">Renovar Certificado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="text-ui text-ink">{titularLabel(certificate)}</p>
            <p className="text-meta text-muted-ink-2">
              {certificate.modelo} · {certificate.autoridade_certificadora || 'Autoridade não informada'} · venceu em {venceu}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Data da renovação</Label>
            <div className="flex h-10 items-center rounded-sm border border-line bg-bg-2 px-3 text-ui text-muted-ink-2">
              {hoje} (hoje)
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Nova validade <span className="text-danger">*</span></Label>
            <DateField value={novaValidade} onChange={setNovaValidade} min={certificate.data_validade} />
          </div>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving || !novaValidade}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Renovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
