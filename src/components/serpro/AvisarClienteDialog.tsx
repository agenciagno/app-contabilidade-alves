import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useAvisarCliente, useAvisosCaixa, type CanalAviso, type MensagemComCliente,
} from '@/hooks/useSerproCaixaPostal';

const CANAL_LABEL: Record<CanalAviso, string> = { email: 'E-mail', whatsapp: 'WhatsApp', copiar: 'Copiado' };

function textoPadrao(m: MensagemComCliente): string {
  const enviada = m.data_envio ? ` (enviada em ${format(new Date(m.data_envio), 'dd/MM/yyyy')})` : '';
  const prazo = m.data_validade ? ` O prazo informado é até ${format(new Date(`${m.data_validade}T00:00:00`), 'dd/MM/yyyy')}.` : '';
  return `Olá! Identificamos uma comunicação da Receita Federal para a sua empresa na Caixa Postal do e-CAC: "${m.assunto}"${enviada}.${prazo} Nossa equipe já está analisando e vai orientar os próximos passos. Se você recebeu algo parecido, por favor nos avise. Qualquer dúvida, estamos à disposição.`;
}

/**
 * Avisa o CLIENTE de uma mensagem da Receita. Leva só o texto abaixo (editável), nunca o corpo da intimação.
 * E-mail sai pelo servidor; WhatsApp abre no navegador de quem clicou; os dois ficam no histórico.
 */
export function AvisarClienteDialog({ mensagem, onClose }: { mensagem: MensagemComCliente | null; onClose: () => void }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisarCliente();
  const { data: avisos } = useAvisosCaixa();

  useEffect(() => { if (mensagem) setTexto(textoPadrao(mensagem)); }, [mensagem]);

  if (!mensagem) return null;
  const email = mensagem.contacts?.email ?? null;
  const fone = mensagem.contacts?.whatsapp || mensagem.contacts?.phone || null;
  const ultimo = avisos?.get(mensagem.id);

  const registrar = (canal: CanalAviso) =>
    avisar.mutateAsync({ mensagemId: mensagem.id, canal, mensagem: texto });

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    toast.success('Mensagem copiada.');
    registrar('copiar').catch(() => undefined);
  };

  const whatsapp = () => {
    if (!fone) { toast.error('Cliente sem WhatsApp/telefone cadastrado.'); return; }
    window.open(`https://wa.me/55${fone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`, '_blank');
    registrar('whatsapp').catch(() => toast.error('O WhatsApp abriu, mas o histórico não foi gravado.'));
  };

  const enviarEmail = async () => {
    if (!email) { toast.error('Cliente sem e-mail cadastrado.'); return; }
    setEnviando(true);
    try {
      const r = await avisar.mutateAsync({
        mensagemId: mensagem.id, canal: 'email', mensagem: texto, assunto: 'Comunicação da Receita Federal na Caixa Postal do e-CAC',
      });
      if (r?.error) throw new Error(r.error);
      toast.success('E-mail enviado ao cliente.');
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha ao enviar e-mail.');
    } finally {
      setEnviando(false);
    }
  };

  const nome = mensagem.contacts?.display_name || mensagem.contacts?.name || 'Cliente';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">Avisar cliente</DialogTitle>
          <p className="text-meta text-muted-ink">{nome}</p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-ink">Mensagem ao cliente</Label>
            <Textarea rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} className="text-[13px]" />
            <p className="text-meta text-muted-ink-2">Só este texto vai ao cliente. O conteúdo da intimação não é enviado.</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={copiar} disabled={!texto.trim()}>Copiar</Button>
            <Button variant="outline" onClick={whatsapp} disabled={!texto.trim() || !fone} title={fone ? undefined : 'Sem WhatsApp/telefone'}>
              Abrir WhatsApp
            </Button>
            <Button variant="outline" onClick={enviarEmail} disabled={!texto.trim() || !email || enviando} title={email ? undefined : 'Sem e-mail'}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar por E-mail'}
            </Button>
          </div>

          <p className="text-meta text-muted-ink-2">
            {ultimo
              ? `Último aviso: ${CANAL_LABEL[ultimo.canal] ?? ultimo.canal} em ${format(new Date(ultimo.enviado_em), 'dd/MM/yyyy HH:mm')}.`
              : 'Nenhum aviso enviado ainda para esta mensagem.'}
          </p>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
