import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Eye, Loader2, RefreshCw } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { PagamentosClienteSheet } from '@/components/serpro/PagamentosClienteSheet';
import { useConsultaPagamentos } from '@/components/serpro/useConsultaPagamentos';
import {
  TIPOS_DOC, competenciaPadrao, deslocarCompetencia, mesDeData, rotuloCompetencia, siglaCompetencia, useMatrizPagamentos,
  type LinhaPagamentos, type TipoDoc,
} from '@/hooks/useSerproPagamentos';
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

type Situacao = 'todos' | 'consultados' | 'nao_consultados' | 'novo' | 'alerta' | 'sem_das';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os ativos' },
  { value: 'novo', label: 'Pagamento novo' },
  { value: 'nao_consultados', label: 'Não consultados no mês' },
  { value: 'consultados', label: 'Consultados no mês' },
  { value: 'sem_das', label: 'Consultados sem DAS' },
  { value: 'alerta', label: 'Com alerta' },
];

const alertasTexto = (l: LinhaPagamentos) => [l.duplicidade && 'Duplicidade', l.saldo && 'Saldo a verificar'].filter(Boolean).join(' · ');

function tabelaExport(linhas: LinhaPagamentos[], competencia: string): TabelaExport {
  return {
    arquivo: `pagamentos-${competencia}`,
    titulo: `Pagamentos na Receita — competência ${siglaCompetencia(competencia)}`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Competência', 'DARF', 'DAS', 'DAE', 'DJE', 'Outros', 'Alertas', 'Pagamento novo', 'Consultado em'],
    linhas: linhas.map((l) => {
      const c = l.consultadoEm !== null;
      return [
        l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', siglaCompetencia(competencia),
        ...(['DARF', 'DAS', 'DAE', 'DJE', 'OUTRO'] as TipoDoc[]).map((t) => (c ? String(l.contagem[t]) : '')),
        alertasTexto(l), l.novo ? 'Sim' : '', l.consultadoEm ? format(new Date(l.consultadoEm), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  };
}

export default function PagamentosFederal() {
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const { data: linhas = [], isLoading } = useMatrizPagamentos(competencia);
  const { executar, emAndamento, dialog } = useConsultaPagamentos(competencia);
  const [busca, setBusca] = useState('');
  const [regime, setRegime] = useState('todos');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [aberto, setAberto] = useState<string | null>(null);

  const limite = mesDeData(new Date());
  const stats = useMemo(() => {
    const consultados = linhas.filter((l) => l.consultadoEm);
    return {
      total: linhas.length,
      consultados: consultados.length,
      comDas: consultados.filter((l) => l.contagem.DAS > 0).length,
      novos: linhas.filter((l) => l.novo).length,
      alertas: linhas.filter((l) => l.duplicidade || l.saldo).length,
    };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        switch (situacao) {
          case 'consultados': return !!l.consultadoEm;
          case 'nao_consultados': return !l.consultadoEm;
          case 'novo': return l.novo;
          case 'alerta': return l.duplicidade || l.saldo;
          case 'sem_das': return !!l.consultadoEm && l.contagem.DAS === 0;
          default: return true;
        }
      })
      .filter((l) => regime === 'todos' || (l.regime ?? 'outros') === regime)
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, regime]);

  const linhaAberta = linhas.find((l) => l.contact_id === aberto) ?? null;

  const chip = (l: LinhaPagamentos, tipo: TipoDoc) => {
    if (!l.consultadoEm) return <span className="text-muted-ink-2">—</span>;
    const n = l.contagem[tipo];
    return <DsBadge tone={n > 0 ? 'ok' : 'neutral'} dot={false}>{n}</DsBadge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · pagamentos"
        title="Pagamentos."
        subtitle="Documentos de arrecadação pagos na Receita (DARF, DAS, DAE e DJE) por cliente ativo e competência. A Receita só informa o que foi pago: zero em um mês consultado não prova que não havia o que pagar. O aviso de pagamento novo vem da rotina diária das 07:35."
        actions={<ExportarMenu montar={() => tabelaExport(filtradas, competencia)} disabled={filtradas.length === 0} escolherColunas />}
      />

      <div className="flex justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-paper p-1.5">
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setCompetencia(deslocarCompetencia(competencia, -1))} title="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[200px] text-center">
            <p className="text-[15px] font-medium text-ink">{rotuloCompetencia(competencia)}</p>
            <p className="text-meta text-muted-ink-2">Período de apuração {siglaCompetencia(competencia)}</p>
          </div>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setCompetencia(deslocarCompetencia(competencia, 1))} disabled={competencia >= limite} title="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <StatCardRow
        items={[
          { label: 'Consultados no mês', value: `${stats.consultados} de ${stats.total}`, hint: 'clientes ativos, um por vez' },
          { label: 'Com DAS pago', value: stats.comDas, hint: 'entre os consultados' },
          { label: 'Pagamento novo', value: stats.novos, hint: 'a Receita mexeu; consulte', emphasis: stats.novos > 0 ? 'warm' : 'none' },
          { label: 'Alertas', value: stats.alertas, hint: 'duplicidade ou saldo a verificar', emphasis: stats.alertas > 0 ? 'warm' : 'none' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
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
                {TIPOS_DOC.map((t) => <TableHead key={t} className="text-center">{t}</TableHead>)}
                <TableHead>Situação</TableHead>
                <TableHead className="text-center">Ver</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const consultando = emAndamento === l.contact_id;
                return (
                  <TableRow key={l.contact_id} className="cursor-pointer" onClick={() => setAberto(l.contact_id)}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    {TIPOS_DOC.map((t) => <TableCell key={t} className="text-center">{chip(l, t)}</TableCell>)}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.novo && <DsBadge tone="warn">Pagamento novo</DsBadge>}
                        {l.duplicidade && <DsBadge tone="danger">Duplicidade</DsBadge>}
                        {l.saldo && <DsBadge tone="info">Saldo</DsBadge>}
                        {l.semProcuracao && <DsBadge tone="neutral">Sem procuração</DsBadge>}
                        {!l.novo && !l.duplicidade && !l.saldo && !l.semProcuracao && (
                          <span className="text-meta text-muted-ink-2">
                            {l.consultadoEm ? `Consultado ${format(new Date(l.consultadoEm), 'dd/MM HH:mm')}` : 'Não consultado'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver pagamentos salvos (grátis)" onClick={(e) => { e.stopPropagation(); setAberto(l.contact_id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={consultando} title="Consultar os pagamentos deste mês"
                        onClick={(e) => { e.stopPropagation(); executar(l.contact_id); }}>
                        {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                        Consultar
                      </Button>
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
        consultando={!!linhaAberta && emAndamento === linhaAberta.contact_id}
        onConsultar={(id) => executar(id)}
        onClose={() => setAberto(null)}
      />
      {dialog}
    </div>
  );
}
