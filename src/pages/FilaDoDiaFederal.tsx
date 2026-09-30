import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { MOTIVOS_FILA, useFilaDoDia, type MotivoFila } from '@/hooks/useSerproFilaDoDia';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = { simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento' };
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const somenteDigitos = (v: string) => v.replace(/\D/g, '');

type Filtro = 'todos' | MotivoFila;
const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos os motivos' },
  { value: 'intimacao', label: 'Mensagem que exige ação' },
  { value: 'mensagem_nova', label: 'Mensagem nova' },
  { value: 'pagamento_novo', label: 'Pagamento novo' },
  { value: 'dctfweb', label: 'Movimento na DCTFWeb' },
  { value: 'procuracao', label: 'Procuração vencendo' },
  { value: 'parcela_atrasada', label: 'Parcela em atraso' },
  { value: 'sitfis', label: 'Pendência na Situação Fiscal' },
];

export default function FilaDoDiaFederal() {
  const { itens, totalAtivos, caixasComMensagemNaoLida, semProcuracao, carregando } = useFilaDoDia();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const stats = useMemo(() => {
    const com = (...ms: MotivoFila[]) => itens.filter((i) => i.motivos.some((m) => ms.includes(m.motivo))).length;
    return {
      total: itens.length,
      acao: com('intimacao'),
      novidades: com('mensagem_nova', 'pagamento_novo', 'dctfweb'),
      conhecidas: com('parcela_atrasada', 'sitfis', 'procuracao'),
    };
  }, [itens]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return itens
      .filter((i) => filtro === 'todos' || i.motivos.some((m) => m.motivo === filtro))
      .filter((i) => !q || i.nome.toLowerCase().includes(q) || (qDigitos && somenteDigitos(i.documento).includes(qDigitos)));
  }, [itens, busca, filtro]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'fila-do-dia',
    titulo: `Fila do dia — ${format(new Date(), "dd/MM/yyyy")}`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'O que aconteceu'],
    linhas: filtrados.map((i) => [
      i.nome, formatarCnpj(i.documento), REGIMES[i.regime ?? ''] ?? i.regime ?? '',
      i.motivos.map((m) => (m.detalhe ? `${m.texto} (${m.detalhe})` : m.texto)).join('; '),
    ]),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · fila do dia"
        title="Fila do dia."
        subtitle={`${format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}. O que a Receita mexeu ou avisou e pede uma olhada, cliente por cliente, dos mais urgentes para os menos. Esta tela só mostra o que já está salvo no sistema: não consulta o Serpro e não gera custo. Os avisos dos sensores somem quando você consulta o cliente na tela própria.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtrados.length === 0} />}
      />

      <StatCardRow
        items={[
          { label: 'Clientes na fila', value: `${stats.total} de ${totalAtivos}`, hint: 'clientes ativos acompanhados' },
          { label: 'Exigem ação', value: stats.acao, hint: 'mensagem da Receita com ação pendente', emphasis: stats.acao > 0 ? 'warm' : 'none' },
          { label: 'Novidades da Receita', value: stats.novidades, hint: 'mensagem, pagamento ou DCTFWeb', emphasis: stats.novidades > 0 ? 'warm' : 'none' },
          { label: 'Pendências conhecidas', value: stats.conhecidas, hint: 'parcela, situação fiscal ou procuração' },
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
        {carregando ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">
            {itens.length === 0 ? 'Nada novo por enquanto. Quando a Receita mexer em algum cliente, ele aparece aqui.' : 'Nenhum cliente encontrado com esse filtro.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>O que aconteceu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((i) => (
                <TableRow key={i.contact_id}>
                  <TableCell className="align-top">
                    <p className="text-ui text-ink">{i.nome}</p>
                    <p className="text-meta text-muted-ink-2">{REGIMES[i.regime ?? ''] ?? i.regime ?? 'Sem regime'}</p>
                  </TableCell>
                  <TableCell className="align-top font-mono text-ui">{formatarCnpj(i.documento)}</TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      {i.motivos.map((m) => (
                        <div key={m.motivo + m.texto} className="flex flex-wrap items-center gap-2">
                          <DsBadge tone={m.tom}>{m.texto}</DsBadge>
                          {m.detalhe && <span className="text-meta text-muted-ink-2">{m.detalhe}</span>}
                          <DicaBotao texto={MOTIVOS_FILA[m.motivo].dica}>
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                              <Link to={`${MOTIVOS_FILA[m.motivo].rota}?q=${somenteDigitos(i.documento)}`}>
                                Abrir<ArrowRight className="ml-1 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </DicaBotao>
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

      <p className="text-meta text-muted-ink-2">
        Fora da fila de propósito, por serem situação antiga e não novidade do dia:{' '}
        <Link className="underline underline-offset-2" to="/mensagens">{caixasComMensagemNaoLida} caixas com mensagem não lida</Link>
        {' '}e{' '}
        <Link className="underline underline-offset-2" to="/dashboard-federal/procuracoes">{semProcuracao} clientes sem procuração</Link>.
      </p>
    </div>
  );
}
