import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, FileSearch, Loader2 } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { FaturamentoClienteSheet, NivelLimiteBadge, ROTULO_REGIME, moeda } from '@/components/serpro/FaturamentoClienteSheet';
import { useLeituraFaturamento } from '@/components/serpro/useLeituraFaturamento';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { competenciaPadrao, mesDeData, rotuloCompetencia, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import { anoDe, declaracaoVigente, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import {
  ROTULO_NIVEL_LIMITE, faturamentoVigente, nivelLimite, nivelSublimite, percentualLimite, useFaturamentoAno,
  type FaturamentoRow,
} from '@/hooks/useSerproFaturamento';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

type Situacao = 'todos' | 'limite' | 'sublimite' | 'fator_r' | 'caixa' | 'lidos' | 'nao_lidos' | 'conferir';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'limite', label: 'Perto do limite (80% ou mais)' },
  { value: 'sublimite', label: 'Perto ou acima do sublimite' },
  { value: 'fator_r', label: 'Com fator r' },
  { value: 'caixa', label: 'Regime de caixa' },
  { value: 'lidos', label: 'Declaração lida' },
  { value: 'nao_lidos', label: 'Declaração não lida' },
  { value: 'conferir', label: 'Leitura a conferir' },
];

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export default function FaturamentoFederal() {
  const [params] = useSearchParams();
  const filtroInicial = params.get('filtro');
  const [pa, setPa] = useState(competenciaPadrao());
  const ano = anoDe(pa);
  const { data: linhas = [], isLoading } = useMatrizPgdasd(ano);
  const { data: leituras = [], isLoading: carregandoLeituras } = useFaturamentoAno(ano);
  const { executar, emAndamento } = useLeituraFaturamento();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [situacao, setSituacao] = useState<Situacao>(SITUACOES.some((s) => s.value === filtroInicial) ? (filtroInicial as Situacao) : 'todos');
  const [aberto, setAberto] = useState<string | null>(null);

  const limite = mesDeData(new Date());

  // Filiais seguem a matriz: ficam de fora.
  const base = useMemo(() => linhas.filter((l) => !l.filial).map((l) => ({
    l,
    decl: declaracaoVigente(l, pa),
    fat: faturamentoVigente(l, leituras, pa),
  })), [linhas, leituras, pa]);

  const stats = useMemo(() => {
    const comDecl = base.filter((x) => x.decl);
    const lidos = base.filter((x) => x.fat);
    const nivel = (x: { fat: FaturamentoRow | null }) => (x.fat ? nivelLimite(x.fat) : null);
    return {
      comDecl: comDecl.length,
      lidos: lidos.length,
      atencao: lidos.filter((x) => ['atencao', 'critico'].includes(nivel(x) ?? '')).length,
      acima: lidos.filter((x) => nivel(x) === 'acima' || nivelSublimite(x.fat!) === 'acima').length,
      conferir: lidos.filter((x) => !x.fat!.confiavel).length,
    };
  }, [base]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return base
      .filter(({ fat }) => {
        switch (situacao) {
          case 'limite': return !!fat && ['atencao', 'critico', 'acima'].includes(nivelLimite(fat) ?? '');
          case 'sublimite': return !!fat && ['perto', 'acima'].includes(nivelSublimite(fat) ?? '');
          case 'fator_r': return !!fat && fat.fator_r_aplica === true;
          case 'caixa': return !!fat && fat.regime_apuracao === 'caixa';
          case 'lidos': return !!fat;
          case 'nao_lidos': return !fat;
          case 'conferir': return !!fat && !fat.confiavel;
          default: return true;
        }
      })
      .filter(({ l }) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [base, busca, situacao]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: `faturamento-${pa}`,
    titulo: `Faturamento do Simples Nacional — declaração do período ${siglaCompetencia(pa)}`,
    colunas: ['Razão social', 'CNPJ', 'Nº da declaração', 'Regime de apuração', 'Receita do mês', 'Últimos 12 meses', 'No ano', 'Limite', '% do limite', 'Sublimite', 'Situação do limite', 'Fator r', 'Leitura'],
    linhas: filtradas.map(({ l, fat }) => {
      const p = fat ? percentualLimite(fat) : null;
      const n = fat ? nivelLimite(fat) : null;
      return [
        l.nome, formatarCnpj(l.documento), fat?.numero_declaracao ?? '', fat?.regime_apuracao ? ROTULO_REGIME[fat.regime_apuracao] : '',
        fat?.confiavel ? moeda(fat.rpa_total) : '', fat?.confiavel ? moeda(fat.rbt12_total) : '', fat?.confiavel ? moeda(fat.rba_total) : '',
        fat?.confiavel ? moeda(fat.limite_total) : '', fat?.confiavel && p !== null ? pct(p) : '', fat?.confiavel ? moeda(fat.sublimite) : '',
        n ? ROTULO_NIVEL_LIMITE[n] : '', fat?.fator_r_texto ?? '', fat ? (fat.confiavel ? 'Confiável' : 'A conferir') : 'Não lida',
      ];
    }),
  });

  const linhaAberta = base.find((x) => x.l.contact_id === aberto) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · faturamento"
        title="Faturamento."
        subtitle={`Receita e limites do Simples Nacional, lidos do PDF da declaração PGDAS-D do período (regra fixa de leitura, sem IA). Comece pela tela PGDAS: consulte o ano do cliente; abrir a declaração já faz a leitura. Se a leitura não fechar nas conferências, o número não entra nos alertas.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <CompetenciaNav competencia={pa} onChange={setPa} limite={limite} />

      <StatCardRow
        items={[
          { label: `Declarações lidas em ${siglaCompetencia(pa)}`, value: `${stats.lidos} de ${stats.comDecl}`, hint: 'com declaração no período' },
          { label: 'Atenção ou crítico', value: stats.atencao, hint: '80% ou mais do limite', emphasis: stats.atencao > 0 ? 'warm' : 'none' },
          { label: 'Acima do limite ou sublimite', value: stats.acima, hint: 'confira com o cliente', emphasis: stats.acima > 0 ? 'warm' : 'none' },
          { label: 'Leitura a conferir', value: stats.conferir, hint: 'o PDF não fechou nas conferências', emphasis: stats.conferir > 0 ? 'warm' : 'none' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>{SITUACOES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading || carregandoLeituras ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão social</TableHead>
                <TableHead className="text-right">Receita do mês</TableHead>
                <TableHead className="text-right">12 meses</TableHead>
                <TableHead className="text-right">No ano</TableHead>
                <TableHead className="min-w-[170px]">Limite</TableHead>
                <TableHead>Fator r</TableHead>
                <TableHead className="text-center">Ver</TableHead>
                <TableHead className="text-right">Declaração</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map(({ l, decl, fat }) => {
                const lendo = emAndamento === l.contact_id;
                const p = fat ? percentualLimite(fat) : null;
                const n = fat ? nivelLimite(fat) : null;
                const sub = fat ? nivelSublimite(fat) : null;
                const confiavel = !!fat?.confiavel;
                return (
                  <TableRow key={l.contact_id} className={fat ? 'cursor-pointer' : undefined} onClick={() => fat && setAberto(l.contact_id)}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">
                        {formatarCnpj(l.documento)}{fat?.regime_apuracao ? ` · ${ROTULO_REGIME[fat.regime_apuracao]}` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-ui">{confiavel ? moeda(fat!.rpa_total) : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-ui">{confiavel ? moeda(fat!.rbt12_total) : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-ui">{confiavel ? moeda(fat!.rba_total) : '—'}</TableCell>
                    <TableCell>
                      {confiavel && p !== null ? (
                        <div className="space-y-1">
                          <Progress value={Math.min(100, p)} className="h-1.5" />
                          <div className="flex flex-wrap gap-1">
                            <NivelLimiteBadge f={fat!} />
                            {sub === 'acima' && <DsBadge tone="danger" dot={false}>Sublimite</DsBadge>}
                            {sub === 'perto' && <DsBadge tone="warn" dot={false}>Perto do sublimite</DsBadge>}
                          </div>
                        </div>
                      ) : fat ? (
                        <DsBadge tone="warn">Conferir o PDF</DsBadge>
                      ) : !l.consultadoEm ? (
                        <span className="text-meta text-muted-ink-2">Ano não consultado</span>
                      ) : !decl ? (
                        <span className="text-meta text-muted-ink-2">Sem declaração no mês</span>
                      ) : (
                        <DsBadge tone="info">Não lida</DsBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-ui text-muted-ink">{fat?.fator_r_aplica ? fat.fator_r_texto : fat ? 'Não se aplica' : '—'}</TableCell>
                    <TableCell className="text-center">
                      <DicaBotao texto={fat ? 'Abre o detalhe da declaração: receita mês a mês, tributos, fator r e avisos da leitura.' : 'Ainda não há leitura desta declaração. Use "Ler".'}>
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!fat} onClick={(e) => { e.stopPropagation(); setAberto(l.contact_id); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DicaBotao>
                    </TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo={decl && !decl.declaracao_path ? 'Consultar' : undefined} texto={!decl
                        ? 'Este cliente não tem declaração neste período na lista. Consulte o ano dele na tela PGDAS.'
                        : decl.declaracao_path ? 'Lê os números do PDF da declaração que já está guardado. Não consulta a Receita.'
                          : 'Busca o PDF da declaração deste mês na Receita e lê os números.'}>
                        <Button size="sm" variant="outline" disabled={!decl || lendo}
                          onClick={(e) => { e.stopPropagation(); executar(l.contact_id, pa); }}>
                          {lendo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSearch className="mr-1.5 h-4 w-4" />}
                          {fat ? 'Reler' : 'Ler'}{decl && !decl.declaracao_path && <Preco tipo="Consultar" />}
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

      <p className="text-meta text-muted-ink-2">Mostrando {filtradas.length} de {base.length} clientes do Simples Nacional · {rotuloCompetencia(pa)}.</p>

      {linhaAberta && (
        <FaturamentoClienteSheet
          nome={linhaAberta.l.nome}
          documento={formatarCnpj(linhaAberta.l.documento)}
          contactId={linhaAberta.l.contact_id}
          faturamento={linhaAberta.fat}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}
