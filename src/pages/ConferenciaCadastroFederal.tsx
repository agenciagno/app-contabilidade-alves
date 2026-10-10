import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { PaginacaoLista, RodapeLista, usePaginacao } from '@/components/monitor/MonitorUi';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { ROTULO_PROBLEMA, useConferenciaCadastro, type TipoProblema } from '@/hooks/useSerproConferenciaCadastro';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = { simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento', nao_aplica: 'Não se aplica' };
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const somenteDigitos = (v: string) => v.replace(/\D/g, '');

type Filtro = 'todos' | TipoProblema;
const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos os problemas' },
  ...(Object.keys(ROTULO_PROBLEMA) as TipoProblema[]).map((t) => ({ value: t as Filtro, label: ROTULO_PROBLEMA[t] })),
];

export default function ConferenciaCadastroFederal() {
  const { linhas, totalAtivos, carregando } = useConferenciaCadastro();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const stats = useMemo(() => {
    const com = (...ts: TipoProblema[]) => linhas.filter((l) => l.problemas.some((p) => ts.includes(p.tipo))).length;
    return {
      total: linhas.length,
      receita: com('sem_declaracao_ano', 'sem_declaracao_recente', 'pgdas_fora_do_simples'),
      cadastro: com('saida_com_status_ativo', 'pj_sem_regime'),
    };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => filtro === 'todos' || l.problemas.some((p) => p.tipo === filtro))
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && somenteDigitos(l.documento).includes(qDigitos)));
  }, [linhas, busca, filtro]);

  const pag = usePaginacao(filtradas, `${busca}|${filtro}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'conferencia-cadastro',
    titulo: `Conferência do cadastro — ${format(new Date(), 'dd/MM/yyyy')}`,
    colunas: ['Razão social', 'CNPJ', 'Regime no cadastro', 'Problemas'],
    linhas: filtradas.map((l) => [l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime', l.problemas.map((p) => `${p.titulo}: ${p.detalhe}`).join(' | ')]),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard fiscal · conferência do cadastro"
        title="Conferência do cadastro."
        subtitle="Clientes ativos em que o cadastro e o que a Receita mostra (ou o próprio monitoramento) não batem: Simples sem declaração, declaração do Simples em cliente de outro regime, cliente ativo com data de saída e PJ sem regime. Só lê o que já está salvo: não consulta o Serpro e não gera custo. A Receita só é comparada onde a declaração já foi consultada."
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} />}
      />

      <StatCardRow
        items={[
          { label: 'Clientes ativos', value: totalAtivos, hint: 'base da conferência' },
          { label: 'Com problema', value: stats.total, hint: 'para conferir e corrigir', emphasis: stats.total > 0 ? 'warm' : 'none' },
          { label: 'Receita × cadastro', value: stats.receita, hint: 'declaração que não bate com o cadastro', emphasis: stats.receita > 0 ? 'warm' : 'none' },
          { label: 'Só no cadastro', value: stats.cadastro, hint: 'data de saída ou regime em branco' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>{FILTROS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div ref={topoTabela} className="scroll-mt-16 overflow-hidden rounded-lg border border-line bg-paper">
        {carregando ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">
            {linhas.length === 0 ? 'Nenhum problema encontrado no que já está salvo.' : 'Nenhum cliente encontrado com esse filtro.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / Razão Social</TableHead>
                <TableHead>Regime no cadastro</TableHead>
                <TableHead>O que não bate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pag.recorte.map((l) => (
                <TableRow key={l.contact_id}>
                  <TableCell className="align-top">
                    <p className="text-ui text-ink">{l.nome}</p>
                    <p className="font-mono text-meta text-muted-ink-2">{l.documento ? formatarCnpj(l.documento) : 'Sem documento'}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-ui text-muted-ink">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</TableCell>
                  <TableCell>
                    <div className="max-w-[620px] space-y-2">
                      {l.problemas.map((p) => (
                        <div key={p.tipo} className="space-y-0.5">
                          <DsBadge tone={p.tom}>{p.titulo}</DsBadge>
                          <p className="text-meta text-muted-ink">{p.detalhe}</p>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <RodapeLista mostrando={filtradas.length} total={linhas.length} unidade="clientes com problema" faixa={pag.faixa} />
        <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
          onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
      </div>
      <p className="text-meta text-muted-ink-2">
        O regime do cadastro só é comparado com a Receita quando a declaração PGDAS-D do cliente já foi consultada:
        cliente de outro regime que entregue PGDAS-D só aparece aqui depois de consultado.
      </p>
    </div>
  );
}
