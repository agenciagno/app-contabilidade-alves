import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Eye, Loader2, RefreshCw } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { MensagensClienteSheet } from '@/components/serpro/MensagensClienteSheet';
import { useConsultaCliente } from '@/components/serpro/useConsultaCliente';
import { seloCaixa, useClientesCaixa, type ClienteCaixa, type SeloEstado } from '@/hooks/useSerproCaixaPostal';
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

const FILTROS_SELO: { value: 'todos' | SeloEstado; label: string }[] = [
  { value: 'todos', label: 'Todos os ativos' },
  { value: 'nao_lida', label: 'Msg não lida' },
  { value: 'nova', label: 'Nova mensagem' },
  { value: 'todas_lidas', label: 'Todas lidas' },
  { value: 'sem_procuracao', label: 'Sem procuração' },
  { value: 'nao_verificada', label: 'Não verificada' },
  { value: 'inativo', label: 'Fora do monitoramento' },
];

function tabelaExport(linhas: ClienteCaixa[]): TabelaExport {
  return {
    arquivo: 'mensagens-ecac',
    titulo: 'Mensagens e-CAC — Caixa Postal por cliente',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Mensagens e-CAC', 'Última consulta', 'Mensagens salvas', 'Não lidas (salvas)'],
    linhas: linhas.map((c) => [
      c.nome, formatarCnpj(c.documento), REGIMES[c.regime ?? ''] ?? c.regime ?? '', seloCaixa(c).label,
      c.consultado_em ? format(new Date(c.consultado_em), 'dd/MM/yyyy HH:mm') : '', String(c.mensagens_salvas), String(c.nao_lidas_salvas),
    ]),
  };
}

export default function MensagensEcac() {
  const { data: clientes = [], isLoading } = useClientesCaixa();
  const { executar, emAndamento, dialog } = useConsultaCliente();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const [regime, setRegime] = useState('todos');
  const [aberto, setAberto] = useState<string | null>(null);

  const filtroSelo = (params.get('selo') as 'todos' | SeloEstado) || 'todos';
  const setFiltroSelo = (v: string) => {
    const p = new URLSearchParams(params);
    if (v === 'todos') p.delete('selo'); else p.set('selo', v);
    setParams(p, { replace: true });
  };

  const stats = useMemo(() => {
    const contagem = { inativo: 0, nao_lida: 0, nova: 0, sem_procuracao: 0, todas_lidas: 0, nao_verificada: 0 } as Record<SeloEstado, number>;
    clientes.forEach((c) => { contagem[seloCaixa(c).estado]++; });
    return contagem;
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return clientes
      .filter((c) => (filtroSelo === 'todos' ? seloCaixa(c).estado !== 'inativo' : seloCaixa(c).estado === filtroSelo))
      .filter((c) => regime === 'todos' || (c.regime ?? 'outros') === regime)
      .filter((c) => !q || c.nome.toLowerCase().includes(q) || (qDigitos && c.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [clientes, busca, filtroSelo, regime]);

  const clienteAberto = clientes.find((c) => c.contact_id === aberto) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/mensagens e-cac"
        title="Mensagens e-CAC."
        subtitle="Caixa Postal da Receita Federal dos clientes ativos. O selo é atualizado todo dia às 07:30; a lista completa só é baixada quando você clica em Consultar."
        actions={<ExportarMenu montar={() => tabelaExport(filtrados)} disabled={filtrados.length === 0} />}
      />

      <StatCardRow
        items={[
          { label: 'Clientes monitorados', value: clientes.length - stats.inativo, hint: 'clientes ativos' },
          { label: 'Msg não lida ou nova', value: stats.nao_lida + stats.nova, hint: 'para consultar', emphasis: stats.nao_lida + stats.nova > 0 ? 'warm' : 'none' },
          { label: 'Sem procuração', value: stats.sem_procuracao, hint: 'coletar no e-CAC', emphasis: stats.sem_procuracao > 0 ? 'warm' : 'none' },
          { label: 'Todas lidas', value: stats.todas_lidas, hint: 'nada a fazer' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField
          placeholder="Buscar por razão social ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          wrapperClassName="max-w-[429px] flex-1"
        />
        <Select value={filtroSelo} onValueChange={setFiltroSelo}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTROS_SELO.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
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
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Mensagens e-CAC</TableHead>
                <TableHead>Última consulta</TableHead>
                <TableHead className="text-center">Leitura</TableHead>
                <TableHead className="text-right">Consultar novas mensagens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((c) => {
                const selo = seloCaixa(c);
                const consultando = emAndamento === c.contact_id;
                return (
                  <TableRow key={c.contact_id} className="cursor-pointer" onClick={() => setAberto(c.contact_id)}>
                    <TableCell>
                      <p className="text-ui text-ink">{c.nome}</p>
                      <p className="text-meta text-muted-ink-2">{REGIMES[c.regime ?? ''] ?? c.regime ?? 'Sem regime'}</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(c.documento)}</TableCell>
                    <TableCell><DsBadge tone={selo.tone}>{selo.label}</DsBadge></TableCell>
                    <TableCell className="text-ui text-muted-ink">
                      {c.consultado_em ? format(new Date(c.consultado_em), 'dd/MM/yyyy HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver mensagens salvas (grátis)"
                        onClick={(e) => { e.stopPropagation(); setAberto(c.contact_id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={consultando || c.procuracao === 'ausente' || selo.estado === 'inativo'}
                        title={selo.estado === 'inativo' ? `Fora do monitoramento (${c.status_cliente ?? 'sem status'})` : c.procuracao === 'ausente' ? 'Sem procuração' : 'Baixar a lista de mensagens'}
                        onClick={(e) => { e.stopPropagation(); executar(c.contact_id); }}>
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

      <p className="text-meta text-muted-ink-2">Mostrando {filtrados.length} de {clientes.length - stats.inativo} clientes ativos.</p>

      <MensagensClienteSheet cliente={clienteAberto} onClose={() => setAberto(null)} />
      {dialog}
    </div>
  );
}
