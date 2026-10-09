import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Eye } from 'lucide-react';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { PagamentosClienteSheet } from '@/components/serpro/PagamentosClienteSheet';
import { useConsultaPagamentos } from '@/components/serpro/useConsultaPagamentos';
import { useConsultaPgdasd } from '@/components/serpro/pgdasdUi';
import { competenciaPadrao, mesDeData, siglaCompetencia, useMatrizPagamentos, type TipoDoc } from '@/hooks/useSerproPagamentos';
import { anoDe, duplicidadeDas, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { unificarLinhas, type DasUnificado, type LinhaUnificada } from '@/hooks/useSerproDasUnificado';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  mei: 'MEI',
  isento: 'Isento',
};

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ddmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

const TIPOS_COLUNA: TipoDoc[] = ['DARF', 'DAE'];

type Situacao = 'todos' | 'das_pago' | 'das_vencido' | 'das_a_vencer' | 'sem_das' | 'novo' | 'nao_consultados' | 'consultados' | 'alerta';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os ativos' },
  { value: 'das_pago', label: 'DAS pago' },
  { value: 'das_vencido', label: 'DAS vencido, sem pagamento' },
  { value: 'das_a_vencer', label: 'DAS a vencer' },
  { value: 'sem_das', label: 'Sem DAS gerado' },
  { value: 'novo', label: 'Pagamento novo' },
  { value: 'nao_consultados', label: 'Não consultados' },
  { value: 'consultados', label: 'Consultados' },
  { value: 'alerta', label: 'Com alerta' },
];

/** Rótulo do DAS na matriz. Cliente sem dado (não consultado, filial, outro regime) fica com traço. */
function rotuloDas(d: DasUnificado): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' } | null {
  switch (d.estado) {
    case 'pago': return { label: 'Pago', tone: 'ok' };
    case 'a_vencer': return { label: `Vence ${ddmm(d.vencimento!)}`, tone: 'warn' };
    case 'vencido': return { label: `Vencido ${ddmm(d.vencimento!)}`, tone: 'danger' };
    case 'sem_das': return { label: 'Sem DAS', tone: 'info' };
    default: return null;
  }
}

const duplicidade = (l: LinhaUnificada, pa: string) => l.duplicidade || (!!l.simples && duplicidadeDas(l.simples, pa));
const alerta = (l: LinhaUnificada, pa: string) => duplicidade(l, pa) || l.saldo;
const alertasTexto = (l: LinhaUnificada, pa: string) => [duplicidade(l, pa) && 'Duplicidade', l.saldo && 'Saldo a verificar'].filter(Boolean).join(' · ');

function tabelaExport(linhas: LinhaUnificada[], competencia: string): TabelaExport {
  return {
    arquivo: `das-e-pagamentos-${competencia}`,
    titulo: `DAS e pagamentos na Receita — competência ${siglaCompetencia(competencia)}`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Competência', 'DAS', 'Vencimento do DAS', 'Valor do DAS', 'DARF', 'DAE', 'Outros', 'Alertas', 'Pagamento novo', 'Consultado em'],
    linhas: linhas.map((l) => {
      const c = l.consultadoEm !== null;
      const r = rotuloDas(l.das);
      return [
        l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', siglaCompetencia(competencia),
        r?.label ?? '', r && l.das.vencimento ? format(new Date(`${l.das.vencimento}T00:00:00`), 'dd/MM/yyyy') : '', l.das.valor != null ? moeda(l.das.valor) : '',
        ...(['DARF', 'DAE'] as TipoDoc[]).map((t) => (c ? String(l.contagem[t]) : '')),
        c ? String(l.contagem.DJE + l.contagem.OUTRO) : '',
        alertasTexto(l, competencia), l.novo ? 'Sim' : '', l.ultimaConsulta ? format(new Date(l.ultimaConsulta), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  };
}

export default function PagamentosFederal() {
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const ano = anoDe(competencia);
  const { data: pagamentos = [], isLoading: carregandoPag } = useMatrizPagamentos(competencia);
  const { data: simples = [], isLoading: carregandoSn } = useMatrizPgdasd(ano);
  const consultaPag = useConsultaPagamentos(competencia);
  const consultaDas = useConsultaPgdasd(ano);
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [regime, setRegime] = useState('todos');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [aberto, setAberto] = useState<string | null>(null);

  const isLoading = carregandoPag || carregandoSn;
  const linhas = useMemo(() => unificarLinhas(pagamentos, simples, competencia), [pagamentos, simples, competencia]);
  const limite = mesDeData(new Date());

  const stats = useMemo(() => {
    const consultados = linhas.filter((l) => l.ultimaConsulta);
    return {
      total: linhas.length,
      consultados: consultados.length,
      dasPagos: linhas.filter((l) => l.das.estado === 'pago').length,
      dasVencidos: linhas.filter((l) => l.das.estado === 'vencido').length,
      novos: linhas.filter((l) => l.novo).length,
    };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        switch (situacao) {
          case 'das_pago': return l.das.estado === 'pago';
          case 'das_vencido': return l.das.estado === 'vencido';
          case 'das_a_vencer': return l.das.estado === 'a_vencer';
          case 'sem_das': return l.das.estado === 'sem_das';
          case 'novo': return l.novo;
          case 'nao_consultados': return !l.ultimaConsulta;
          case 'consultados': return !!l.ultimaConsulta;
          case 'alerta': return alerta(l, competencia);
          default: return true;
        }
      })
      .filter((l) => regime === 'todos' || (l.regime ?? 'outros') === regime)
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, regime, competencia]);

  const linhaAberta = linhas.find((l) => l.contact_id === aberto) ?? null;

  const chip = (l: LinhaUnificada, tipo: TipoDoc) => {
    if (!l.consultadoEm) return <span className="text-muted-ink-2">—</span>;
    const n = l.contagem[tipo];
    return <DsBadge tone={n > 0 ? 'ok' : 'neutral'} dot={false}>{n}</DsBadge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard fiscal · pagamentos e das"
        title="Pagamentos e DAS."
        subtitle="Documentos de arrecadação pagos na Receita (DARF e DAE) e o DAS do Simples (gerado, pago, a vencer ou vencido) por cliente ativo e competência. O aviso de pagamento novo vem da rotina diária das 07:35, sem custo. A situação do DAS é atualizada pela rotina do PGDAS (dia 16 e dia seguinte ao prazo) ou por Atualizar DAS no painel do cliente. Para ver valor, data e composição, abra o cliente e use Consultar pagamentos. A Receita só informa o que foi pago: zero em um mês consultado não prova que não havia o que pagar."
        actions={<ExportarMenu montar={() => tabelaExport(filtradas, competencia)} disabled={filtradas.length === 0} escolherColunas />}
      />

      <CompetenciaNav competencia={competencia} onChange={setCompetencia} limite={limite} />

      <StatCardRow
        items={[
          { label: 'Consultados', value: `${stats.consultados} de ${stats.total}`, hint: 'clientes ativos, um por vez' },
          { label: 'DAS pagos', value: stats.dasPagos, hint: 'segundo a Receita' },
          { label: 'DAS vencidos', value: stats.dasVencidos, hint: 'sem pagamento registrado', emphasis: stats.dasVencidos > 0 ? 'warm' : 'none' },
          { label: 'Pagamento novo', value: stats.novos, hint: 'a Receita mexeu; consulte', emphasis: stats.novos > 0 ? 'warm' : 'none' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
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
                <TableHead>DAS</TableHead>
                {TIPOS_COLUNA.map((t) => <TableHead key={t} className="text-center">{t}</TableHead>)}
                <TableHead>Situação</TableHead>
                <TableHead className="text-center">Ver</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const r = rotuloDas(l.das);
                return (
                  <TableRow key={l.contact_id} className="cursor-pointer" onClick={() => setAberto(l.contact_id)}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell>
                      {r ? (
                        <div className="space-y-0.5">
                          <DsBadge tone={r.tone}>{r.label}</DsBadge>
                          {l.das.valor != null && <p className="text-meta text-muted-ink-2">{moeda(l.das.valor)}</p>}
                        </div>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    {TIPOS_COLUNA.map((t) => <TableCell key={t} className="text-center">{chip(l, t)}</TableCell>)}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.novo && <DsBadge tone="warn">Pagamento novo</DsBadge>}
                        {duplicidade(l, competencia) && <DsBadge tone="danger">Duplicidade</DsBadge>}
                        {l.saldo && <DsBadge tone="info">Saldo</DsBadge>}
                        {l.semProcuracao && <DsBadge tone="neutral">Sem procuração</DsBadge>}
                        {!l.novo && !duplicidade(l, competencia) && !l.saldo && !l.semProcuracao && (
                          <span className="text-meta text-muted-ink-2">
                            {l.ultimaConsulta ? `Consultado ${format(new Date(l.ultimaConsulta), 'dd/MM HH:mm')}` : 'Não consultado'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <DicaBotao texto="Abre o painel do cliente com o DAS e os pagamentos já salvos. Não consulta a Receita.">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setAberto(l.contact_id); }}>
                          <Eye className="h-4 w-4" />
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

      <PagamentosClienteSheet
        linha={linhaAberta}
        competencia={competencia}
        consultando={!!linhaAberta && consultaPag.emAndamento === linhaAberta.contact_id}
        consultandoDas={!!linhaAberta && consultaDas.emAndamento === linhaAberta.contact_id}
        onConsultar={(id) => consultaPag.executar(id)}
        onConsultarDas={(id) => consultaDas.executar(id)}
        onClose={() => setAberto(null)}
      />
      {consultaPag.dialog}
      {consultaDas.dialog}
    </div>
  );
}
