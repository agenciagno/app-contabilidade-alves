import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck, BarChart3, ClipboardList, CreditCard, FileCheck, FileSignature, FileSpreadsheet, FileX,
  Calculator, ClipboardCheck, Gavel, Landmark, Mail, Receipt, Scale, ShieldCheck, UserX, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { DsBadge, IconBox, PageHeader } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { diasParaVencer, useCertificates } from '@/hooks/useCertificates';
import { STATUS_MONITORADO, seloCaixa, useClientesCaixa, useMensagensCriticas } from '@/hooks/useSerproCaixaPostal';
import { competenciaPadrao, rotuloCompetencia, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { anoDe, declaracaoVigente, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { unificarLinhas } from '@/hooks/useSerproDasUnificado';
import { faturamentoVigente, nivelLimite, nivelSublimite, useFaturamentoAno } from '@/hooks/useSerproFaturamento';
import { statusDefis, useMatrizDefis } from '@/hooks/useSerproDefis';
import { useProcuracoes, vencendo as procVencendo } from '@/hooks/useSerproProcuracoes';
import { estadoSitfis, useMatrizSitfis } from '@/hooks/useSerproSitfis';
import { estadoDctfweb, estadoMit, useMatrizDctfwebMit } from '@/hooks/useSerproDctfweb';
import { useConferenciaCadastro } from '@/hooks/useSerproConferenciaCadastro';

type Tom = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

interface CartaoAtivo {
  titulo: string;
  icone: LucideIcon;
  to: string;
  tom: Tom;
  linhas: string[];
}

interface CartaoEmBreve {
  titulo: string;
  icone: LucideIcon;
  onda?: string;
  fonte: string;
}

// Cartões que ainda não têm dado: acendem conforme cada onda do Integra Contador entra (relatório serpro-integra-contador-oportunidades-set2026).
// Parcelamentos e DARF atualizado já estão desenvolvidos (src/pages/ParcelamentosFederal.tsx e DarfFederal.tsx, hooks useSerproParcelamentos e useSerproDarf),
// mas ficam guardados, sem cartão nem rota, até Gabriel decidir usar: para ligar, volte o cartão em `ativos` e as duas rotas em App.tsx.
const EM_BREVE: CartaoEmBreve[] = [
  { titulo: 'Parcelamentos', icone: CreditCard, fonte: 'Parcelas, situação e guia por cliente' },
  { titulo: 'DARF atualizado', icone: Calculator, fonte: 'Guia com multa e juros calculados' },
  { titulo: 'e-Processo', icone: Scale, onda: 'Onda 3', fonte: 'Processos por interessado' },
  { titulo: 'Declarações em falta', icone: FileX, onda: 'Onda 2 a 4', fonte: 'PGDAS-D, DCTFWeb e DEFIS' },
  { titulo: 'Exclusão do Simples', icone: UserX, onda: 'Onda 3', fonte: 'Termos e riscos de exclusão' },
];

export default function DashboardFederal() {
  const { data: todos = [], isLoading: carregandoClientes } = useClientesCaixa();
  const clientes = useMemo(() => todos.filter((c) => c.status_cliente === STATUS_MONITORADO), [todos]);
  const { data: criticas = [], isLoading: carregandoCriticas } = useMensagensCriticas();
  const { data: certificados = [], isLoading: carregandoCert } = useCertificates();
  const competencia = competenciaPadrao();
  const { data: pagamentos = [], isLoading: carregandoPag } = useMatrizPagamentos(competencia);
  const { data: simples = [], isLoading: carregandoSn } = useMatrizPgdasd(anoDe(competencia));
  const { data: leituras = [], isLoading: carregandoFat } = useFaturamentoAno(anoDe(competencia));
  const { data: defis = [], isLoading: carregandoDefis } = useMatrizDefis();
  const { data: procuracoes = [], isLoading: carregandoProc } = useProcuracoes();
  const { data: sitfis = [], isLoading: carregandoSitfis } = useMatrizSitfis();
  const { data: declMensais = [], isLoading: carregandoDecl } = useMatrizDctfwebMit(competencia);
  const conferencia = useConferenciaCadastro();

  const ativos = useMemo<CartaoAtivo[]>(() => {
    const selos = clientes.map((c) => seloCaixa(c).estado);
    const comMensagem = selos.filter((s) => s === 'nao_lida' || s === 'nova').length;
    const semProc = selos.filter((s) => s === 'sem_procuracao').length;
    const abertas = criticas.filter((m) => m.situacao === 'nova' || m.situacao === 'em_tratamento');
    const vencidos = certificados.filter((c) => diasParaVencer(c.data_validade) < 0).length;
    const aVencer = certificados.filter((c) => { const d = diasParaVencer(c.data_validade); return d >= 0 && d <= 30; }).length;
    const pagNovos = pagamentos.filter((l) => l.novo).length;
    const pagConsultados = pagamentos.filter((l) => l.consultadoEm).length;
    const snConsultados = simples.filter((l) => !l.filial && l.consultadoEm);
    const snTransmitidas = snConsultados.filter((l) => declaracaoVigente(l, competencia)).length;
    const unif = unificarLinhas(pagamentos, simples, competencia);
    const dasPagos = unif.filter((l) => l.das.estado === 'pago').length;
    const dasVencidos = unif.filter((l) => l.das.estado === 'vencido').length;
    const dasAVencer = unif.filter((l) => l.das.estado === 'a_vencer').length;
    const snTotal = simples.filter((l) => !l.filial).length;
    const fatLidos = simples.filter((l) => !l.filial).map((l) => faturamentoVigente(l, leituras, competencia)).filter((f): f is NonNullable<typeof f> => !!f);
    const fatConfiaveis = fatLidos.filter((f) => f.confiavel);
    const fatAtencao = fatConfiaveis.filter((f) => ['atencao', 'critico'].includes(nivelLimite(f) ?? '')).length;
    const fatAcima = fatConfiaveis.filter((f) => nivelLimite(f) === 'acima' || nivelSublimite(f) === 'acima').length;
    const fatPertoSub = fatConfiaveis.filter((f) => nivelSublimite(f) === 'perto').length;
    const fatFatorR = fatConfiaveis.filter((f) => f.fator_r_aplica === true).length;
    const dmAtivos = declMensais.filter((l) => !l.filial);
    const dmConsultados = dmAtivos.filter((l) => l.dctfweb || l.mitConsultado).length;
    const dctfOk = dmAtivos.filter((l) => estadoDctfweb(l) === 'transmitida').length;
    const dctfSem = dmAtivos.filter((l) => estadoDctfweb(l) === 'sem_declaracao').length;
    const dctfNovos = dmAtivos.filter((l) => l.novo).length;
    const mitOk = dmAtivos.filter((l) => estadoMit(l) === 'encerrada').length;
    const mitSem = dmAtivos.filter((l) => estadoMit(l) === 'sem_apuracao').length;
    const sfEstados = sitfis.filter((l) => !l.filial).map(estadoSitfis);
    const sfSemPend = sfEstados.filter((e) => e === 'sem_pendencias').length;
    const sfComPend = sfEstados.filter((e) => e === 'com_pendencias').length;
    const sfConferir = sfEstados.filter((e) => e === 'a_conferir').length;
    const sfGerados = sfEstados.filter((e) => e !== 'sem_relatorio').length;
    const pcCompletas = procuracoes.filter((l) => l.situacao === 'total').length;
    const pcSem = procuracoes.filter((l) => l.situacao === 'sem' || l.situacao === 'vencida').length;
    const pcVencendo = procuracoes.filter((l) => l.situacao !== 'vencida' && procVencendo(l)).length;
    const pcNaoMapeados = procuracoes.filter((l) => l.situacao === 'nao_mapeado').length;
    const anoDefis = new Date().getFullYear() - 1;
    const dfStatus = defis.filter((l) => !l.filial).map((l) => statusDefis(l, anoDefis));
    const dfConsultados = defis.filter((l) => !l.filial && l.consultadoEm).length;
    const dfEntregues = dfStatus.filter((s) => s === 'entregue' || s === 'retificada').length;
    const dfAtraso = dfStatus.filter((s) => s === 'em_atraso').length;
    return [
      {
        titulo: 'Conferência do cadastro', icone: ClipboardCheck, to: '/dashboard-federal/conferencia-cadastro', tom: conferencia.linhas.length > 0 ? 'warn' : 'ok',
        linhas: [`${conferencia.linhas.length} clientes com algo que não bate`, `${conferencia.totalAtivos} clientes ativos conferidos`],
      },
      {
        titulo: 'Mensagens e-CAC', icone: Mail, to: '/mensagens', tom: comMensagem > 0 ? 'warn' : 'ok',
        linhas: [`${comMensagem} com mensagem não lida ou nova`, `${clientes.length - semProc} clientes monitorados`],
      },
      {
        titulo: 'Pagamentos e DAS', icone: Receipt, to: '/dashboard-federal/pagamentos',
        tom: dasVencidos > 0 ? 'danger' : pagNovos > 0 || dasAVencer > 0 ? 'warn' : dasPagos > 0 || pagConsultados > 0 ? 'ok' : 'neutral',
        linhas: [`${dasPagos} DAS pagos · ${dasVencidos} vencidos · ${pagNovos} com pagamento novo`, `${pagConsultados} de ${pagamentos.length} consultados em ${rotuloCompetencia(competencia)}`],
      },
      {
        titulo: 'PGDAS', icone: FileCheck, to: '/dashboard-federal/pgdas', tom: snConsultados.length === 0 ? 'neutral' : snTransmitidas < snConsultados.length ? 'warn' : 'ok',
        linhas: [`${snTransmitidas} de ${snConsultados.length} transmitidas em ${rotuloCompetencia(competencia)}`, `${snConsultados.length} de ${snTotal} clientes do Simples consultados`],
      },
      {
        titulo: 'Faturamento e limites', icone: BarChart3, to: '/dashboard-federal/faturamento', tom: fatConfiaveis.length === 0 ? 'neutral' : fatAcima > 0 ? 'danger' : fatAtencao > 0 || fatPertoSub > 0 ? 'warn' : 'ok',
        linhas: [`${fatLidos.length} de ${snTransmitidas} declarações lidas em ${rotuloCompetencia(competencia)} · ${fatFatorR} com fator r`, `${fatAcima} acima do limite ou sublimite · ${fatAtencao} em atenção (80% do limite) · ${fatPertoSub} perto do sublimite`],
      },
      {
        titulo: 'DEFIS', icone: ClipboardList, to: '/dashboard-federal/defis', tom: dfConsultados === 0 ? 'neutral' : dfAtraso > 0 ? 'warn' : 'ok',
        linhas: [`${dfEntregues} entregues em ${anoDefis}`, `${dfAtraso} não entregues · ${dfConsultados} clientes consultados`],
      },
      {
        titulo: 'Situação fiscal', icone: Landmark, to: '/dashboard-federal/situacao-fiscal', tom: sfGerados === 0 ? 'neutral' : sfComPend > 0 ? 'danger' : sfConferir > 0 ? 'warn' : 'ok',
        linhas: [`${sfSemPend} sem pendências · ${sfComPend} com pendências`, `${sfGerados} de ${sfEstados.length} clientes com relatório${sfConferir ? ` · ${sfConferir} a conferir` : ''}`],
      },
      {
        titulo: 'DCTFWeb', icone: FileSpreadsheet, to: '/dashboard-federal/dctfweb-mit', tom: dctfNovos > 0 || dctfSem > 0 ? 'warn' : dmConsultados === 0 ? 'neutral' : 'ok',
        linhas: [`${dctfOk} com recibo · ${dctfSem} sem declaração em ${rotuloCompetencia(competencia)}`, `${dctfNovos} com movimento novo · ${dmConsultados} de ${dmAtivos.length} consultados`],
      },
      {
        titulo: 'MIT', icone: FileSignature, to: '/dashboard-federal/dctfweb-mit', tom: dmConsultados === 0 ? 'neutral' : mitSem > 0 ? 'warn' : 'ok',
        linhas: [`${mitOk} encerradas · ${mitSem} sem apuração em ${rotuloCompetencia(competencia)}`, `${dmConsultados} de ${dmAtivos.length} clientes consultados`],
      },
      {
        titulo: 'Termos de intimação', icone: Gavel, to: '/dashboard-federal/intimacoes', tom: abertas.length > 0 ? 'danger' : 'ok',
        linhas: [`${abertas.length} em aberto`, `${abertas.filter((m) => m.situacao === 'nova').length} novas sem responsável`],
      },
      {
        titulo: 'Procurações', icone: ShieldCheck, to: '/dashboard-federal/procuracoes',
        tom: pcNaoMapeados === procuracoes.length ? 'neutral' : pcSem > 0 || pcVencendo > 0 ? 'warn' : 'ok',
        linhas: [`${pcCompletas} completas · ${pcSem} sem procuração ou vencidas`, `${pcVencendo} vencem em 60 dias · ${pcNaoMapeados} não mapeadas`],
      },
      {
        titulo: 'Certificados', icone: BadgeCheck, to: '/cadastros/certificados', tom: vencidos > 0 ? 'danger' : aVencer > 0 ? 'warn' : 'ok',
        linhas: [`${vencidos} vencidos`, `${aVencer} vencem em 30 dias · ${certificados.length} no total`],
      },
    ];
  }, [clientes, criticas, certificados, pagamentos, simples, leituras, defis, procuracoes, sitfis, declMensais, conferencia.linhas, conferencia.totalAtivos, competencia]);

  const carregando = carregandoClientes || carregandoCriticas || carregandoCert || carregandoPag || carregandoSn || carregandoFat || carregandoDefis || carregandoProc || carregandoSitfis || carregandoDecl || conferencia.carregando;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal"
        title="Dashboard Federal."
        subtitle="Atalhos para o monitoramento fiscal dos clientes na Receita Federal. Os cartões cinza acendem conforme cada etapa da integração com o Serpro entra no ar."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {carregando
          ? Array.from({ length: 16 }).map((_, i) => <Skeleton key={i} className="h-[150px] w-full" />)
          : ativos.map((c) => {
            const Icone = c.icone;
            return (
              <Link
                key={c.titulo}
                to={c.to}
                className="group flex min-h-[150px] flex-col gap-3 rounded-lg border border-line bg-paper p-5 transition-colors hover:border-ink"
              >
                <div className="flex items-center justify-between">
                  <IconBox tone={c.tom} icon={<Icone className="h-5 w-5" />} />
                  <ArrowRight className="h-4 w-4 text-muted-ink-2 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </div>
                <h2 className="text-h4-card text-ink">{c.titulo}</h2>
                <div className="space-y-0.5">
                  {c.linhas.map((l) => <p key={l} className="text-meta text-muted-ink">{l}</p>)}
                </div>
              </Link>
            );
          })}

        {EM_BREVE.map((c) => {
          const Icone = c.icone;
          return (
            <div key={c.titulo} className={cn('flex min-h-[150px] flex-col gap-3 rounded-lg border border-dashed border-line bg-bg-2/40 p-5')}>
              <div className="flex items-center justify-between">
                <IconBox tone="neutral" icon={<Icone className="h-5 w-5" />} />
                <DsBadge tone="neutral" dot={false}>{c.onda ? `Em breve · ${c.onda}` : 'Em breve'}</DsBadge>
              </div>
              <h2 className="text-h4-card text-muted-ink">{c.titulo}</h2>
              <p className="text-meta text-muted-ink-2">{c.fonte}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
