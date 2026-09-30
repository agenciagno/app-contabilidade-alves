import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface CienciaDialogProps {
  open: boolean;
  assunto: string;
  cliente?: string;
  carregando?: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
}

/**
 * Pop-up grande, centralizado, que antecede QUALQUER leitura do corpo de mensagem da Caixa Postal do e-CAC.
 * Ler o corpo pela API do Serpro tem o mesmo efeito de abrir no e-CAC: caracteriza CIÊNCIA da intimação
 * (art. 23, § 2º, III, Decreto 70.235/1972) e pode iniciar prazo. Só a confirmação aqui libera a chamada.
 * (A função no servidor também recusa qualquer abertura sem `ciencia_confirmada`.)
 */
export function CienciaDialog({ open, assunto, cliente, carregando, onFechar, onConfirmar }: CienciaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !carregando) onFechar(); }}>
      <DialogContent className="max-w-[680px] gap-0 p-0 sm:rounded-lg" onInteractOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center gap-4 px-8 pb-6 pt-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
            <ShieldAlert className="h-9 w-9" strokeWidth={1.75} />
          </div>
          <DialogTitle className="text-[26px] font-semibold leading-tight text-ink">
            Abrir esta mensagem registra a CIÊNCIA da Receita Federal
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-[16px] leading-relaxed text-muted-ink">
              <p>
                Ao confirmar, a Receita passa a considerar que o contribuinte <strong className="text-ink">tomou conhecimento</strong> desta
                mensagem. Se for uma intimação, <strong className="text-ink">o prazo pode começar a contar a partir de agora</strong>,
                e isso <strong className="text-ink">não pode ser desfeito</strong>.
              </p>
              <p>Abra apenas se a equipe estiver pronta para tratar o assunto.</p>
            </div>
          </DialogDescription>
          <div className="w-full rounded-md border border-line bg-bg-2 px-4 py-3 text-left">
            {cliente && <p className="text-meta uppercase text-muted-ink-2">{cliente}</p>}
            <p className="text-[15px] font-medium text-ink">{assunto}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-line-2 px-8 py-5 sm:flex-row sm:justify-end">
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem abrir a mensagem. Nenhuma ciência é registrada.">
            <Button variant="outline" size="lg" onClick={onFechar} disabled={carregando} className="sm:min-w-[140px]">
              Fechar
            </Button>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo="Consultar" texto="Abre a mensagem na Receita agora. A ciência do contribuinte fica registrada e não pode ser desfeita.">
            <Button variant="destructive" size="lg" onClick={onConfirmar} disabled={carregando} className="sm:min-w-[200px]">
              {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar e abrir<Preco tipo="Consultar" />
            </Button>
          </DicaBotao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
