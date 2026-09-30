import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, RefreshCw } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirRelatorioSitfis, useGerarRelatorioSitfis } from '@/components/serpro/sitfisUi';
import {
  DIAS_RELATORIO_VELHO, estadoSitfis, relatorioVelho, useMatrizSitfis, type EstadoSitfis, type LinhaSitfis,
} from '@/hooks/useSerproSitfis';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = {
  simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento',
};
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

type Situacao = 'todos' | 'sem_relatorio' | 'com_pendencias' | 'sem_pendencias' | 'a_conferir' | 'antigo';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'com_pendencias', label: 'Com pendências' },
  { value: 'sem_pendencias', label: 'Sem pendências' },
  { value: 'a_conferir', label: 'A conferir (abrir o PDF)' },
  { value: 'sem_relatorio', label: 'Sem relatório' },
  { value: 'antigo', label: `Relatório com mais de ${DIAS_RELATORIO_VELHO} dias` },
];

function rotulo(l: LinhaSitfis, e: EstadoSitfis): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (e) {
    case 'sem_pendencias': return { label: 'Sem pendências', tone: 'ok' };
    case 'com_pendencias': return { label: 'Com pendências', tone: 'danger' };
    case 'a_conferir': return { label: l.ultimo?.resultado === 'com_pendencias' ? 'Pode haver pendências' : 'A conferir', tone: 'warn' };
    case 'filial': return { label: 'Filial (matriz)', tone: 'neutral' };
    default: return { label: 'Sem relatório', tone: 'neutral' };
  }
}

export default function SituacaoFiscalFederal() {
  const { data: linhas = [], isLoading } = useMatrizSitfis();
  const { executar, emAndamento, dialog } = useGerarRelatorioSitfis();
  const { ocupado, abrir } = useAbrirRelatorioSitfis();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [regime, setRegime] = useState('todos');

  const stats = useMemo(() => {
    const ativos = linhas.filter((l) => !l.filial);
    const est = ativos.map(estadoSitfis);
    return {
      total: ativos.length,
      comRelatorio: est.filter((e) => e !== 'sem_relatorio').length,
      semPend: est.filter((e) => e === 'sem_pendencias').length,
      comPend: est.filter((e) => e === 'com_pendencias').length,
      conferir: est.filter((e) => e === 'a_conferir').length,
    };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        const e = estadoSitfis(l);
        switch (situacao) {
          case 'sem_relatorio': return e === 'sem_relatorio';
          case 'com_pendencias': return e === 'com_pendencias';
          case 'sem_pendencias': return e === 'sem_pendencias';
          case 'a_conferir': return e === 'a_conferir';
          case 'antigo': return relatorioVelho(l);
          default: return true;
        }
      })
      .filter((l) => regime === 'todos' || (l.regime ?? 'outros') === regime)
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, regime]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'situacao-fiscal',
    titulo: 'Situação fiscal dos clientes ativos (Receita Federal e PGFN)',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Pendências', 'Certidão (tipo)', 'Certidão (validade)', 'Relatório em'],
    linhas: filtradas.map((l) => [
      l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', rotulo(l, estadoSitfis(l)).label,
      l.ultimo?.categorias.join('; ') ?? '', l.ultimo?.certidao_tipo ?? '', dataBR(l.ultimo?.certidao_validade ?? null) === '—' ? '' : dataBR(l.ultimo?.certidao_validade ?? null),
      l.ultimo?.gerado_em ? format(new Date(l.ultimo.gerado_em), 'dd/MM/yyyy HH:mm') : '',
    ]),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · situação fiscal"
        title="Situação fiscal."
        subtitle={`Relatório de situação fiscal da Receita Federal e da PGFN, um cliente por vez. A Receita leva alguns segundos para preparar cada relatório. O PDF fica guardado aqui. "Sem pendências" só aparece quando o relatório diz isso para as duas áreas; se o texto não for reconhecido, a tela pede para abrir o PDF. Relatórios com mais de ${DIAS_RELATORIO_VELHO} dias ficam marcados. Filiais seguem a matriz.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <StatCardRow
        items={[
          { label: 'Com relatório', value: `${stats.comRelatorio} de ${stats.total}`, hint: 'clientes ativos, um por vez' },
          { label: 'Sem pendências', value: stats.semPend, hint: 'Receita e PGFN' },
          { label: 'Com pendências', value: stats.comPend, hint: 'abra o PDF para ver', emphasis: stats.comPend > 0 ? 'warm' : 'none' },
          { label: 'A conferir', value: stats.conferir, hint: 'o texto do PDF não foi reconhecido', emphasis: stats.conferir > 0 ? 'warm' : 'none' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
          <SelectContent>{SITUACOES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={regime} onValueChange={setRegime}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os regimes</SelectItem>
            {Object.entries(REGIMES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            <SelectItem value="outros">Outros / sem regime</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Pendências</TableHead>
                <TableHead>Última certidão</TableHead>
                <TableHead>Relatório em</TableHead>
                <TableHead className="text-center">PDF</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const e = estadoSitfis(l);
                const r = rotulo(l, e);
                const u = l.ultimo;
                const gerando = emAndamento === l.contact_id;
                const validade = u?.certidao_validade ?? null;
                const vencida = !!validade && validade < new Date().toISOString().slice(0, 10);
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <DsBadge tone={r.tone}>{r.label}</DsBadge>
                        {l.processando && <DsBadge tone="info" dot={false}>Em processamento</DsBadge>}
                        {relatorioVelho(l) && <DsBadge tone="neutral" dot={false}>Antigo</DsBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-meta text-muted-ink">
                      {u?.categorias.length ? u.categorias.join('; ') : u && e === 'com_pendencias' ? 'Abra o PDF' : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui">
                      {u?.certidao_tipo ? (
                        <span className={vencida ? 'text-danger' : 'text-muted-ink'}>{u.certidao_tipo} · {vencida ? 'venceu em ' : 'até '}{dataBR(validade)}</span>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{u?.gerado_em ? format(new Date(u.gerado_em), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                    <TableCell className="text-center">
                      {u ? (
                        <DicaBotao texto="Abre o PDF do último relatório de situação fiscal, que já está guardado. Não consulta a Receita.">
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === u.id} onClick={() => abrir(u.id)}>
                            {ocupado === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          </Button>
                        </DicaBotao>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo={l.filial ? undefined : 'Emitir'}
                        texto={l.filial ? 'Filial: o relatório é do CNPJ da matriz. Consulte a matriz.'
                          : l.processando ? 'A Receita ainda estava preparando o relatório deste cliente. Clique para buscar o PDF pronto.'
                            : 'Pede à Receita o relatório de situação fiscal (Receita e PGFN) deste cliente e guarda o PDF. Leva alguns segundos.'}>
                        <Button size="sm" variant="outline" disabled={gerando || l.filial} onClick={() => executar(l.contact_id)}>
                          {gerando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          {u ? 'Atualizar' : 'Gerar'}{!l.filial && <Preco tipo="Emitir" />}
                        </Button>
                      </DicaBotao>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-meta text-muted-ink-2">Mostrando {filtradas.length} de {linhas.length} clientes ativos.</p>
      {dialog}
    </div>
  );
}
