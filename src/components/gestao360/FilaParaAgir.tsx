import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotebookPen, Send } from 'lucide-react';

import { DsBadge, type BadgeTone } from '@/components/ds';
import { AcompanhamentoDialog } from '@/components/gestao360/AcompanhamentoDialog';
import { EnviarClienteDialog } from '@/components/gestao360/EnviarClienteDialog';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { SITUACOES_ACOMP } from '@/hooks/useAcompanhamentoAusencia';
import { DIAS_SEM_RESPOSTA, type ItemFila, type TipoFila } from '@/lib/filaDoDia';
import { modeloAusencia } from '@/lib/mensagensCliente';

const POR_VEZ = 12;
const TOM: Record<TipoFila, BadgeTone> = { mensagem_receita: 'danger', declaracao_em_falta: 'danger', das_vencido: 'danger', declaracao_a_vencer: 'info', procuracao: 'warn' };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface Props {
  itens: ItemFila[];
  onEscolherCliente: (contactId: string) => void;
}

/** "Para agir hoje": o que a equipe pode resolver agora, do mais urgente ao menos urgente. Avisar o cliente e anotar sem sair da tela. */
export function FilaParaAgir({ itens, onEscolherCliente }: Props) {
  const [tudo, setTudo] = useState(false);
  const [avisar, setAvisar] = useState<ItemFila | null>(null);
  const [acompanhar, setAcompanhar] = useState<ItemFila | null>(null);
  const clientes = useMemo(() => new Set(itens.map((i) => i.linha.contact_id)).size, [itens]);
  const visiveis = tudo ? itens : itens.slice(0, POR_VEZ);
  const modelo = avisar?.ausencia ? modeloAusencia(avisar.ausencia) : null;

  return (
    <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
      <div>
        <h2 className="text-h4-card text-ink">Para agir hoje</h2>
        <p className="text-meta text-muted-ink">
          {itens.length === 0
            ? 'Nenhum item pedindo ação com os dados que temos hoje.'
            : `${plural(itens.length, 'item', 'itens')} em ${plural(clientes, 'cliente', 'clientes')}, do mais urgente ao menos urgente. Quem já foi avisado há menos de ${DIAS_SEM_RESPOSTA} dias desce na lista; sem resposta depois disso, sobe.`}
        </p>
      </div>

      {itens.length > 0 && (
        <div className="divide-y divide-line-2">
          {visiveis.map((i) => {
            const acomp = i.acompanhamento;
            const situacao = acomp ? SITUACOES_ACOMP.find((s) => s.valor === acomp.situacao) : undefined;
            return (
              <div key={i.chave} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <button type="button" onClick={() => onEscolherCliente(i.linha.contact_id)} className="w-[240px] shrink-0 truncate text-left text-ui-strong text-ink hover:underline" title="Ver a ficha deste cliente">
                  {i.linha.nome}
                </button>
                <span className="w-[110px] shrink-0 truncate text-meta text-muted-ink-2">{i.linha.responsavel?.nome ?? 'Sem responsável'}</span>
                <div className="min-w-[220px] flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-ui text-ink"><DsBadge tone={TOM[i.tipo]} dot={false}>{i.titulo}</DsBadge></p>
                  <p className="mt-0.5 text-meta text-muted-ink">{i.detalhe}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {i.diasSemResposta !== undefined && <DsBadge tone="warn">Sem resposta há {plural(i.diasSemResposta, 'dia', 'dias')}</DsBadge>}
                  {situacao && i.diasSemResposta === undefined && situacao.valor !== 'a_tratar' && <DsBadge tone={situacao.tom}>{situacao.curto}</DsBadge>}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  {i.ausencia && (
                    <>
                      <DicaBotao texto="Avisa o cliente por e-mail ou WhatsApp, com texto pronto para você revisar.">
                        <Button variant="ghost" size="icon" aria-label="Avisar cliente" onClick={() => setAvisar(i)}><Send className="h-4 w-4" /></Button>
                      </DicaBotao>
                      <DicaBotao texto="Anota a situação, o responsável e uma nota desta pendência.">
                        <Button variant="ghost" size="icon" aria-label="Acompanhamento" onClick={() => setAcompanhar(i)}><NotebookPen className="h-4 w-4" /></Button>
                      </DicaBotao>
                    </>
                  )}
                  <Link to={i.ver} className="px-2 text-ui-strong text-action hover:underline">Ver</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {itens.length > POR_VEZ && (
        <button type="button" onClick={() => setTudo((v) => !v)} className="text-ui-strong text-action hover:underline">
          {tudo ? 'Mostrar menos' : `Mostrar os outros ${itens.length - POR_VEZ}`}
        </button>
      )}

      {avisar?.ausencia && modelo && (
        <EnviarClienteDialog
          key={avisar.chave} contactId={avisar.linha.contact_id} nome={avisar.linha.nome} modelo={modelo} origem="ausencia"
          referencia={{ obrigacao: avisar.ausencia.obrigacao, competencia: avisar.ausencia.competencia }} onClose={() => setAvisar(null)}
        />
      )}
      {acompanhar?.ausencia && (
        <AcompanhamentoDialog key={acompanhar.chave} linha={acompanhar.linha} ausencia={acompanhar.ausencia} atual={acompanhar.acompanhamento} onClose={() => setAcompanhar(null)} />
      )}
    </section>
  );
}
