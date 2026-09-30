import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, FileText, Loader2, Receipt, RefreshCw } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirDefis, useConsultaDefis } from '@/components/serpro/defisUi';
import {
  TIPO_DEFIS, defisDoAno, prazoDefis, statusDefis, useMatrizDefis, type StatusDefis,
} from '@/hooks/useSerproDefis';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

type Situacao = 'todos' | 'nao_consultados' | 'entregues' | 'em_atraso' | 'a_entregar';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'nao_consultados', label: 'Não consultados' },
  { value: 'entregues', label: 'Entregues' },
  { value: 'em_atraso', label: 'Não entregues (prazo vencido)' },
  { value: 'a_entregar', label: 'A entregar (no prazo)' },
];

function rotulo(s: StatusDefis): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (s) {
    case 'entregue': return { label: 'Entregue', tone: 'ok' };
    case 'retificada': return { label: 'Retificada', tone: 'ok' };
    case 'em_atraso': return { label: 'Não entregue', tone: 'danger' };
    case 'a_entregar': return { label: 'A entregar', tone: 'info' };
    case 'filial': return { label: 'Filial (matriz)', tone: 'neutral' };
    case 'nao_se_aplica': return { label: 'Aberta depois do ano', tone: 'neutral' };
    default: return { label: 'Não consultado', tone: 'neutral' };
  }
}

export default function DefisFederal() {
  const anoMax = new Date().getFullYear() - 1; // a DEFIS do ano em curso só existe depois do fim do ano
  const [ano, setAno] = useState(anoMax);
  const { data: linhas = [], isLoading } = useMatrizDefis();
  const { executar, emAndamento, dialog } = useConsultaDefis();
  const { ocupado, abrir } = useAbrirDefis();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');

  const prazo = prazoDefis(ano);
  const vencido = new Date() > prazo;

  const stats = useMemo(() => {
    const ativos = linhas.filter((l) => !l.filial);
    const st = ativos.map((l) => statusDefis(l, ano));
    const entregues = st.filter((s) => s === 'entregue' || s === 'retificada').length;
    return {
      total: ativos.length,
      consultados: ativos.filter((l) => l.consultadoEm).length,
      entregues,
      semDefis: st.filter((s) => s === 'em_atraso' || s === 'a_entregar').length,
      retificadas: st.filter((s) => s === 'retificada').length,
    };
  }, [linhas, ano]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        const s = statusDefis(l, ano);
        switch (situacao) {
          case 'nao_consultados': return s === 'nao_consultado';
          case 'entregues': return s === 'entregue' || s === 'retificada';
          case 'em_atraso': return s === 'em_atraso';
          case 'a_entregar': return s === 'a_entregar';
          default: return true;
        }
      })
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, ano]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: `defis-${ano}`,
    titulo: `DEFIS — ano-calendário ${ano} (prazo ${format(prazo, 'dd/MM/yyyy')})`,
    colunas: ['Razão social', 'CNPJ', 'Ano-calendário', 'Situação', 'Nº da DEFIS', 'Tipo', 'Transmissão', 'Consultado em'],
    linhas: filtradas.map((l) => {
      const d = defisDoAno(l, ano);
      return [
        l.nome, formatarCnpj(l.documento), String(ano), rotulo(statusDefis(l, ano)).label, d?.id_defis ?? '', d ? TIPO_DEFIS[d.tipo] : '',
        d?.transmitida_em ? format(new Date(d.transmitida_em), 'dd/MM/yyyy HH:mm') : '', l.consultadoEm ? format(new Date(l.consultadoEm), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · defis"
        title="DEFIS."
        subtitle={`Declaração anual do Simples Nacional dos clientes ativos, por ano-calendário. O prazo é 31 de março do ano seguinte. Uma consulta por cliente traz todas as DEFIS dele de uma vez. "Não entregue" só vale para clientes já consultados e não considera se o cliente estava no Simples naquele ano: confira antes de cobrar. Filiais seguem a matriz.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <div className="flex justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-paper p-1.5">
          <DicaBotao texto="Volta para o ano-calendário anterior.">
            <Button size="icon" variant="ghost" className="h-9 w-9" disabled={ano <= 2018} onClick={() => setAno(ano - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </DicaBotao>
          <div className="min-w-[200px] text-center">
            <p className="text-[15px] font-medium text-ink">Ano-calendário {ano}</p>
            <p className="text-meta text-muted-ink-2">Prazo: {format(prazo, 'dd/MM/yyyy')}</p>
          </div>
          <DicaBotao texto={ano >= anoMax ? 'Este já é o último ano que pode ter DEFIS.' : 'Avança para o ano-calendário seguinte.'}>
            <Button size="icon" variant="ghost" className="h-9 w-9" disabled={ano >= anoMax} onClick={() => setAno(ano + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </DicaBotao>
        </div>
      </div>

      <StatCardRow
        items={[
          { label: 'Consultados', value: `${stats.consultados} de ${stats.total}`, hint: 'clientes do Simples, um por vez' },
          { label: `Entregues em ${ano}`, value: stats.entregues, hint: stats.retificadas ? `${stats.retificadas} retificadoras` : 'entre os consultados' },
          {
            label: vencido ? 'Não entregues' : 'A entregar', value: stats.semDefis,
            hint: vencido ? 'prazo já passou' : `vence em ${format(prazo, 'dd/MM')}`,
            emphasis: vencido && stats.semDefis > 0 ? 'warm' : 'none',
          },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
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
                <TableHead>Nº da DEFIS</TableHead>
                <TableHead>Transmissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Documentos</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const d = defisDoAno(l, ano);
                const st = statusDefis(l, ano);
                const r = rotulo(st);
                const consultando = emAndamento === l.contact_id;
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">Simples Nacional{l.anoAbertura ? ` · aberta em ${l.anoAbertura}` : ''}</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell className="font-mono text-ui">{d?.id_defis ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{d?.transmitida_em ? format(new Date(d.transmitida_em), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <DsBadge tone={r.tone}>{r.label}</DsBadge>
                        {d && d.tipo >= 3 && <DsBadge tone="info" dot={false}>Situação especial</DsBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {d ? (
                        <div className="flex items-center justify-center gap-1">
                          <DicaBotao custo={d.declaracao_path ? undefined : 'Consultar'}
                            texto={d.declaracao_path ? 'Abre o PDF da DEFIS transmitida, que já está guardado.' : 'Baixa da Receita o PDF da DEFIS transmitida e guarda.'}>
                            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${d.id}:declaracao`} onClick={() => abrir(d, l.contact_id, 'declaracao')}>
                              {ocupado === `${d.id}:declaracao` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            </Button>
                          </DicaBotao>
                          <DicaBotao custo={d.recibo_path ? undefined : 'Consultar'}
                            texto={d.recibo_path ? 'Abre o recibo de entrega da DEFIS, que já está guardado.' : 'Baixa da Receita o recibo de entrega da DEFIS e guarda.'}>
                            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${d.id}:recibo`} onClick={() => abrir(d, l.contact_id, 'recibo')}>
                              {ocupado === `${d.id}:recibo` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                            </Button>
                          </DicaBotao>
                        </div>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo={l.filial ? undefined : 'Consultar'}
                        texto={l.filial ? 'Filial: a DEFIS é da matriz. Consulte o CNPJ da matriz.' : 'Consulta na Receita todas as DEFIS transmitidas por este cliente, de todos os anos, numa só chamada.'}>
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

      <p className="text-meta text-muted-ink-2">Mostrando {filtradas.length} de {linhas.length} clientes do Simples Nacional · ano-calendário {ano}.</p>
      {dialog}
    </div>
  );
}
