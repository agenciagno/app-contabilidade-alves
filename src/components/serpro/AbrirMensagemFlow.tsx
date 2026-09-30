import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CienciaDialog } from '@/components/serpro/CienciaDialog';
import { limparCorpo, useAbrirMensagem, type MensagemCaixa } from '@/hooks/useSerproCaixaPostal';

type Leitura = { assunto: string; cliente: string; enviadaEm: string | null; corpo: string };

/**
 * Fluxo único para abrir o CORPO de uma mensagem: pop-up de ciência -> confirmação -> leitura.
 * Mensagem que já teve o corpo aberto antes mostra o texto salvo, sem nova chamada e sem nova ciência.
 * Usado pelo painel do cliente (Mensagens e-CAC) e pela tela Termos de Intimação.
 */
export function useAbrirMensagemFlow() {
  const abrir = useAbrirMensagem();
  const [alvo, setAlvo] = useState<{ msg: MensagemCaixa; cliente: string } | null>(null);
  const [lendo, setLendo] = useState<Leitura | null>(null);

  const solicitar = (msg: MensagemCaixa, cliente: string) => {
    if (msg.corpo) {
      setLendo({ assunto: msg.assunto, cliente, enviadaEm: msg.data_envio, corpo: msg.corpo });
    } else {
      setAlvo({ msg, cliente });
    }
  };

  const confirmar = async () => {
    if (!alvo) return;
    try {
      const r = await abrir.mutateAsync({ mensagemId: alvo.msg.id, contactId: alvo.msg.contact_id });
      if (r.ok && r.corpo) {
        setLendo({ assunto: alvo.msg.assunto, cliente: alvo.cliente, enviadaEm: alvo.msg.data_envio, corpo: r.corpo });
        setAlvo(null);
        toast.success('Mensagem aberta. Ciência registrada.');
      } else {
        toast.error(r.error ?? 'Não foi possível abrir a mensagem.');
      }
    } catch {
      toast.error('Falha ao abrir a mensagem. Nada foi registrado.');
    }
  };

  const dialogs = (
    <>
      <CienciaDialog
        open={!!alvo}
        assunto={alvo?.msg.assunto ?? ''}
        cliente={alvo?.cliente}
        carregando={abrir.isPending}
        onFechar={() => setAlvo(null)}
        onConfirmar={confirmar}
      />
      <Dialog open={!!lendo} onOpenChange={(o) => !o && setLendo(null)}>
        <DialogContent className="max-w-[720px] p-0">
          <DialogHeader className="border-b border-line-2 px-6 py-5 text-left">
            {lendo && <p className="text-meta uppercase text-muted-ink-2">{lendo.cliente}</p>}
            <DialogTitle className="text-[18px] leading-snug">{lendo?.assunto}</DialogTitle>
            {lendo?.enviadaEm && (
              <p className="text-meta text-muted-ink">Enviada em {format(new Date(lendo.enviadaEm), 'dd/MM/yyyy HH:mm')}</p>
            )}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-6 py-5 text-[15px] leading-relaxed text-ink">
            {lendo ? limparCorpo(lendo.corpo) : ''}
          </div>
          <DialogFooter className="border-t border-line-2 px-6 py-4">
            <Button variant="outline" onClick={() => setLendo(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { solicitar, dialogs };
}
