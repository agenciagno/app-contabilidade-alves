import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DsBadge, SearchField, type BadgeTone } from '@/components/ds';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TabelaExport } from '@/lib/exportarTabela';
import {
  dataBR, digitos, listarAusencias, ROTULO_SITUACAO_AUSENCIA, sigla,
  type Ausencia, type LinhaCarteira,
} from '@/lib/situacaoCarteira';

type Situacao = Ausencia['situacao'];
type Obrigacao = Ausencia['obrigacao'];

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
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Obrigação', 'Competência', 'Prazo', 'Situação'],
    linhas: visiveis.map(({ linha, ausencia }) => [
      linha.nome, formatarCnpj(linha.documento), linha.regimeRotulo, ausencia.obrigacao, competenciaDe(ausencia), dataBR(ausencia.prazo), ROTULO_SITUACAO_AUSENCIA[ausencia.situacao],
    ]),
  });

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
        (ou DCTFWeb e MIT, que sem movimento também aparecem assim). <strong className="text-ink">A vencer</strong>: ainda no prazo.
      </p>

      <div className="rounded-lg border border-line bg-paper">
        {visiveis.length === 0 ? (
          <p className="py-12 text-center text-ui text-muted-ink">Nenhuma declaração nesta situação.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead>Obrigação</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map(({ linha, ausencia }) => (
                <TableRow key={`${linha.contact_id}-${ausencia.obrigacao}-${ausencia.competencia}`}>
                  <TableCell>
                    <p className="text-ui-strong text-ink">{linha.nome}</p>
                    <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(linha.documento)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">{linha.regimeRotulo}</TableCell>
                  <TableCell className="text-ui text-ink">{ausencia.obrigacao}</TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-ink">{competenciaDe(ausencia)}</TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">{dataBR(ausencia.prazo) || '—'}</TableCell>
                  <TableCell><DsBadge tone={TOM[ausencia.situacao]}>{ROTULO_SITUACAO_AUSENCIA[ausencia.situacao]}</DsBadge></TableCell>
                  <TableCell className="text-right">
                    <Link to={`/dashboard-federal/${TELA[ausencia.obrigacao]}?q=${digitos(linha.documento)}`} className="text-ui-strong text-action hover:underline">Ver</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
