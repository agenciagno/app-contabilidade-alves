import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
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
  useBoletoNotifications, useNotificarClientePorEmailBoleto, useRegistrarNotificacaoLocalBoleto,
} from '@/hooks/useBoletoNotifications';
import type { BoletoWithContact } from '@/hooks/useBoletoControls';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boleto: BoletoWithContact | null;
}

const fmtBRL = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'dd/MM/yyyy'); } catch { return s; }
};

function mensagemPadrao(b: BoletoWithContact): string {
  const linhas = [
    `Olá! Segue sua cobrança no valor de ${fmtBRL(b.valor)}, com vencimento em ${fmtDate(b.data_vencimento)}.`,
  ];
  if (b.linha_digitavel) linhas.push(`Linha digitável: ${b.linha_digitavel}`);
  if (b.url_qrcode) linhas.push(`Pix copia e cola: ${b.url_qrcode}`);
  linhas.push('Qualquer dúvida, estamos à disposição.');
  return linhas.join('\n');
}

const CANAL_LABEL: Record<string, string> = { email: 'E-mail', whatsapp: 'WhatsApp', copiar: 'Copiado' };

export function NotificarCobrancaDialog({ open, onOpenChange, boleto }: Props) {
  const [mensagem, setMensagem] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const { data: historico = [], isLoading: loadingHistorico } = useBoletoNotifications(boleto?.id);
  const enviarEmail = useNotificarClientePorEmailBoleto();
  const registrarLocal = useRegistrarNotificacaoLocalBoleto();

  useEffect(() => {
    if (open && boleto) setMensagem(mensagemPadrao(boleto));
  }, [open, boleto]);

  if (!boleto) return null;

  const destinoWhatsapp = boleto.contact_whatsapp || boleto.contact_phone;
  const destinoEmail = boleto.contact_email;

  const handleCopiar = async () => {
    await navigator.clipboard.writeText(mensagem);
    toast.success('Mensagem copiada.');
    registrarLocal.mutate({ boleto_id: boleto.id, company_id: boleto.company_id, canal: 'copiar', mensagem });
  };

  const handleWhatsapp = () => {
    if (!destinoWhatsapp) {
      toast.error('Cliente sem WhatsApp/telefone cadastrado.');
      return;
    }
    const numero = destinoWhatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`, '_blank');
    registrarLocal.mutate({ boleto_id: boleto.id, company_id: boleto.company_id, canal: 'whatsapp', destino: destinoWhatsapp, mensagem });
  };

  const handleEmail = async () => {
    if (!destinoEmail) {
      toast.error('Cliente sem e-mail cadastrado.');
      return;
    }
    setEnviandoEmail(true);
    try {
      await enviarEmail.mutateAsync({
        boleto_id: boleto.id,
        assunto: `Cobrança — vencimento em ${fmtDate(boleto.data_vencimento)}`,
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
          <DialogTitle className="text-[16px]">Cobrança</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-ink">Mensagem</Label>
            <Textarea rows={6} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="font-mono text-[13px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={handleCopiar}>Copiar</Button>
            <Button variant="outline" onClick={handleWhatsapp}>Abrir WhatsApp</Button>
            <Button variant="outline" onClick={handleEmail} disabled={enviandoEmail}>
              {enviandoEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar por E-mail'}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Cobranças enviadas</Label>
            {loadingHistorico ? (
              <Skeleton className="h-10 w-full" />
            ) : historico.length === 0 ? (
              <p className="text-meta text-muted-ink-2">Nenhuma cobrança enviada ainda.</p>
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
