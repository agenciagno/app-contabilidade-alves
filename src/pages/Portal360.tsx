import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Gavel, Landmark, Mail, Receipt, ShieldAlert, ShieldCheck, ShieldX, UserX, Users, FileCheck, FileX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { DsAlert, DsBadge, PageHeader } from '@/components/ds';
import { CartaoIndicador, tomPor, type Tom } from '@/components/gestao360/CartaoIndicador';
import { ClienteFiltro } from '@/components/gestao360/ClienteFiltro';
import { FichaCliente } from '@/components/gestao360/FichaCliente';
import { GraficosCarteiraView } from '@/components/gestao360/GraficosCarteira';
import { ListaClientesSheet, TOM_NIVEL, type ListaAberta } from '@/components/gestao360/ListaClientesSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { rotuloCompetencia } from '@/hooks/useSerproPagamentos';
import { useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';
import {
  contar, FILTROS, montarGraficos, ROTULO_NIVEL, topEmRisco,
  type Filtro, type LinhaCarteira, type NivelRisco,
} from '@/lib/situacaoCarteira';

const sigla = (pa: string) => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface Cartao {
  id: string;
  titulo: string;
  icone: LucideIcon;
  valor: string;
  hint: string;
  tom: Tom;
  /** Cobertura da fonte: abaixo de 50% o cartão avisa que o número ainda é parcial. */
  cobertura?: { n: number; total: number };
  filtro: Filtro;
  descricao?: string;
  to?: string;
  detalhe: (l: LinhaCarteira) => string;
}

export default function Portal360() {
  const { linhas, carregando, erro, competencia, hoje, fontesAtualizadas } = useSituacaoCarteira();
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState<ListaAberta | null>(null);

  const clienteId = params.get('cliente');
  const escolhida = clienteId ? linhas.find((l) => l.contact_id === clienteId) ?? null : null;
  const visiveis = useMemo(() => (escolhida ? [escolhida] : linhas), [escolhida, linhas]);
  const escolher = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('cliente', id); else n.delete('cliente'); return n; }, { replace: true });

  const cartoes = useMemo<Cartao[]>(() => {
    const n = (f: Filtro) => contar(visiveis, f);
    const total = visiveis.length;
    const aplicaveis = visiveis.filter((l) => l.declaracoes !== 'nao_se_aplica').length;
    const consultadas = n(FILTROS.declaracoesConsultadas);
    const emFalta = n(FILTROS.declaracoesEmFalta);
    const emDia = n(FILTROS.declaracoesEmDia);
    const aConfirmarDecl = visiveis.filter((l) => l.declaracoes === 'a_confirmar').length;
    const dctfMitConfirmar = visiveis.filter((l) => l.dctfweb === 'sem_declaracao' || l.mit === 'sem_apuracao').length;
    const comRelatorio = n(FILTROS.sitfisComRelatorio);
    const comPendencia = n(FILTROS.sitfisComPendencia);
    const semPendencia = n(FILTROS.sitfisSemPendencia);
    const certLeitura = n(FILTROS.certidaoComLeitura);
    const certIrregular = n(FILTROS.certidaoIrregular);
    const termos = visiveis.filter((l) => l.mensagens.exclusaoSimples > 0).length;
    const tresOuMais = visiveis.filter((l) => l.pgdas.emFalta.length >= 3).length;
    const exclusao = n(FILTROS.exclusaoSimples);
    const dasVencidos = n(FILTROS.dasVencido);
    const clientesIntim = n(FILTROS.intimacaoAberta);
    const msgsAbertas = visiveis.reduce((s, l) => s + l.mensagens.total, 0);
    const naoLidas = n(FILTROS.mensagemNaoLida);
    const procSem = visiveis.filter((l) => l.procuracao.situacao === 'sem' || l.procuracao.situacao === 'vencida').length;
    const procVencendo = visiveis.filter((l) => l.procuracao.vencendo && l.procuracao.situacao !== 'vencida').length;
    const comProc = n(FILTROS.semProcuracaoCaixa);
    const rotuloComp = sigla(competencia);

    return [
      {
        id: 'monitorados', titulo: 'Clientes monitorados', icone: Users, valor: String(total), tom: 'neutral', filtro: FILTROS.monitorados,
        hint: `${comProc} com procuração · filiais ficam na conta da matriz`,
        detalhe: (l) => l.motivos[0] ?? 'Sem pendências',
      },
      {
        id: 'em-falta', titulo: 'Declarações em falta', icone: FileX, valor: String(emFalta), tom: tomPor(emFalta, consultadas), filtro: FILTROS.declaracoesEmFalta, to: '/dashboard-federal/pgdas',
        cobertura: { n: consultadas, total: aplicaveis },
        hint: `PGDAS-D e DEFIS${aConfirmarDecl ? ` · ${aConfirmarDecl} a confirmar` : ''}${dctfMitConfirmar ? ` · DCTFWeb/MIT a confirmar: ${dctfMitConfirmar}` : ''}`,
        detalhe: (l) => l.ausencias.filter((a) => a.situacao === 'em_falta').map((a) => (a.obrigacao === 'DEFIS' ? `DEFIS ${a.competencia}` : `PGDAS-D ${sigla(a.competencia)}`)).join(', '),
      },
      {
        id: 'em-dia', titulo: 'Declarações em dia', icone: FileCheck, valor: pct(emDia, consultadas) === null ? '—' : `${pct(emDia, consultadas)}%`, tom: tomPor(emFalta + aConfirmarDecl, consultadas, 'warn'),
        filtro: FILTROS.declaracoesEmDia, to: '/dashboard-federal/pgdas', cobertura: { n: consultadas, total: aplicaveis },
        hint: `${emDia} de ${consultadas} consultados · ${aplicaveis - consultadas} sem consulta no ano`,
        detalhe: () => 'PGDAS-D e DEFIS em dia',
      },
      {
        id: 'certidao-risco', titulo: 'Pode impedir a certidão federal', icone: ShieldAlert, valor: String(n(FILTROS.podeImpedirCertidao)), tom: tomPor(n(FILTROS.podeImpedirCertidao), total),
        filtro: FILTROS.podeImpedirCertidao, to: '/dashboard-federal/situacao-fiscal',
        hint: 'Pendência na Situação fiscal, DAS vencido ou declaração em falta',
        detalhe: (l) => [
          l.sitfis === 'com_pendencias' ? 'Pendência na Situação fiscal' : '',
          l.das === 'vencido' ? `DAS ${sigla(l.dasCompetencia)} vencido` : '',
          l.declaracoes === 'em_falta' ? 'Declaração em falta' : '',
        ].filter(Boolean).join(' · '),
      },
      {
        id: 'exclusao', titulo: 'Exclusão do Simples (risco)', icone: UserX, valor: String(exclusao), tom: tomPor(exclusao, total), filtro: FILTROS.exclusaoSimples, to: '/dashboard-federal/intimacoes',
        hint: `${plural(termos, 'termo', 'termos')} na Caixa Postal · ${tresOuMais} com 3+ competências sem PGDAS-D`,
        descricao: 'termo de exclusão na Caixa Postal ou PGDAS-D em falta há 3 competências ou mais',
        detalhe: (l) => [
          l.mensagens.exclusaoSimples > 0 ? 'Termo de exclusão na Caixa Postal' : '',
          l.pgdas.emFalta.length >= 3 ? `${l.pgdas.emFalta.length} competências sem PGDAS-D` : '',
        ].filter(Boolean).join(' · '),
      },
      {
        id: 'das-vencido', titulo: 'DAS vencidos', icone: Receipt, valor: String(dasVencidos), tom: tomPor(dasVencidos, total), filtro: FILTROS.dasVencido, to: '/dashboard-federal/pagamentos',
        hint: `Competência ${rotuloComp}`, detalhe: (l) => `DAS ${sigla(l.dasCompetencia)} sem pagamento registrado`,
      },
      {
        id: 'intimacoes', titulo: 'Mensagens da Receita em aberto', icone: Gavel, valor: String(clientesIntim), tom: tomPor(clientesIntim, total), filtro: FILTROS.intimacaoAberta, to: '/dashboard-federal/intimacoes',
        hint: `${plural(msgsAbertas, 'mensagem', 'mensagens')} que exigem ação · só nos clientes com lista baixada`,
        detalhe: (l) => `${plural(l.mensagens.total, 'mensagem', 'mensagens')}${l.mensagens.intimacoes ? ` · ${plural(l.mensagens.intimacoes, 'intimação', 'intimações')}` : ''}`,
      },
      {
        id: 'nao-lidas', titulo: 'Mensagens e-CAC não lidas', icone: Mail, valor: String(naoLidas), tom: tomPor(naoLidas, total, 'warn'), filtro: FILTROS.mensagemNaoLida, to: '/mensagens',
        hint: 'Clientes com mensagem nova ou não lida na Caixa Postal',
        detalhe: (l) => (l.caixa === 'nova' ? 'Nova mensagem' : 'Mensagem não lida'),
      },
      {
        id: 'sitfis-pend', titulo: 'Situação fiscal com pendência', icone: Landmark, valor: String(comPendencia), tom: tomPor(comPendencia, comRelatorio), filtro: FILTROS.sitfisComPendencia, to: '/dashboard-federal/situacao-fiscal',
        cobertura: { n: comRelatorio, total }, hint: `${comRelatorio} de ${total} com relatório · rodada mensal no dia 30`,
        detalhe: (l) => (l.sitfisEm ? `Relatório de ${dataBR(l.sitfisEm)}` : 'Com pendências'),
      },
      {
        id: 'sitfis-ok', titulo: 'Situação fiscal sem pendência', icone: ShieldCheck, valor: pct(semPendencia, comRelatorio) === null ? '—' : `${pct(semPendencia, comRelatorio)}%`, tom: tomPor(comPendencia, comRelatorio, 'warn'),
        filtro: FILTROS.sitfisSemPendencia, to: '/dashboard-federal/situacao-fiscal', cobertura: { n: comRelatorio, total },
        hint: `${semPendencia} de ${comRelatorio} com relatório`, detalhe: (l) => (l.sitfisEm ? `Relatório de ${dataBR(l.sitfisEm)}` : 'Sem pendências'),
      },
      {
        id: 'certidao', titulo: 'Certidão federal irregular', icone: BadgeCheck, valor: String(certIrregular), tom: tomPor(certIrregular, certLeitura), filtro: FILTROS.certidaoIrregular, to: '/dashboard-federal/situacao-fiscal',
        cobertura: { n: certLeitura, total }, hint: `${certLeitura} de ${total} com certidão lida · só a federal`,
        detalhe: (l) => `${l.certidao.tipo ?? 'Sem tipo'}${l.certidao.validade ? ` · ${l.certidao.situacao === 'vencida' ? 'venceu em' : 'até'} ${dataBR(l.certidao.validade)}` : ''}`,
      },
      {
        id: 'procuracoes', titulo: 'Procurações sem ou vencendo', icone: ShieldX, valor: String(procSem + procVencendo), tom: tomPor(procSem + procVencendo, total, 'warn'), filtro: FILTROS.procuracaoSemOuVencendo, to: '/dashboard-federal/procuracoes',
        hint: `${procSem} sem ou vencidas · ${procVencendo} vencem em 60 dias`,
        detalhe: (l) => (l.procuracao.situacao === 'sem' ? 'Sem procuração' : l.procuracao.situacao === 'vencida' ? 'Procuração vencida' : `Vence em ${l.procuracao.diasParaVencer} dias`),
      },
    ];
  }, [visiveis, competencia]);

  const niveis = (['critico', 'atencao', 'sem_cobertura', 'em_dia'] as NivelRisco[]).map((nv) => ({ nv, n: visiveis.filter((l) => l.nivel === nv).length }));
  const graficos = useMemo(() => montarGraficos(visiveis, competencia, hoje), [visiveis, competencia, hoje]);
  const top = useMemo(() => topEmRisco(visiveis, 5), [visiveis]);

  const abrir = (c: Cartao) => setLista({ titulo: c.titulo, descricao: c.descricao, linhas: visiveis.filter(c.filtro), detalhe: c.detalhe, to: c.to });
  const abrirNivel = (nv: NivelRisco) => setLista({
    titulo: `Nível: ${ROTULO_NIVEL[nv]}`, linhas: visiveis.filter((l) => l.nivel === nv), detalhe: (l) => l.motivos.join(' · ') || 'Sem pendências',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/gestão 360°"
        title="Portal 360°."
        subtitle="A carteira inteira ou um cliente só, com o que o Serpro já trouxe. Cliente não consultado nunca conta como em dia."
        actions={<ClienteFiltro linhas={linhas} valor={escolhida?.contact_id ?? null} onChange={escolher} />}
      />

      {erro && <DsAlert tone="danger" title="Não foi possível carregar tudo" description="Alguma fonte falhou. Os números abaixo podem estar incompletos; recarregue a página." />}

      {carregando ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-[150px] w-full" />)}
        </div>
      ) : linhas.length === 0 ? (
        <DsAlert tone="info" title="Nenhum cliente monitorado" description="Só clientes com status Ativo e CNPJ entram aqui." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {niveis.map(({ nv, n }) => (
              <button key={nv} type="button" onClick={() => abrirNivel(nv)} className="rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                <DsBadge tone={TOM_NIVEL[nv]}>{ROTULO_NIVEL[nv]}: {n}</DsBadge>
              </button>
            ))}
            <span className="ml-1 text-meta text-muted-ink-2">
              Última leitura: {fontesAtualizadas.map((f) => `${f.rotulo} ${f.em ? dataBR(f.em) : 'sem leitura'}`).join(' · ')} · DAS, DCTFWeb e MIT de {rotuloCompetencia(competencia)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cartoes.map((c) => (
              <CartaoIndicador key={c.id} titulo={c.titulo} icone={c.icone} valor={c.valor} hint={c.hint} tom={c.tom} cobertura={c.cobertura} onClick={() => abrir(c)} />
            ))}
          </div>

          {escolhida ? (
            <FichaCliente linha={escolhida} />
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-h4-card text-ink">Análise visual</h2>
                <GraficosCarteiraView g={graficos} />
              </section>

              <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
                <div>
                  <h2 className="text-h4-card text-ink">Clientes em risco</h2>
                  <p className="text-meta text-muted-ink">Crítico antes de Atenção; dentro do nível, mais pendências primeiro. O motivo vem ao lado, sem nota.</p>
                </div>
                {top.length === 0 ? (
                  <p className="py-6 text-center text-ui text-muted-ink">Nenhum cliente em Crítico ou Atenção com os dados que temos hoje.</p>
                ) : (
                  <div className="divide-y divide-line-2">
                    {top.map((l) => (
                      <button key={l.contact_id} type="button" onClick={() => escolher(l.contact_id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left hover:bg-bg-2/50">
                        <span className="w-[260px] shrink-0 truncate text-ui-strong text-ink">{l.nome}</span>
                        <DsBadge tone={TOM_NIVEL[l.nivel]}>{ROTULO_NIVEL[l.nivel]}</DsBadge>
                        <span className="min-w-0 flex-1 truncate text-meta text-muted-ink">{l.motivos.slice(0, 3).join(' · ')}{l.motivos.length > 3 ? ` · +${l.motivos.length - 3}` : ''}</span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-ink-2" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      <ListaClientesSheet lista={lista} onClose={() => setLista(null)} />
    </div>
  );
}
