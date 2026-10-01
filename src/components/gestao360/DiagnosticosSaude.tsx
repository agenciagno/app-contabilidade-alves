import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DsBadge, SearchField } from '@/components/ds';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { Cartao, BarrasHorizontais, BarrasPorObrigacao, Rosca } from '@/components/gestao360/GraficosCarteira';
import { TOM_NIVEL } from '@/components/gestao360/ListaClientesSheet';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { saudeCarteira } from '@/lib/diagnosticos';
import type { TabelaExport } from '@/lib/exportarTabela';
import { digitos, montarGraficos, ROTULO_NIVEL, type LinhaCarteira, type NivelRisco } from '@/lib/situacaoCarteira';

const NIVEIS: NivelRisco[] = ['critico', 'atencao', 'sem_cobertura', 'em_dia'];
const POR_VEZ = 25;

/**
 * Saúde da carteira: score por cliente (itens regulares ÷ verificados, parcial enquanto houver item sem dado), distribuição e a lista por nível.
 * O score é a razão de conformidade dos relatórios; o nível (Crítico, Atenção...) é o risco do Portal 360°.
 */
export function DiagnosticosSaude({ linhas, competencia, hoje }: { linhas: LinhaCarteira[]; competencia: string; hoje: string }) {
  const { itens, faixas } = useMemo(() => saudeCarteira(linhas), [linhas]);
  const g = useMemo(() => montarGraficos(linhas, competencia, hoje), [linhas, competencia, hoje]);
  const [nivel, setNivel] = useState<NivelRisco | 'todos'>('todos');
  const [busca, setBusca] = useState('');
  const [tudo, setTudo] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase(); const qd = digitos(busca);
    return itens.filter(({ linha }) => (nivel === 'todos' || linha.nivel === nivel) && (!q || linha.nome.toLowerCase().includes(q) || (qd.length > 0 && digitos(linha.documento).includes(qd))));
  }, [itens, nivel, busca]);
  const visiveis = tudo ? filtrados : filtrados.slice(0, POR_VEZ);
  const contagem = (n: NivelRisco) => itens.filter((i) => i.linha.nivel === n).length;

  const tabela = (): TabelaExport => ({
    arquivo: 'saude-da-carteira', titulo: 'CA · Diagnósticos: saúde da carteira',
    colunas: ['Razão social', 'CNPJ', 'Responsável', 'Nível', 'Score parcial (%)', 'Regulares', 'Pendentes', 'Não verificados', 'Motivos'],
    linhas: filtrados.map(({ linha, score }) => [linha.nome, formatarCnpj(linha.documento), linha.responsavel?.nome ?? '', ROTULO_NIVEL[linha.nivel], score.percentual === null ? '' : String(score.percentual), String(score.regulares), String(score.pendentes), String(score.naoVerificados), linha.motivos.join('; ')]),
  });

  return (
    <div className="space-y-6">
      <p className="max-w-[860px] text-meta text-muted-ink">
        <strong className="text-ink">Score</strong> = itens regulares ÷ itens verificados. Item sem dado é "não verificado": nunca conta como regular e o score fica <strong className="text-ink">parcial</strong> enquanto houver item sem verificação.
        O <strong className="text-ink">nível</strong> é o risco do Portal 360° e não entra na conta do score.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao titulo="Score dos clientes" subtitulo="Quantos clientes em cada faixa de score parcial">
          <Rosca fatias={faixas} vazio="Nenhum cliente monitorado." />
        </Cartao>
        <Cartao titulo="Situação das entregas" subtitulo="PGDAS-D e DEFIS dos clientes do Simples">
          <Rosca fatias={g.entregas} vazio="Nenhum cliente com declaração a acompanhar." />
        </Cartao>
        <Cartao titulo="Em falta por obrigação" subtitulo="Clientes com a obrigação em falta ou a confirmar">
          <BarrasPorObrigacao dados={g.porObrigacao} />
        </Cartao>
        <Cartao titulo="Em falta por regime" subtitulo="Clientes com PGDAS-D ou DEFIS em falta">
          <BarrasHorizontais dados={g.porRegime} vazio="Nenhum cliente com declaração em falta." />
        </Cartao>
        <Cartao titulo="Situação fiscal" subtitulo="Último relatório da Receita e da PGFN de cada cliente">
          <Rosca fatias={g.situacaoFiscal} vazio="Sem relatório de Situação fiscal ainda." />
        </Cartao>
        <Cartao titulo="Certidão federal" subtitulo="Lida do relatório de Situação fiscal; estadual, municipal, FGTS e trabalhista não entram">
          <Rosca fatias={g.certidoes} vazio="Sem certidão lida ainda." />
        </Cartao>
        <Cartao titulo="Pendências por regime" subtitulo="Clientes com pendência na Situação fiscal">
          <BarrasHorizontais dados={g.pendenciasPorRegime} vazio="Nenhum cliente com pendência na Situação fiscal." />
        </Cartao>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-h4-card text-ink">Clientes por nível</h2>
          {NIVEIS.map((n) => (
            <button key={n} type="button" onClick={() => setNivel(nivel === n ? 'todos' : n)} className={`rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${nivel === n ? 'ring-2 ring-ink' : ''}`}>
              <DsBadge tone={TOM_NIVEL[n]}>{ROTULO_NIVEL[n]}: {contagem(n)}</DsBadge>
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SearchField placeholder="Buscar por nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="w-[260px]" />
            <ExportarMenu montar={tabela} disabled={filtrados.length === 0} />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-paper">
          {filtrados.length === 0 ? <p className="py-12 text-center text-ui text-muted-ink">Nenhum cliente neste filtro.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead><TableHead>Responsável</TableHead><TableHead>Nível</TableHead><TableHead>Score</TableHead><TableHead>Motivos</TableHead><TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(({ linha, score }) => (
                  <TableRow key={linha.contact_id}>
                    <TableCell>
                      <p className="text-ui-strong text-ink">{linha.nome}</p>
                      <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(linha.documento)} · {linha.regimeRotulo}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{linha.responsavel?.nome ?? '—'}</TableCell>
                    <TableCell><DsBadge tone={TOM_NIVEL[linha.nivel]}>{ROTULO_NIVEL[linha.nivel]}</DsBadge></TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p className="text-ui-strong text-ink">{score.percentual === null ? '—' : `${score.percentual}%`}{score.naoVerificados > 0 && score.percentual !== null ? <span className="ml-1 text-meta font-normal text-muted-ink-2">parcial</span> : null}</p>
                      <p className="text-meta text-muted-ink-2">{score.regulares} de {score.verificados} · {score.naoVerificados} não verif.</p>
                    </TableCell>
                    <TableCell className="max-w-[300px] whitespace-normal text-meta text-muted-ink">{linha.motivos.slice(0, 2).join(' · ') || '—'}{linha.motivos.length > 2 ? ` · +${linha.motivos.length - 2}` : ''}</TableCell>
                    <TableCell className="text-right"><Link to={`/gestao-360/portal?cliente=${linha.contact_id}`} className="text-ui-strong text-action hover:underline">Ficha</Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {filtrados.length > POR_VEZ && (
          <button type="button" onClick={() => setTudo((v) => !v)} className="text-ui-strong text-action hover:underline">{tudo ? 'Mostrar menos' : `Mostrar os outros ${filtrados.length - POR_VEZ}`}</button>
        )}
      </section>
    </div>
  );
}
