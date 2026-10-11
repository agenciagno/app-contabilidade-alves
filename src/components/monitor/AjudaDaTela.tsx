import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';

import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AJUDA, type ItemAjuda, type TelaAjuda } from '@/lib/ajudaMonitoramento';

function Itens({ itens }: { itens: ItemAjuda[] }) {
  return (
    <dl className="space-y-2.5">
      {itens.map((i) => (
        <div key={i.nome}>
          <dt className="text-ui-strong text-ink">{i.nome}</dt>
          <dd className="text-ui text-muted-ink">{i.texto}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Ícone ao lado do título de cada tela do Monitoramento (11/10/2026): abre o "Como funciona", com o que fazem as rotinas
 * automáticas e os botões principais daquela tela. Textos em `src/lib/ajudaMonitoramento.ts`.
 */
export function AjudaDaTela({ tela }: { tela: TelaAjuda }) {
  const [aberto, setAberto] = useState(false);
  const a = AJUDA[tela];
  return (
    <>
      <DicaBotao texto="Como funciona esta tela: o que cada rotina e cada botão faz.">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label={`Como funciona: ${a.titulo}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-line text-muted-ink transition-colors hover:bg-bg-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LifeBuoy className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </DicaBotao>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Como funciona: {a.titulo}</DialogTitle>
            <DialogDescription>{a.resumo}</DialogDescription>
          </DialogHeader>

          {a.rotinas.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-kicker uppercase text-muted-ink-2">Rotinas automáticas</h3>
              <Itens itens={a.rotinas} />
            </section>
          )}

          {a.botoes.map((g, i) => (
            <section key={g.titulo ?? i} className="space-y-2">
              <h3 className="text-kicker uppercase text-muted-ink-2">{g.titulo ?? 'Botões'}</h3>
              <Itens itens={g.itens} />
            </section>
          ))}

          {a.rotinas.length > 0 && (
            <p className="text-meta text-muted-ink-2">Os horários são os padrões do sistema; a administração pode desligar uma rotina.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
