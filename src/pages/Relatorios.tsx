import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle, ChevronRight, FileBarChart, Tags, Users } from 'lucide-react';
import { IconBox, PageHeader } from '@/components/ds';
import { RelatorioMovimentos, RelatorioInadimplentes, RelatorioCategorias, RelatorioContrapartes } from '@/components/relatorios/RelatoriosAnalise';
import { DreSimplificada } from '@/components/relatorios/DreSimplificada';

/**
 * Aba Relatórios do cliente externo (07/10/2026), modelada no catálogo do Conta Azul
 * só com o que o nosso dado sustenta (sem centro de custo, vendedor, juros/multa/tarifa).
 * Contas a pagar/receber e lançamentos no caixa já existem em Pagar/Receber e Conta
 * Corrente — não se repetem aqui. Uma rota só: o relatório aberto vai em `?r=`.
 */
type Id = 'pagamentos' | 'recebimentos' | 'inadimplentes' | 'categorias' | 'contrapartes' | 'dre';

interface Item { id: Id; titulo: string; descricao: string; icon: ReactNode }

const SECOES: { titulo: string; descricao: string; itens: Item[] }[] = [
  {
    titulo: 'Análise financeira',
    descricao: 'Para ver para onde o dinheiro foi, de onde veio e quem está devendo.',
    itens: [
      { id: 'pagamentos', titulo: 'Pagamentos', descricao: 'O que foi pago no período, com fornecedor, categoria e conta de saída.', icon: <ArrowUpCircle /> },
      { id: 'recebimentos', titulo: 'Recebimentos', descricao: 'O que foi recebido no período, com cliente, categoria e conta de entrada.', icon: <ArrowDownCircle /> },
      { id: 'inadimplentes', titulo: 'Inadimplentes', descricao: 'Quais clientes ainda não pagaram e há quanto tempo o valor está em atraso.', icon: <AlertTriangle /> },
      { id: 'categorias', titulo: 'Por categoria', descricao: 'Lançamentos agrupados por categoria, com o que está a vencer, vencido e pago.', icon: <Tags /> },
      { id: 'contrapartes', titulo: 'Por cliente e fornecedor', descricao: 'A posição de cada cliente e fornecedor: a vencer, vencido e pago.', icon: <Users /> },
    ],
  },
  {
    titulo: 'DRE',
    descricao: 'Para saber se a empresa teve lucro ou prejuízo no período.',
    itens: [
      { id: 'dre', titulo: 'DRE simplificada', descricao: 'Receitas menos despesas, por categoria e por mês, com o resultado do período.', icon: <FileBarChart /> },
    ],
  },
];

export default function Relatorios() {
  const [params, setParams] = useSearchParams();
  const aberto = params.get('r') as Id | null;
  const abrir = (id: Id) => setParams({ r: id });
  const voltar = () => setParams({});

  switch (aberto) {
    case 'pagamentos': return <RelatorioMovimentos key="d" tipo="despesa" onVoltar={voltar} />;
    case 'recebimentos': return <RelatorioMovimentos key="r" tipo="receita" onVoltar={voltar} />;
    case 'inadimplentes': return <RelatorioInadimplentes onVoltar={voltar} />;
    case 'categorias': return <RelatorioCategorias onVoltar={voltar} />;
    case 'contrapartes': return <RelatorioContrapartes onVoltar={voltar} />;
    case 'dre': return <DreSimplificada onVoltar={voltar} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/financeiro · relatórios" title="Relatórios." subtitle="Escolha um relatório para ver na tela, exportar em PDF ou planilha." />
      {SECOES.map((s) => (
        <section key={s.titulo} className="rounded-lg border border-line bg-paper">
          <div className="border-b border-line-2 px-6 py-4">
            <h2 className="text-h4-card text-ink">{s.titulo}</h2>
            <p className="mt-0.5 text-meta text-muted-ink">{s.descricao}</p>
          </div>
          <ul className="divide-y divide-line-2">
            {s.itens.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => abrir(it.id)}
                  className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-bg-2"
                >
                  <IconBox tone="neutral" icon={it.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui-strong text-ink">{it.titulo}</span>
                    <span className="block text-meta text-muted-ink">{it.descricao}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-ink-2" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
