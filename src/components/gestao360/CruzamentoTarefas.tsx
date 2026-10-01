import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DsAlert, DsBadge } from '@/components/ds';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TabelaExport } from '@/lib/exportarTabela';
import {
  ORDEM_CRUZAMENTO, ROTULO_STATUS_TAREFA, TIPOS_CRUZAMENTO, type LinhaCruzamento, type TipoCruzamento,
} from '@/lib/cruzamentoReceita';
import { dataBR, digitos, sigla } from '@/lib/situacaoCarteira';

const TIPOS = (Object.keys(ORDEM_CRUZAMENTO) as TipoCruzamento[]).sort((a, b) => ORDEM_CRUZAMENTO[a] - ORDEM_CRUZAMENTO[b]);
const FONTE: Record<string, { rotulo: string; tela: string }> = {
  'DAS - Simples Nacional': { rotulo: 'PGDAS-D', tela: 'pgdas' }, MIT: { rotulo: 'MIT', tela: 'dctfweb-mit' }, DCTF: { rotulo: 'DCTFWeb', tela: 'dctfweb-mit' },
};

/** Receita (Serpro) × tarefa do Gestor Fiscal. Só aponta a divergência: não conclui nem reabre tarefa. */
export function CruzamentoTarefas({ linhas, carregando, erro }: { linhas: LinhaCruzamento[]; carregando: boolean; erro: unknown }) {
  const [tipo, setTipo] = useState<TipoCruzamento | 'todos'>('todos');
  const contagem = useMemo(() => Object.fromEntries(TIPOS.map((t) => [t, linhas.filter((l) => l.tipo === t).length])) as Record<TipoCruzamento, number>, [linhas]);
  const visiveis = tipo === 'todos' ? linhas : linhas.filter((l) => l.tipo === tipo);

  const tabela = (): TabelaExport => ({
    arquivo: 'cruzamento-receita-tarefas',
    titulo: 'CA · Ausências: Receita × tarefas do Fiscal',
    colunas: ['Razão social', 'CNPJ', 'Obrigação', 'Competência', 'Tarefa', 'Vencimento da tarefa', 'Receita', 'Divergência'],
    linhas: visiveis.map((l) => [
      l.nome, formatarCnpj(l.documento), l.obrigacao, sigla(l.competencia), ROTULO_STATUS_TAREFA[l.statusTarefa] ?? l.statusTarefa, dataBR(l.vencimento), l.receita, TIPOS_CRUZAMENTO[l.tipo].titulo,
    ]),
  });

  if (carregando) return <Skeleton className="h-[240px] w-full" />;

  return (
    <div className="space-y-4">
      {erro ? <DsAlert tone="danger" title="Não foi possível ler as tarefas" description="Recarregue a página. Os números desta aba podem estar incompletos." /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {TIPOS.map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} className={`rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${tipo === t ? 'ring-2 ring-ink' : ''}`}>
            <DsBadge tone={TIPOS_CRUZAMENTO[t].tom}>{TIPOS_CRUZAMENTO[t].titulo}: {contagem[t]}</DsBadge>
          </button>
        ))}
        <button type="button" onClick={() => setTipo('todos')} className={`rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${tipo === 'todos' ? 'ring-2 ring-ink' : ''}`}>
          <DsBadge tone="neutral" dot={false}>Todas: {linhas.length}</DsBadge>
        </button>
        <div className="ml-auto"><ExportarMenu montar={tabela} disabled={visiveis.length === 0} /></div>
      </div>

      <p className="max-w-[880px] text-meta text-muted-ink">
        Compara o que a Receita mostra com a tarefa do Gestor Fiscal (DAS ↔ PGDAS-D; MIT e DCTF só na competência carregada). {tipo === 'todos' ? 'Só entram as divergências; o que bate nas duas fontes não aparece.' : TIPOS_CRUZAMENTO[tipo].ajuda}
      </p>

      <div className="rounded-lg border border-line bg-paper">
        {visiveis.length === 0 ? (
          <p className="py-12 text-center text-ui text-muted-ink">Nenhuma divergência entre a Receita e as tarefas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Obrigação</TableHead>
                <TableHead>Tarefa</TableHead>
                <TableHead>Receita</TableHead>
                <TableHead>Divergência</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((l) => (
                <TableRow key={l.tarefaId}>
                  <TableCell>
                    <p className="text-ui-strong text-ink">{l.nome}</p>
                    <p className="font-mono text-meta text-muted-ink-2">{l.documento ? formatarCnpj(l.documento) : 'Sem CNPJ'}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-ink">{FONTE[l.obrigacao]?.rotulo ?? l.obrigacao} · {sigla(l.competencia)}</TableCell>
                  <TableCell className="text-ui text-muted-ink">
                    {ROTULO_STATUS_TAREFA[l.statusTarefa] ?? l.statusTarefa}{l.vencimento ? <span className="block text-meta text-muted-ink-2">vence {dataBR(l.vencimento)}</span> : null}
                  </TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal text-ui text-muted-ink">{l.receita}</TableCell>
                  <TableCell className="whitespace-nowrap"><DsBadge tone={TIPOS_CRUZAMENTO[l.tipo].tom}>{TIPOS_CRUZAMENTO[l.tipo].titulo}</DsBadge></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Link to={`/fiscal/tarefas?contact_id=${l.contact_id}`} className="text-ui-strong text-action hover:underline">Tarefa</Link>
                    {l.tipo !== 'fora_do_monitoramento' && (
                      <Link to={`/dashboard-federal/${FONTE[l.obrigacao]?.tela ?? 'pgdas'}?q=${digitos(l.documento)}`} className="ml-3 text-ui-strong text-action hover:underline">Receita</Link>
                    )}
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
