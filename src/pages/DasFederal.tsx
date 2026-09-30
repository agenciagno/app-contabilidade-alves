import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileDown, Loader2, RefreshCw } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirArquivo, useConsultaPgdasd, useGerarDasComConfirmacao } from '@/components/serpro/pgdasdUi';
import { competenciaPadrao, mesDeData, rotuloCompetencia, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import { anoDe, dasDoPeriodo, dasReaproveitavel, duplicidadeDas, statusDas, useMatrizPgdasd, type LinhaPgdasd, type StatusDas } from '@/hooks/useSerproPgdasd';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const moeda = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Vencimento do DAS: dia 20 do mês seguinte ao período (não ajusta fim de semana/feriado). */
function prazo(pa: string): Date {
  const [a, m] = pa.split('-').map(Number);
  return new Date(a, m, 20, 23, 59, 59);
}

type Situacao = 'todos' | 'nao_consultados' | 'pagos' | 'nao_pagos' | 'sem_das' | 'alerta';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'nao_consultados', label: 'Não consultados no ano' },
  { value: 'pagos', label: 'DAS pago' },
  { value: 'nao_pagos', label: 'DAS não pago' },
  { value: 'sem_das', label: 'Sem DAS gerado' },
  { value: 'alerta', label: 'Com alerta' },
];

function rotuloStatus(s: StatusDas, vencido: boolean): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (s) {
    case 'pago': return { label: 'Pago', tone: 'ok' };
    case 'parcial': return { label: 'Pago em parte', tone: 'warn' };
    case 'nao_pago': return vencido ? { label: 'Vencido, não pago', tone: 'danger' } : { label: 'Não pago', tone: 'warn' };
    case 'sem_das': return { label: vencido ? 'Sem DAS gerado' : 'DAS a gerar', tone: vencido ? 'danger' : 'info' };
    case 'filial': return { label: 'Filial (matriz)', tone: 'neutral' };
    default: return { label: 'Não consultado', tone: 'neutral' };
  }
}

export default function DasFederal() {
  const [pa, setPa] = useState(competenciaPadrao());
  const ano = anoDe(pa);
  const { data: linhas = [], isLoading } = useMatrizPgdasd(ano);
  const { executar, emAndamento, dialog } = useConsultaPgdasd(ano);
  const { ocupado, abrirExtrato } = useAbrirArquivo();
  const { pedir, gerando, dialog: dialogGerar } = useGerarDasComConfirmacao();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');

  const vencido = new Date() > prazo(pa);
  const limite = mesDeData(new Date());

  const stats = useMemo(() => {
    const ativos = linhas.filter((l) => !l.filial);
    const consultados = ativos.filter((l) => l.consultadoEm);
    const est = (l: LinhaPgdasd) => statusDas(l, pa);
    return {
      total: ativos.length,
      consultados: consultados.length,
      gerados: consultados.filter((l) => est(l) !== 'sem_das').length,
      pagos: consultados.filter((l) => est(l) === 'pago').length,
      naoPagos: consultados.filter((l) => est(l) === 'nao_pago' || est(l) === 'parcial').length,
      alertas: consultados.filter((l) => duplicidadeDas(l, pa)).length,
    };
  }, [linhas, pa]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        const s = statusDas(l, pa);
        switch (situacao) {
          case 'nao_consultados': return s === 'nao_consultado';
          case 'pagos': return s === 'pago';
          case 'nao_pagos': return s === 'nao_pago' || s === 'parcial';
          case 'sem_das': return s === 'sem_das';
          case 'alerta': return duplicidadeDas(l, pa);
          default: return true;
        }
      })
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, pa]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: `das-${pa}`,
    titulo: `DAS do Simples Nacional — período ${siglaCompetencia(pa)}`,
    colunas: ['Razão social', 'CNPJ', 'Competência', 'Nº do DAS', 'Emissão', 'Situação', 'Valor', 'Vencimento', 'Alerta', 'Consultado em'],
    linhas: filtradas.map((l) => {
      const das = dasDoPeriodo(l, pa)[0];
      return [
        l.nome, formatarCnpj(l.documento), siglaCompetencia(pa), das?.numero_das ?? '',
        das?.emitido_em ? format(new Date(das.emitido_em), 'dd/MM/yyyy HH:mm') : '', rotuloStatus(statusDas(l, pa), vencido).label,
        das?.valor_total != null ? moeda(das.valor_total) : '', das?.vencimento ? format(new Date(`${das.vencimento}T00:00:00`), 'dd/MM/yyyy') : '',
        duplicidadeDas(l, pa) ? 'Duplicidade' : '', l.consultadoEm ? format(new Date(l.consultadoEm), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · das"
        title="DAS."
        subtitle={`DAS do Simples Nacional por período de apuração: número, emissão e se a Receita já o deu como pago. Uma consulta por cliente traz o ano inteiro (${ano}). Vencimento no dia 20 do mês seguinte. "Pago" é o que a Receita informa; o comprovante está em Pagamentos.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <CompetenciaNav competencia={pa} onChange={setPa} limite={limite} />

      <StatCardRow
        items={[
          { label: 'Consultados no ano', value: `${stats.consultados} de ${stats.total}`, hint: `clientes do Simples, ${ano}` },
          { label: `DAS gerados em ${siglaCompetencia(pa)}`, value: `${stats.gerados} de ${stats.consultados}`, hint: 'entre os consultados' },
          { label: 'DAS pagos', value: stats.pagos, hint: stats.naoPagos > 0 ? `${stats.naoPagos} ainda não pagos` : 'segundo a Receita' },
          { label: 'Alertas', value: stats.alertas, hint: 'duplicidade de pagamento', emphasis: stats.alertas > 0 ? 'warm' : 'none' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>{SITUACOES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
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
                <TableHead>Nº DAS</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-center">Extrato</TableHead>
                <TableHead className="text-center">Gerar DAS</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const lista = dasDoPeriodo(l, pa);
                const das = lista[0];
                const st = statusDas(l, pa);
                const r = rotuloStatus(st, vencido);
                const consultando = emAndamento === l.contact_id;
                const conferido = !!das && (l.pagamentosPorDocumento.get(das.numero_das) ?? 0) > 0;
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">Simples Nacional</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell className="font-mono text-ui">
                      {das?.numero_das ?? '—'}
                      {lista.length > 1 && <span className="ml-1 text-meta text-muted-ink-2">+{lista.length - 1}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{das?.emitido_em ? format(new Date(das.emitido_em), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <DsBadge tone={r.tone}>{r.label}</DsBadge>
                        {duplicidadeDas(l, pa) && <DsBadge tone="danger" dot={false}>Duplicidade</DsBadge>}
                        {conferido && <DsBadge tone="ok" dot={false}>Conferido em Pagamentos</DsBadge>}
                      </div>
                      {das?.valor_total != null && (
                        <p className="mt-0.5 text-meta text-muted-ink-2">
                          {moeda(das.valor_total)}
                          {das.vencimento ? ` · vence ${format(new Date(`${das.vencimento}T00:00:00`), 'dd/MM/yy')}` : ''}
                          {das.limite_acolhimento && das.limite_acolhimento !== das.vencimento ? ` · pagável até ${format(new Date(`${das.limite_acolhimento}T00:00:00`), 'dd/MM/yy')}` : ''}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {das ? (
                        <DicaBotao custo={das.extrato_path ? undefined : 'Consultar'}
                          texto={das.extrato_path ? 'Abre o extrato do DAS em PDF, que já está guardado.' : 'Baixa da Receita o extrato do DAS em PDF e guarda.'}>
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${das.id}:extrato`} onClick={() => abrirExtrato(das)}>
                            {ocupado === `${das.id}:extrato` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                          </Button>
                        </DicaBotao>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <DicaBotao custo={l.filial || st === 'nao_consultado' || dasReaproveitavel(l, pa) ? undefined : 'Emitir'}
                        texto={l.filial ? 'Filial: o DAS é da matriz. Use o CNPJ da matriz.'
                          : st === 'nao_consultado' ? 'Consulte o ano deste cliente antes de gerar o DAS.'
                            : dasReaproveitavel(l, pa) ? 'Já existe um DAS gerado aqui e dentro do prazo: abre o arquivo guardado, sem emitir outro.'
                              : 'Gera o DAS deste período na Receita e guarda o PDF. Fica registrada uma emissão. Pede confirmação antes.'}>
                        <Button size="sm" variant="outline" disabled={gerando === l.contact_id || l.filial || st === 'nao_consultado'}
                          onClick={() => pedir(l.contact_id, pa, l.nome, dasReaproveitavel(l, pa))}>
                          {gerando === l.contact_id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Gerar DAS
                          {!l.filial && st !== 'nao_consultado' && !dasReaproveitavel(l, pa) && <Preco tipo="Emitir" />}
                        </Button>
                      </DicaBotao>
                    </TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo={l.filial ? undefined : 'Consultar'}
                        texto={l.filial ? 'Filial: o PGDAS-D é da matriz. Consulte o CNPJ da matriz.' : `Consulta na Receita as declarações e os DAS do ano ${ano} inteiro deste cliente, numa só chamada.`}>
                        <Button size="sm" variant="outline" disabled={consultando || l.filial} onClick={() => executar(l.contact_id)}>
                          {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          Consultar{!l.filial && <Preco tipo="Consultar" />}
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

      <p className="text-meta text-muted-ink-2">Mostrando {filtradas.length} de {linhas.length} clientes do Simples Nacional · {rotuloCompetencia(pa)}.</p>
      {dialog}
      {dialogGerar}
    </div>
  );
}
