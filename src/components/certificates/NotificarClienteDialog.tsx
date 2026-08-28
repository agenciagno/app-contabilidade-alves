import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CertificateRow, titularLabel, useCertificateNotifications,
  useNotificarClientePorEmail, useRegistrarNotificacaoLocal,
} from '@/hooks/useCertificates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate: CertificateRow | null;
}

function mensagemPadrao(cert: CertificateRow): string {
  const validade = format(new Date(`${cert.data_validade}T00:00:00`), 'dd/MM/yyyy');
  return `Olá! Identificamos que o certificado digital ${cert.modelo} da ${titularLabel(cert)} vence em ${validade}. Para evitar interrupções nos serviços, recomendamos agendar a renovação com antecedência. Qualquer dúvida, estamos à disposição.`;
}

const CANAL_LABEL: Record<string, string> = { email: 'E-mail', whatsapp: 'WhatsApp', copiar: 'Copiado' };

export function NotificarClienteDialog({ open, onOpenChange, certificate }: Props) {
  const [mensagem, setMensagem] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const { data: historico = [], isLoading: loadingHistorico } = useCertificateNotifications(certificate?.id);
  const enviarEmail = useNotificarClientePorEmail();
  const registrarLocal = useRegistrarNotificacaoLocal();

  useEffect(() => {
    if (open && certificate) setMensagem(mensagemPadrao(certificate));
  }, [open, certificate]);

  if (!certificate) return null;

  const destinoWhatsapp = certificate.contacts?.whatsapp || certificate.contacts?.phone;
  const destinoEmail = certificate.contacts?.email;

  const handleCopiar = async () => {
    await navigator.clipboard.writeText(mensagem);
    toast.success('Mensagem copiada.');
    registrarLocal.mutate({ certificate_id: certificate.id, company_id: certificate.company_id, canal: 'copiar', mensagem });
  };

  const handleWhatsapp = () => {
    if (!destinoWhatsapp) {
      toast.error('Cliente sem WhatsApp/telefone cadastrado.');
      return;
    }
    const numero = destinoWhatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`, '_blank');
    registrarLocal.mutate({ certificate_id: certificate.id, company_id: certificate.company_id, canal: 'whatsapp', destino: destinoWhatsapp, mensagem });
  };

  const handleEmail = async () => {
    if (!destinoEmail) {
      toast.error('Cliente sem e-mail cadastrado.');
      return;
    }
    setEnviandoEmail(true);
    try {
      await enviarEmail.mutateAsync({
        certificate_id: certificate.id,
        assunto: `Certificado Digital — vencimento em ${format(new Date(`${certificate.data_validade}T00:00:00`), 'dd/MM/yyyy')}`,
        mensagem,
      });
      toast.success('E-mail enviado ao cliente.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar e-mail.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">Notificar Cliente</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-ink">Mensagem</Label>
            <Textarea rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="font-mono text-[13px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={handleCopiar}>Copiar</Button>
            <Button variant="outline" onClick={handleWhatsapp}>Abrir WhatsApp</Button>
            <Button variant="outline" onClick={handleEmail} disabled={enviandoEmail}>
              {enviandoEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar por E-mail'}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Notificações enviadas</Label>
            {loadingHistorico ? (
              <Skeleton className="h-10 w-full" />
            ) : historico.length === 0 ? (
              <p className="text-meta text-muted-ink-2">Nenhuma notificação enviada ainda.</p>
            ) : (
              <div className="space-y-1">
                {historico.map((h) => (
                  <p key={h.id} className="text-meta text-muted-ink-2">
                    {CANAL_LABEL[h.canal] ?? h.canal} · {format(new Date(h.enviado_em), 'dd/MM/yyyy')}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
