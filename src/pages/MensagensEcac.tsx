import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Eye, Loader2, RefreshCw } from 'lucide-react';

import { DsTab, PageHeader, SearchField, segmentedListClass, segmentedTriggerClass } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { IntimacoesAba } from '@/components/serpro/IntimacoesAba';
import { MensagensClienteSheet } from '@/components/serpro/MensagensClienteSheet';
import { useConsultaCliente } from '@/components/serpro/useConsultaCliente';
import { FaixaEstados, RodapeLista, SeloMonitor, UltimaBusca, useEstadoUrl } from '@/components/monitor/MonitorUi';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { STATUS_MONITORADO, seloCaixa, useAssuntosCaixa, useClientesCaixa, type ClienteCaixa } from '@/hooks/useSerproCaixaPostal';
import { ROTULO_ESTADO, contarEstados, seloCaixaPostal, type Selo } from '@/lib/monitorEstados';
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
const digitos = (v: string) => v.replace(/\D/g, '');
const ehFilial = (c: ClienteCaixa) => digitos(c.documento).length === 14 && digitos(c.documento).slice(8, 12) !== '0001';

type Aba = 'clientes' | 'intimacoes';
type BuscarPor = 'cliente' | 'assunto';

/**
 * Caixa Postal e-CAC (Rodada 3, 09/10/2026). Duas abas: Clientes (molde único do Monitoramento, selo de `seloCaixaPostal`, o mesmo que o
 * Dashboard Fiscal conta) e Intimações (a antiga tela Termos de intimação). Na aba Clientes dá para buscar pelo assunto das mensagens já baixadas.
 */
export default function MensagensEcac() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get('aba') === 'intimacoes' ? 'intimacoes' : 'clientes';
  const irPara = (a: Aba) => {
    const n = new URLSearchParams(params);
    n.delete('estado');
    if (a === 'clientes') n.delete('aba'); else n.set('aba', a);
    setParams(n, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/caixa postal e-cac" title="Caixa Postal e-CAC." />

      <div className="flex gap-1 border-b border-line">
        <DsTab active={aba === 'clientes'} onClick={() => irPara('clientes')}>Clientes</DsTab>
        <DsTab active={aba === 'intimacoes'} onClick={() => irPara('intimacoes')}>Intimações</DsTab>
      </div>

      {aba === 'clientes' ? <AbaClientes /> : <IntimacoesAba />}
    </div>
  );
}

// ---------------------------------------------------------------- aba Clientes

function AbaClientes() {
  const { data: clientes = [], isLoading } = useClientesCaixa();
  const { executar, emAndamento, dialog } = useConsultaCliente();
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [buscarPor, setBuscarPor] = useState<BuscarPor>('cliente');
  const [aberto, setAberto] = useState<string | null>(null);
  const { data: assuntos = [], isLoading: carregandoAssuntos } = useAssuntosCaixa(buscarPor === 'assunto');

  const seloDe = (c: ClienteCaixa): Selo | null => (emAndamento === c.contact_id
    ? { estado: 'processando', motivo: 'Consultando…' }
    : seloCaixaPostal(seloCaixa(c).estado));

  // Mesmo universo do painel: clientes monitorados, só a matriz.
  const monitorados = useMemo(() => clientes.filter((c) => c.status_cliente === STATUS_MONITORADO), [clientes]);
  const matrizes = useMemo(() => monitorados.filter((c) => !ehFilial(c)), [monitorados]);

  // Busca por assunto: clientes com ao menos uma mensagem baixada cujo assunto tem o texto, e quais são.
  const achadosPorAssunto = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (buscarPor !== 'assunto' || !q) return null;
    const m = new Map<string, string[]>();
    for (const a of assuntos) if (a.assunto.toLowerCase().includes(q)) m.set(a.contact_id, [...(m.get(a.contact_id) ?? []), a.assunto]);
    return m;
  }, [assuntos, busca, buscarPor]);

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = digitos(q);
    if (achadosPorAssunto) return matrizes.filter((c) => achadosPorAssunto.has(c.contact_id));
    if (buscarPor === 'assunto') return matrizes;
    return matrizes.filter((c) => !q || c.nome.toLowerCase().includes(q) || (!!qDigitos && digitos(c.documento).includes(qDigitos)));
  }, [matrizes, busca, buscarPor, achadosPorAssunto]);
  const contagem = contarEstados(base.map(seloDe));
  const filtrados = base.filter((c) => !estado || seloDe(c)?.estado === estado);

  const clienteAberto = clientes.find((c) => c.contact_id === aberto) ?? null;

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'caixa-postal-ecac',
    titulo: 'Caixa Postal e-CAC — por cliente',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Estado', 'Última consulta', 'Mensagens salvas', 'Não lidas (salvas)'],
    linhas: filtrados.map((c) => {
      const s = seloDe(c);
      return [
        c.nome, formatarCnpj(c.documento), REGIMES[c.regime ?? ''] ?? c.regime ?? '', s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '',
        c.consultado_em ? format(new Date(c.consultado_em), 'dd/MM/yyyy HH:mm') : '', String(c.mensagens_salvas), String(c.nao_lidas_salvas),
      ];
    }),
  });

  return (
    <div className="space-y-5">
      {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Tabs value={buscarPor} onValueChange={(v) => setBuscarPor(v as BuscarPor)}>
          <TabsList className={segmentedListClass}>
            <TabsTrigger value="cliente" className={segmentedTriggerClass}>Cliente</TabsTrigger>
            <TabsTrigger value="assunto" className={segmentedTriggerClass}>Assunto</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchField
          placeholder={buscarPor === 'assunto' ? 'Buscar no assunto das mensagens baixadas...' : 'Buscar por razão social ou CNPJ...'}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          wrapperClassName="max-w-[429px] flex-1"
        />
        {buscarPor === 'assunto' && (
          <p className="text-meta text-muted-ink-2">Procura só nas mensagens já baixadas pelo Consultar.</p>
        )}
        <div className="sm:ml-auto"><ExportarMenu montar={tabelaExport} disabled={filtrados.length === 0} escolherColunas /></div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        {isLoading || (buscarPor === 'assunto' && carregandoAssuntos) ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">
            {achadosPorAssunto ? 'Nenhuma mensagem baixada com esse assunto.' : 'Nenhum cliente nesta situação.'}
          </div>
        ) : (
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Situação</TableHead>
                <TableHead>Mensagens baixadas</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((c) => {
                const consultando = emAndamento === c.contact_id;
                const semProcuracao = c.procuracao === 'ausente';
                const achados = achadosPorAssunto?.get(c.contact_id) ?? [];
                return (
                  <TableRow key={c.contact_id} className="cursor-pointer" onClick={() => setAberto(c.contact_id)}>
                    <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(c)} /></TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">
                      {c.consultado_em ? (
                        <>
                          {c.mensagens_salvas} {c.mensagens_salvas === 1 ? 'mensagem' : 'mensagens'}
                          {c.nao_lidas_salvas > 0 && <span className="text-meta text-muted-ink-2"> · {c.nao_lidas_salvas} não {c.nao_lidas_salvas === 1 ? 'lida' : 'lidas'}</span>}
                        </>
                      ) : <span className="text-meta text-muted-ink-2">Lista não baixada</span>}
                    </TableCell>
                    <TableCell className="min-w-[200px] max-w-[320px]">
                      <p className="text-ui text-ink">{c.nome}</p>
                      <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(c.documento)}</p>
                      {achados.length > 0 && (
                        <p className="mt-0.5 line-clamp-2 text-meta text-muted-ink">
                          {achados[0]}{achados.length > 1 ? ` · e mais ${achados.length - 1}` : ''}
                        </p>
                      )}
                    </TableCell>
                    <TableCell><UltimaBusca iso={c.consultado_em} contactId={c.contact_id} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <DicaBotao texto="Abre o painel do cliente com as mensagens já salvas. Não consulta a Receita.">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ver mensagens salvas" onClick={() => setAberto(c.contact_id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DicaBotao>
                        <DicaBotao custo={semProcuracao ? undefined : 'Consultar'}
                          texto={semProcuracao ? 'Sem procuração para a Caixa Postal: peça ao cliente para outorgá-la no e-CAC.'
                            : 'Baixa da Receita a lista de mensagens da Caixa Postal deste cliente. Não registra ciência. O selo é atualizado de graça todo dia às 07:30.'}>
                          <Button size="sm" variant="outline" disabled={consultando || semProcuracao} onClick={() => executar(c.contact_id)}>
                            {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                            Consultar{!semProcuracao && <Preco tipo="Consultar" />}
                          </Button>
                        </DicaBotao>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <RodapeLista mostrando={filtrados.length} total={matrizes.length} unidade="clientes ativos" filiais={monitorados.length - matrizes.length} />

      <MensagensClienteSheet cliente={clienteAberto} onClose={() => setAberto(null)} />
      {dialog}
    </div>
  );
}
