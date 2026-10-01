import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotebookPen, Send } from 'lucide-react';

import { DsBadge, SearchField, type BadgeTone } from '@/components/ds';
import { AcompanhamentoDialog } from '@/components/gestao360/AcompanhamentoDialog';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { EnviarClienteDialog } from '@/components/gestao360/EnviarClienteDialog';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { chaveAcomp, SITUACOES_ACOMP, useAcompanhamentos, type Acompanhamento } from '@/hooks/useAcompanhamentoAusencia';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import type { TabelaExport } from '@/lib/exportarTabela';
import { modeloAusencia, podeAvisarAusencia } from '@/lib/mensagensCliente';
import {
  dataBR, digitos, listarAusencias, ROTULO_SITUACAO_AUSENCIA, sigla,
  type Ausencia, type LinhaCarteira,
} from '@/lib/situacaoCarteira';

type Situacao = Ausencia['situacao'];
type Obrigacao = Ausencia['obrigacao'];
type Alvo = { linha: LinhaCarteira; ausencia: Ausencia };

const TOM: Record<Situacao, BadgeTone> = { em_falta: 'danger', a_confirmar: 'warn', a_vencer: 'info', nao_consultado: 'neutral' };
const SITUACOES: Situacao[] = ['em_falta', 'a_confirmar', 'nao_consultado', 'a_vencer'];
const OBRIGACOES: Obrigacao[] = ['PGDAS-D', 'DEFIS', 'DCTFWeb', 'MIT'];
const TELA: Record<Obrigacao, string> = { 'PGDAS-D': 'pgdas', DEFIS: 'defis', DCTFWeb: 'dctfweb-mit', MIT: 'dctfweb-mit' };

export const competenciaDe = (a: Ausencia) => (a.obrigacao === 'DEFIS' ? `${a.competencia} (ano-calendário)` : sigla(a.competencia));

/** Lista de declarações por cliente: o que está em falta, o que ainda não dá para afirmar e o que ainda está no prazo. */
export function AusenciasLista({ linhas, inicial = 'em_falta' }: { linhas: LinhaCarteira[]; inicial?: Situacao | 'todas' }) {
  const [situacao, setSituacao] = useState<Situacao | 'todas'>(inicial);
  const [obrigacao, setObrigacao] = useState<Obrigacao | 'todas'>('todas');
  const [busca, setBusca] = useState('');
  const [avisar, setAvisar] = useState<Alvo | null>(null);
  const [acompanhar, setAcompanhar] = useState<Alvo | null>(null);

  const acompanhamentos = useAcompanhamentos();
  const equipe = useTeamProfiles();
  const nomes = useMemo(() => new Map((equipe.data ?? []).map((p) => [p.id, p.full_name ?? ''] as const)), [equipe.data]);
  const acompDe = ({ linha, ausencia }: Alvo): Acompanhamento | undefined => acompanhamentos.data?.get(chaveAcomp(linha.contact_id, ausencia.obrigacao, ausencia.competencia));
  const responsavelDe = (alvo: Alvo) => {
    const a = acompDe(alvo);
    return (a?.responsavel_id ? nomes.get(a.responsavel_id) : null) || alvo.linha.responsavel?.nome || '';
  };
  const situacaoAcomp = (a: Acompanhamento) => SITUACOES_ACOMP.find((s) => s.valor === a.situacao) ?? SITUACOES_ACOMP[0];

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = digitos(busca);
    return listarAusencias(linhas).filter(({ linha, ausencia }) =>
      (obrigacao === 'todas' || ausencia.obrigacao === obrigacao)
      && (!q || linha.nome.toLowerCase().includes(q) || (qd.length > 0 && digitos(linha.documento).includes(qd))));
  }, [linhas, obrigacao, busca]);
  const contagem = (s: Situacao) => base.filter((x) => x.ausencia.situacao === s).length;
  const visiveis = situacao === 'todas' ? base : base.filter((x) => x.ausencia.situacao === situacao);

  const tabela = (): TabelaExport => ({
    arquivo: 'ausencias-declaracoes',
    titulo: 'CA · Ausências: declarações por cliente',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Responsável', 'Obrigação', 'Competência', 'Prazo', 'Situação', 'Acompanhamento', 'Nota'],
    linhas: visiveis.map((alvo) => {
      const { linha, ausencia } = alvo;
      const a = acompDe(alvo);
      return [
        linha.nome, formatarCnpj(linha.documento), linha.regimeRotulo, responsavelDe(alvo), ausencia.obrigacao, competenciaDe(ausencia), dataBR(ausencia.prazo),
        ROTULO_SITUACAO_AUSENCIA[ausencia.situacao], a ? situacaoAcomp(a).curto : '', a?.nota ?? '',
      ];
    }),
  });

  const modeloDoAlvo = avisar ? modeloAusencia(avisar.ausencia) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SITUACOES.map((s) => (
          <button key={s} type="button" onClick={() => setSituacao(s)} className={`rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${situacao === s ? 'ring-2 ring-ink' : ''}`}>
            <DsBadge tone={TOM[s]}>{ROTULO_SITUACAO_AUSENCIA[s]}: {contagem(s)}</DsBadge>
          </button>
        ))}
        <button type="button" onClick={() => setSituacao('todas')} className={`rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${situacao === 'todas' ? 'ring-2 ring-ink' : ''}`}>
          <DsBadge tone="neutral" dot={false}>Todas: {base.length}</DsBadge>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SearchField placeholder="Buscar por nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="w-[260px]" />
          <Select value={obrigacao} onValueChange={(v) => setObrigacao(v as Obrigacao | 'todas')}>
            <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obrigações</SelectItem>
              {OBRIGACOES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <ExportarMenu montar={tabela} disabled={visiveis.length === 0} />
        </div>
      </div>

      <p className="text-meta text-muted-ink">
        <strong className="text-ink">Em falta</strong>: consulta depois do prazo e sem declaração. <strong className="text-ink">A confirmar</strong>: sem declaração, mas a consulta foi antes do prazo
        (ou DCTFWeb e MIT, que sem movimento também aparecem assim). <strong className="text-ink">A vencer</strong>: ainda no prazo. O acompanhamento é só anotação: não tira a pendência da lista.
      </p>

      <div className="rounded-lg border border-line bg-paper">
        {visiveis.length === 0 ? (
          <p className="py-12 text-center text-ui text-muted-ink">Nenhuma declaração nesta situação.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Declaração</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Acompanhamento</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((alvo) => {
                const { linha, ausencia } = alvo;
                const a = acompDe(alvo);
                const podeAvisar = podeAvisarAusencia(ausencia);
                return (
                  <TableRow key={`${linha.contact_id}-${ausencia.obrigacao}-${ausencia.competencia}`}>
                    <TableCell>
                      <p className="text-ui-strong text-ink">{linha.nome}</p>
                      <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(linha.documento)} · {linha.regimeRotulo}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{responsavelDe(alvo) || '—'}</TableCell>
                    <TableCell className="text-ui text-ink">
                      <p className="whitespace-nowrap">{ausencia.obrigacao}</p>
                      <p className="whitespace-nowrap text-meta text-muted-ink">{competenciaDe(ausencia)}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{dataBR(ausencia.prazo) || '—'}</TableCell>
                    <TableCell><DsBadge tone={TOM[ausencia.situacao]}>{ROTULO_SITUACAO_AUSENCIA[ausencia.situacao]}</DsBadge></TableCell>
                    <TableCell className="max-w-[190px]">
                      {a ? (
                        <div className="flex flex-col items-start gap-1">
                          <DsBadge tone={situacaoAcomp(a).tom}>{situacaoAcomp(a).curto}</DsBadge>
                          {a.nota && <span className="line-clamp-2 whitespace-normal break-words text-meta text-muted-ink" title={a.nota}>{a.nota}</span>}
                        </div>
                      ) : <span className="text-ui text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <DicaBotao texto={podeAvisar ? 'Avisa o cliente por e-mail ou WhatsApp, com texto pronto para você revisar.' : 'Ainda não dá para afirmar ao cliente que está em falta: consulte de novo depois do prazo.'}>
                          <Button variant="ghost" size="icon" aria-label="Avisar cliente" disabled={!podeAvisar} onClick={() => setAvisar(alvo)}><Send className="h-4 w-4" /></Button>
                        </DicaBotao>
                        <DicaBotao texto="Anota a situação, o responsável e uma nota desta pendência.">
                          <Button variant="ghost" size="icon" aria-label="Acompanhamento" onClick={() => setAcompanhar(alvo)}><NotebookPen className="h-4 w-4" /></Button>
                        </DicaBotao>
                        <Link to={`/dashboard-federal/${TELA[ausencia.obrigacao]}?q=${digitos(linha.documento)}`} className="px-2 text-ui-strong text-action hover:underline">Ver</Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {avisar && modeloDoAlvo && (
        <EnviarClienteDialog
          key={`${avisar.linha.contact_id}-${avisar.ausencia.obrigacao}-${avisar.ausencia.competencia}`}
          contactId={avisar.linha.contact_id} nome={avisar.linha.nome} modelo={modeloDoAlvo} origem="ausencia"
          referencia={{ obrigacao: avisar.ausencia.obrigacao, competencia: avisar.ausencia.competencia }}
          onClose={() => setAvisar(null)}
        />
      )}
      {acompanhar && (
        <AcompanhamentoDialog
          key={`${acompanhar.linha.contact_id}-${acompanhar.ausencia.obrigacao}-${acompanhar.ausencia.competencia}`}
          linha={acompanhar.linha} ausencia={acompanhar.ausencia} atual={acompDe(acompanhar)} onClose={() => setAcompanhar(null)}
        />
      )}
    </div>
  );
}
