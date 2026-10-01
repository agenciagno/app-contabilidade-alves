import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import {
  DIAS_AVISO_PROCURACAO, HORAS_MAPA_RECENTE, useMapearProcuracao, useProcuracoes, vencendo,
  type LinhaProcuracao, type SituacaoProcuracao,
} from '@/hooks/useSerproProcuracoes';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = {
  simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento',
};
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

type Filtro = 'todos' | 'sem' | 'vencendo' | 'vencida' | 'parcial' | 'nao_mapeado';
const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'sem', label: 'Sem procuração' },
  { value: 'vencendo', label: `Vencendo em ${DIAS_AVISO_PROCURACAO} dias` },
  { value: 'vencida', label: 'Vencida' },
  { value: 'parcial', label: 'Parcial (faltam serviços)' },
  { value: 'nao_mapeado', label: 'Ainda não mapeado' },
];

function rotulo(s: SituacaoProcuracao): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (s) {
    case 'total': return { label: 'Completa', tone: 'ok' };
    case 'parcial': return { label: 'Parcial', tone: 'warn' };
    case 'sem': return { label: 'Sem procuração', tone: 'danger' };
    case 'vencida': return { label: 'Vencida', tone: 'danger' };
    default: return { label: 'Não mapeado', tone: 'neutral' };
  }
}

export default function ProcuracoesFederal() {
  const { data: linhas = [], isLoading } = useProcuracoes();
  const mapear = useMapearProcuracao();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<LinhaProcuracao | null>(null);
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const stats = useMemo(() => ({
    total: linhas.length,
    completas: linhas.filter((l) => l.situacao === 'total').length,
    sem: linhas.filter((l) => l.situacao === 'sem').length,
    vencendo: linhas.filter((l) => l.situacao !== 'vencida' && vencendo(l)).length,
    vencidas: linhas.filter((l) => l.situacao === 'vencida').length,
    naoMapeados: linhas.filter((l) => l.situacao === 'nao_mapeado').length,
  }), [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        switch (filtro) {
          case 'sem': return l.situacao === 'sem';
          case 'vencendo': return l.situacao !== 'vencida' && vencendo(l);
          case 'vencida': return l.situacao === 'vencida';
          case 'parcial': return l.situacao === 'parcial';
          case 'nao_mapeado': return l.situacao === 'nao_mapeado';
          default: return true;
        }
      })
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, filtro]);

  const executar = async (l: LinhaProcuracao) => {
    setEmAndamento(l.contact_id);
    try {
      const r = await mapear.mutateAsync({ contactId: l.contact_id });
      if (r.foraDoMonitoramento || !r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return; }
      toast.success('Procurações deste cliente atualizadas.');
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha na consulta. Tente novamente em instantes.');
    } finally {
      setEmAndamento(null);
    }
  };
  const pedir = (l: LinhaProcuracao) => {
    const recente = l.mapeadoEm && Date.now() - Date.parse(l.mapeadoEm) < HORAS_MAPA_RECENTE * 3600_000;
    if (recente) setAConfirmar(l); else executar(l);
  };

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'procuracoes',
    titulo: 'Procurações eletrônicas (e-CAC) dos clientes ativos',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Vence em', 'Dias para vencer', 'Serviços sem procuração', 'Mapeado em'],
    linhas: filtradas.map((l) => [
      l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', rotulo(l.situacao).label,
      l.venceEm ? dataBR(l.venceEm) : '', l.diasParaVencer !== null ? String(l.diasParaVencer) : '',
      l.situacao === 'sem' ? 'Todos' : l.faltam.join(', '), l.mapeadoEm ? format(new Date(l.mapeadoEm), 'dd/MM/yyyy HH:mm') : '',
    ]),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · procurações"
        title="Procurações."
        subtitle={`Procurações eletrônicas que os clientes ativos deram à Contabilidade Alves no e-CAC. Sem procuração, o Serpro não entrega os dados do cliente. Quando o cliente outorgar, clique em Mapear para o sistema enxergar. Um aviso semanal chega no sino quando alguma vence em até ${DIAS_AVISO_PROCURACAO} dias.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <StatCardRow
        items={[
          { label: 'Completas', value: `${stats.completas} de ${stats.total}`, hint: 'todos os serviços que o sistema usa' },
          { label: 'Sem procuração', value: stats.sem, hint: 'o cliente precisa outorgar no e-CAC', emphasis: stats.sem > 0 ? 'warm' : 'none' },
          { label: `Vencendo em ${DIAS_AVISO_PROCURACAO} dias`, value: stats.vencendo + stats.vencidas, hint: stats.vencidas ? `${stats.vencidas} já vencida(s)` : 'peça a renovação com antecedência', emphasis: stats.vencendo + stats.vencidas > 0 ? 'warm' : 'none' },
          { label: 'Ainda não mapeados', value: stats.naoMapeados, hint: 'clique em Mapear no cliente' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>{FILTROS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
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
                <TableHead>Vence em</TableHead>
                <TableHead>Serviços sem procuração</TableHead>
                <TableHead>Mapeado em</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const r = rotulo(l.situacao);
                const consultando = emAndamento === l.contact_id;
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}{l.filial ? ' · Filial' : ''}</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <DsBadge tone={r.tone}>{r.label}</DsBadge>
                        {l.perdidaEm && (
                          <DicaBotao texto="O sensor diário da Receita não reconhece mais a procuração deste cliente, mesmo o mapa dando como ativa. Peça para outorgar de novo e use Mapear para confirmar.">
                            <DsBadge tone="danger">Perdida (sensor)</DsBadge>
                          </DicaBotao>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui">
                      {l.venceEm ? (
                        <span className={l.diasParaVencer !== null && l.diasParaVencer <= DIAS_AVISO_PROCURACAO ? 'text-danger' : 'text-muted-ink'}>
                          {dataBR(l.venceEm)}{l.diasParaVencer !== null && l.diasParaVencer <= DIAS_AVISO_PROCURACAO ? ` · ${l.diasParaVencer} dias` : ''}
                        </span>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-meta text-muted-ink">
                      {l.situacao === 'sem' || l.situacao === 'vencida' ? 'Todos' : l.situacao === 'parcial' ? l.faltam.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-meta text-muted-ink-2">{l.mapeadoEm ? format(new Date(l.mapeadoEm), 'dd/MM/yyyy HH:mm') : 'Nunca'}</TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo="Consultar" texto="Consulta na Receita quais procurações este cliente deu à Contabilidade Alves e até quando valem. Use depois que o cliente outorgar ou renovar no e-CAC.">
                        <Button size="sm" variant="outline" disabled={consultando} onClick={() => pedir(l)}>
                          {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          Mapear<Preco tipo="Consultar" />
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

      <AlertDialog open={!!aConfirmar} onOpenChange={(o) => !o && setAConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este cliente foi mapeado há pouco</AlertDialogTitle>
            <AlertDialogDescription>
              Só vale a pena mapear de novo se o cliente acabou de outorgar ou renovar a procuração no e-CAC e a mudança ainda não apareceu aqui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <DicaBotao className={DICA_RODAPE} texto="Fecha sem consultar.">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
            </DicaBotao>
            <DicaBotao className={DICA_RODAPE} custo="Consultar" texto="Consulta a Receita de novo, mesmo já tendo mapeado há pouco.">
              <AlertDialogAction onClick={() => { const l = aConfirmar!; setAConfirmar(null); executar(l); }}>
                Mapear de novo<Preco tipo="Consultar" />
              </AlertDialogAction>
            </DicaBotao>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
