import { useMemo } from 'react';
import { ArrowRight, FileX, Gavel, Receipt, ShieldAlert, UserX } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { AusenciasLista } from '@/components/gestao360/AusenciasLista';
import { CartaoIndicador, tomPor } from '@/components/gestao360/CartaoIndicador';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { GraficosAusencias } from '@/components/gestao360/GraficosCarteira';
import { TOM_NIVEL, type ListaAberta } from '@/components/gestao360/ListaClientesSheet';
import {
  contar, FILTROS, montarGraficos, pendenciasCertidao, ROTULO_NIVEL, rotuloAusencia, topEmFalta, totalPendencias,
  type LinhaCarteira,
} from '@/lib/situacaoCarteira';

interface Props {
  linhas: LinhaCarteira[];
  filtrado: boolean;
  competencia: string;
  hoje: string;
  onAbrir: (lista: ListaAberta) => void;
  onAusenciasDoCliente: (contactId: string) => void;
}

const emFaltaDe = (l: LinhaCarteira) => l.ausencias.filter((a) => a.situacao === 'em_falta').map(rotuloAusencia).join(', ');

/** Visão geral de CA · Ausências: indicadores, Top 5 de urgência e gráficos (ou, com um cliente escolhido, a lista dele). */
export function AusenciasVisaoGeral({ linhas, filtrado, competencia, hoje, onAbrir, onAusenciasDoCliente }: Props) {
  const total = linhas.length;
  const emFalta = contar(linhas, FILTROS.declaracoesEmFalta);
  const consultadas = contar(linhas, FILTROS.declaracoesConsultadas);
  const aplicaveis = linhas.filter((l) => l.declaracoes !== 'nao_se_aplica').length;
  const pendencias = totalPendencias(linhas);
  const pgdas = linhas.reduce((s, l) => s + l.ausencias.filter((a) => a.situacao === 'em_falta' && a.obrigacao === 'PGDAS-D').length, 0);
  const defis = linhas.reduce((s, l) => s + l.ausencias.filter((a) => a.situacao === 'em_falta' && a.obrigacao === 'DEFIS').length, 0);
  const certidao = contar(linhas, FILTROS.podeImpedirCertidao);
  const termos = linhas.filter((l) => l.mensagens.exclusaoSimples > 0).length;
  const tresOuMais = linhas.filter((l) => l.pgdas.emFalta.length >= 3).length;
  const exclusao = contar(linhas, FILTROS.exclusaoSimples);
  const maed = contar(linhas, FILTROS.multaMaed);

  const cartoes = [
    {
      titulo: 'Declarações em falta', icone: FileX, valor: String(emFalta), tom: tomPor(emFalta, consultadas), cobertura: { n: consultadas, total: aplicaveis },
      hint: `Clientes com PGDAS-D ou DEFIS em falta · ${consultadas} de ${aplicaveis} consultados`,
      lista: { titulo: 'Declarações em falta', linhas: linhas.filter(FILTROS.declaracoesEmFalta), detalhe: emFaltaDe, to: '/dashboard-federal/pgdas' },
    },
    {
      titulo: 'Total de pendências', icone: Receipt, valor: String(pendencias), tom: tomPor(pendencias, consultadas),
      hint: `Competências e obrigações em falta · PGDAS-D ${pgdas} · DEFIS ${defis}`,
      lista: { titulo: 'Total de pendências', descricao: 'um cliente com 3 competências em falta soma 3', linhas: linhas.filter(FILTROS.declaracoesEmFalta), detalhe: emFaltaDe, to: '/dashboard-federal/pgdas' },
    },
    {
      titulo: 'Pode impedir a certidão federal', icone: ShieldAlert, valor: String(certidao), tom: tomPor(certidao, total),
      hint: 'Pendência na Situação fiscal, DAS vencido ou declaração em falta',
      lista: { titulo: 'Pode impedir a certidão federal', linhas: linhas.filter(FILTROS.podeImpedirCertidao), detalhe: (l: LinhaCarteira) => pendenciasCertidao(l).join(' · '), to: '/dashboard-federal/situacao-fiscal' },
    },
    {
      titulo: 'Exclusão do Simples (risco)', icone: UserX, valor: String(exclusao), tom: tomPor(exclusao, total),
      hint: `${termos} ${termos === 1 ? 'termo' : 'termos'} na Caixa Postal · ${tresOuMais} com 3+ competências sem PGDAS-D`,
      lista: {
        titulo: 'Exclusão do Simples (risco)', descricao: 'termo de exclusão na Caixa Postal ou PGDAS-D em falta há 3 competências ou mais', linhas: linhas.filter(FILTROS.exclusaoSimples),
        detalhe: (l: LinhaCarteira) => [l.mensagens.exclusaoSimples > 0 ? 'Termo de exclusão na Caixa Postal' : '', l.pgdas.emFalta.length >= 3 ? `${l.pgdas.emFalta.length} competências sem PGDAS-D` : ''].filter(Boolean).join(' · '),
        to: '/dashboard-federal/intimacoes',
      },
    },
    {
      titulo: 'Multa (MAED) notificada', icone: Gavel, valor: String(maed), tom: tomPor(maed, total, 'warn'),
      hint: 'Só o que a Receita notificou, sem estimativa de valor',
      lista: { titulo: 'Multa (MAED) notificada', linhas: linhas.filter(FILTROS.multaMaed), detalhe: (l: LinhaCarteira) => `${l.multa.maed} ${l.multa.maed === 1 ? 'notificação' : 'notificações'} da Receita`, to: '/dashboard-federal/intimacoes' },
    },
  ];

  const graficos = useMemo(() => montarGraficos(linhas, competencia, hoje), [linhas, competencia, hoje]);
  const top = useMemo(() => topEmFalta(linhas, 5), [linhas]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cartoes.map((c) => (
          <CartaoIndicador key={c.titulo} titulo={c.titulo} icone={c.icone} valor={c.valor} hint={c.hint} tom={c.tom} cobertura={'cobertura' in c ? c.cobertura : undefined} onClick={() => onAbrir(c.lista)} />
        ))}
      </div>

      {filtrado ? (
        <section className="space-y-3">
          <h2 className="text-h4-card text-ink">Declarações do cliente</h2>
          <AusenciasLista linhas={linhas} inicial="todas" />
        </section>
      ) : (
        <>
          <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
            <div>
              <h2 className="text-h4-card text-ink">Top 5 · urgência crítica</h2>
              <p className="text-meta text-muted-ink">Quem tem mais competências em falta; empata pelo prazo mais antigo.</p>
            </div>
            {top.length === 0 ? (
              <p className="py-6 text-center text-ui text-muted-ink">Nenhum cliente com declaração em falta com os dados que temos hoje.</p>
            ) : (
              <div className="divide-y divide-line-2">
                {top.map((l) => (
                  <button key={l.contact_id} type="button" onClick={() => onAusenciasDoCliente(l.contact_id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left hover:bg-bg-2/50">
                    <span className="w-[260px] shrink-0">
                      <span className="block truncate text-ui-strong text-ink">{l.nome}</span>
                      <span className="block font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</span>
                    </span>
                    <DsBadge tone={TOM_NIVEL[l.nivel]}>{ROTULO_NIVEL[l.nivel]}</DsBadge>
                    <span className="min-w-0 flex-1 truncate text-meta text-muted-ink">{emFaltaDe(l)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-ink-2" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-h4-card text-ink">Análise</h2>
            <GraficosAusencias g={graficos} />
          </section>
        </>
      )}
    </div>
  );
}
