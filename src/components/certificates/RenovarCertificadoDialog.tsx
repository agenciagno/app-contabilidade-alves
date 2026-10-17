import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { CertificateRow, titularLabel, useSalvarCertificado } from '@/hooks/useCertificates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate: CertificateRow | null;
}

/** Nome do arquivo no storage: sem acento, espaço nem símbolo (a chave do Supabase recusa). O nome original fica em anexo_file_name. */
function nomeSeguro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
}

export function RenovarCertificadoDialog({ open, onOpenChange, certificate }: Props) {
  const salvar = useSalvarCertificado();
  const [dataRenovacao, setDataRenovacao] = useState('');
  const [novaValidade, setNovaValidade] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cada abertura começa com a data de hoje, sem validade e sem arquivo.
  useEffect(() => {
    if (open) {
      setDataRenovacao(format(new Date(), 'yyyy-MM-dd'));
      setNovaValidade('');
      setFile(null);
    }
  }, [open]);

  if (!certificate) return null;

  const venceu = format(new Date(`${certificate.data_validade}T00:00:00`), 'dd/MM/yyyy');

  const handleConfirm = async () => {
    if (!dataRenovacao) {
      toast.error('Informe a data da renovação.');
      return;
    }
    if (!novaValidade) {
      toast.error('Informe a nova validade.');
      return;
    }
    if (novaValidade <= dataRenovacao) {
      toast.error('A nova validade precisa ser depois da data da renovação.');
      return;
    }
    setSaving(true);
    let path: string | null = null;
    try {
      // O arquivo sobe antes e a renovação grava tudo numa chamada só: se a renovação falhar, nada fica pela metade
      // (renovar de novo geraria um segundo registro ativo) e o arquivo enviado é removido logo abaixo.
      if (file) {
        path = `${certificate.contact_id}/certificado-${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
        const { error: upErr } = await supabase.storage.from('contact-documents').upload(path, file);
        if (upErr) throw upErr;
      }
      await salvar.mutateAsync({
        renovar_de_id: certificate.id,
        contact_id: certificate.contact_id,
        tipo_pessoa: certificate.tipo_pessoa,
        modelo: certificate.modelo,
        data_emissao: dataRenovacao,
        data_validade: novaValidade,
        ...(file && path ? { anexo_url: path, anexo_file_name: file.name, anexo_size: file.size } : {}),
      });
      toast.success('Certificado renovado.');
      onOpenChange(false);
    } catch (e: any) {
      if (path) await supabase.storage.from('contact-documents').remove([path]);
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
            <Label className="text-ink">Data da renovação <span className="text-danger">*</span></Label>
            <DateField value={dataRenovacao} onChange={setDataRenovacao} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Nova validade <span className="text-danger">*</span></Label>
            <DateField value={novaValidade} onChange={setNovaValidade} min={certificate.data_validade} />
          </div>

          <div className="space-y-1.5">
            <Label className="block text-ink">Arquivo do novo certificado</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pfx,.p12,.pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="min-w-0 max-w-full justify-start" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{file ? file.name : 'Anexar arquivo (.pfx)'}</span>
              </Button>
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Tirar arquivo"
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-meta text-muted-ink-2">
              {file
                ? 'Este arquivo vira o comprovante do certificado renovado, no lugar do anterior.'
                : certificate.anexo_file_name
                  ? `Atual: ${certificate.anexo_file_name}. Sem novo arquivo, o certificado renovado fica sem anexo.`
                  : 'Opcional. Dá para anexar depois, em Editar.'}
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving || !dataRenovacao || !novaValidade}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Renovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
