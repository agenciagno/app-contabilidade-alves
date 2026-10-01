import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export interface NotaAlvo {
  /** Título da janela: "Acompanhamento do cliente" ou "Observação da mensagem". */
  titulo: string;
  /** Quem é o dono da nota (nome do cliente ou assunto da mensagem). */
  referencia: string;
  texto: string;
  salvar: (texto: string | null) => Promise<void>;
}

/** Bloco de notas simples: um texto livre, salvo ao clicar em Salvar. Texto vazio apaga a nota. */
export function NotaDialog({ alvo, onClose }: { alvo: NotaAlvo | null; onClose: () => void }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setTexto(alvo?.texto ?? ''); }, [alvo]);

  if (!alvo) return null;

  const handleSalvar = async () => {
    setSalvando(true);
    try { await alvo.salvar(texto.trim() || null); onClose(); }
    catch { toast.error('Não foi possível salvar.'); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">{alvo.titulo}</DialogTitle>
          <p className="text-meta text-muted-ink">{alvo.referencia}</p>
        </DialogHeader>

        <div className="space-y-1.5 px-6 py-5">
          <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva aqui o que a equipe precisa saber…" className="text-[13px]" maxLength={4000} autoFocus />
          <p className="text-meta text-muted-ink-2">Visível para toda a equipe. Salvar com o campo vazio apaga a nota.</p>
        </div>

        <DialogFooter className="gap-2 border-t border-line-2 px-6 py-4">
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem salvar o que você escreveu.">
            <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} texto="Guarda a nota para toda a equipe.">
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DicaBotao>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
