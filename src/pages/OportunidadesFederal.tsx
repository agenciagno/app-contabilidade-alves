import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { brl } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { ROTULO_OPORTUNIDADE, useOportunidades, type TipoOportunidade } from '@/hooks/useSerproOportunidades';
import { siglaCompetencia } from '@/hooks/useSerproPagamentos';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = { simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento' };
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const somenteDigitos = (v: string) => v.replace(/\D/g, '');

type Filtro = 'todos' | TipoOportunidade;
const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todas as oportunidades' },
  { value: 'fator_r', label: 'Fator r' },
  { value: 'limite', label: 'Limite do Simples' },
  { value: 'sublimite', label: 'Sublimite (ICMS/ISS)' },
];

export default function OportunidadesFederal() {
  const { linhas, lidos, totalSimples, carregando } = useOportunidades();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const stats = useMemo(() => {
    const com = (t: TipoOportunidade) => linhas.filter((l) => l.oportunidades.some((o) => o.tipo === t)).length;
    return { total: linhas.length, fatorR: com('fator_r'), limite: com('limite'), sublimite: com('sublimite') };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => filtro === 'todos' || l.oportunidades.some((o) => o.tipo === filtro))
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && somenteDigitos(l.documento).includes(qDigitos)));
  }, [linhas, busca, filtro]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'oportunidades-simples',
    titulo: `Oportunidades de planejamento — ${format(new Date(), 'dd/MM/yyyy')}`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Últimos 12 meses', '% do limite', 'Oportunidades', 'Leitura de'],
    linhas: filtradas.map((l) => [
      l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '',
      l.leitura.rbt12_total != null ? brl(l.leitura.rbt12_total) : '', l.percentual != null ? `${l.percentual.toFixed(1)}%` : '',
      l.oportunidades.map((o) => `${o.titulo}: ${o.detalhe}`).join(' | '), siglaCompetencia(l.leitura.periodo_apuracao.slice(0, 7)),
    ]),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · oportunidades"
        title="Oportunidades."
        subtitle="Clientes do Simples em que a receita que a Receita mostra na declaração abre uma conversa de planejamento: fator r abaixo de 28% (ou quase), perto do limite ou do sublimite, com a projeção do ritmo dos últimos 3 meses. É apoio à decisão do contador, não promessa de economia nem conclusão de enquadramento. Só entram clientes com a declaração já lida na tela Faturamento; não consulta o Serpro e não gera custo."
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} />}
      />

      <StatCardRow
        items={[
          { label: 'Declarações lidas', value: `${lidos} de ${totalSimples}`, hint: 'clientes do Simples com leitura confiável' },
          { label: 'Fator r', value: stats.fatorR, hint: 'abaixo de 28% ou no limite', emphasis: stats.fatorR > 0 ? 'warm' : 'none' },
          { label: 'Perto do limite', value: stats.limite, hint: 'teto do Simples, hoje ou em até 12 meses', emphasis: stats.limite > 0 ? 'warm' : 'none' },
          { label: 'Sublimite', value: stats.sublimite, hint: 'ICMS e ISS saem do DAS acima dele' },
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
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">
            {lidos === 0
              ? 'Ainda não há declarações lidas. Abra a declaração de um cliente na tela PGDAS ou Faturamento e as oportunidades passam a aparecer aqui.'
              : linhas.length === 0 ? 'Nenhuma oportunidade nas declarações lidas até agora.' : 'Nenhum cliente encontrado com esse filtro.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão social</TableHead>
                <TableHead>Últimos 12 meses</TableHead>
                <TableHead>O que aparece</TableHead>
                <TableHead>Leitura de</TableHead>
                <TableHead className="text-center">Faturamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => (
                <TableRow key={l.contact_id}>
                  <TableCell className="align-top">
                    <p className="text-ui text-ink">{l.nome}</p>
                    <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-ui text-ink">
                    {l.leitura.rbt12_total != null ? brl(l.leitura.rbt12_total) : '—'}
                    {l.percentual != null && <p className="text-meta text-muted-ink-2">{l.percentual.toFixed(1)}% do limite</p>}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[560px] space-y-2">
                      {l.oportunidades.map((o) => (
                        <div key={o.tipo + o.titulo} className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <DsBadge tone={o.tom}>{o.titulo}</DsBadge>
                            <span className="text-meta text-muted-ink-2">{ROTULO_OPORTUNIDADE[o.tipo]}</span>
                          </div>
                          <p className="text-meta text-muted-ink">{o.detalhe}</p>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-ui text-muted-ink">{siglaCompetencia(l.leitura.periodo_apuracao.slice(0, 7))}</TableCell>
                  <TableCell className="text-center align-top">
                    <DicaBotao texto="Abre a tela Faturamento já filtrada neste cliente, com os 13 meses e os tributos da declaração.">
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                        <Link to={`/dashboard-federal/faturamento?q=${somenteDigitos(l.documento)}`}>Abrir<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                      </Button>
                    </DicaBotao>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-meta text-muted-ink-2">
        Mostrando {filtradas.length} de {linhas.length} clientes com oportunidade. A projeção assume que os próximos meses repetem a média dos 3 últimos e só vale quando o PDF traz os 13 meses de histórico.
      </p>
    </div>
  );
}
