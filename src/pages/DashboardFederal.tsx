import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck, BarChart3, ClipboardList, CreditCard, FileCheck, FileSignature, FileSpreadsheet, FileX,
  Gauge, Gavel, Landmark, Mail, Percent, Receipt, Scale, ShieldCheck, UserX, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { DsBadge, IconBox, PageHeader } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { diasParaVencer, useCertificates } from '@/hooks/useCertificates';
import { STATUS_MONITORADO, seloCaixa, useClientesCaixa, useMensagensCriticas } from '@/hooks/useSerproCaixaPostal';
import { competenciaPadrao, rotuloCompetencia, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';

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
  onda: string;
  fonte: string;
}

// Cartões que ainda não têm dado: acendem conforme cada onda do Integra Contador entra (relatório serpro-integra-contador-oportunidades-set2026).
const EM_BREVE: CartaoEmBreve[] = [
  { titulo: 'PGDAS', icone: FileCheck, onda: 'Onda 2', fonte: 'Transmitidas e não entregues' },
  { titulo: 'DAS', icone: Receipt, onda: 'Onda 2', fonte: 'Pagos, não pagos e sem DAS' },
  { titulo: 'Faturamento', icone: BarChart3, onda: 'Onda 2', fonte: 'Últimos 12 meses (Simples)' },
  { titulo: 'Sublimite do Simples', icone: Gauge, onda: 'Onda 2', fonte: 'Receita acumulada x limite' },
  { titulo: 'Fator R', icone: Percent, onda: 'Onda 2', fonte: 'Folha sobre receita' },
  { titulo: 'DEFIS', icone: ClipboardList, onda: 'Onda 2', fonte: 'Entregues e pendentes' },
  { titulo: 'Situação fiscal', icone: Landmark, onda: 'Onda 3', fonte: 'Pendências e regulares' },
  { titulo: 'Parcelamentos', icone: CreditCard, onda: 'Onda 3', fonte: 'Parcela do mês e guia' },
  { titulo: 'e-Processo', icone: Scale, onda: 'Onda 3', fonte: 'Processos por interessado' },
  { titulo: 'DCTFWeb', icone: FileSpreadsheet, onda: 'Onda 4', fonte: 'Transmitidas e não entregues' },
  { titulo: 'MIT', icone: FileSignature, onda: 'Onda 4', fonte: 'Encerradas e não encerradas' },
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

  const ativos = useMemo<CartaoAtivo[]>(() => {
    const selos = clientes.map((c) => seloCaixa(c).estado);
    const comMensagem = selos.filter((s) => s === 'nao_lida' || s === 'nova').length;
    const semProc = selos.filter((s) => s === 'sem_procuracao').length;
    const abertas = criticas.filter((m) => m.situacao === 'nova' || m.situacao === 'em_tratamento');
    const vencidos = certificados.filter((c) => diasParaVencer(c.data_validade) < 0).length;
    const aVencer = certificados.filter((c) => { const d = diasParaVencer(c.data_validade); return d >= 0 && d <= 30; }).length;
    const pagNovos = pagamentos.filter((l) => l.novo).length;
    const pagConsultados = pagamentos.filter((l) => l.consultadoEm).length;
    return [
      {
        titulo: 'Mensagens e-CAC', icone: Mail, to: '/mensagens', tom: comMensagem > 0 ? 'warn' : 'ok',
        linhas: [`${comMensagem} com mensagem não lida ou nova`, `${clientes.length - semProc} clientes monitorados`],
      },
      {
        titulo: 'Pagamentos', icone: Receipt, to: '/dashboard-federal/pagamentos', tom: pagNovos > 0 ? 'warn' : pagConsultados > 0 ? 'ok' : 'neutral',
        linhas: [`${pagNovos} com pagamento novo`, `${pagConsultados} de ${pagamentos.length} consultados em ${rotuloCompetencia(competencia)}`],
      },
      {
        titulo: 'Termos de intimação', icone: Gavel, to: '/dashboard-federal/intimacoes', tom: abertas.length > 0 ? 'danger' : 'ok',
        linhas: [`${abertas.length} em aberto`, `${abertas.filter((m) => m.situacao === 'nova').length} novas sem responsável`],
      },
      {
        titulo: 'Procurações', icone: ShieldCheck, to: '/mensagens?selo=sem_procuracao', tom: semProc > 0 ? 'warn' : 'ok',
        linhas: [`${clientes.length - semProc} com procuração (Caixa Postal)`, `${semProc} sem procuração`],
      },
      {
        titulo: 'Certificados', icone: BadgeCheck, to: '/cadastros/certificados', tom: vencidos > 0 ? 'danger' : aVencer > 0 ? 'warn' : 'ok',
        linhas: [`${vencidos} vencidos`, `${aVencer} vencem em 30 dias · ${certificados.length} no total`],
      },
    ];
  }, [clientes, criticas, certificados, pagamentos, competencia]);

  const carregando = carregandoClientes || carregandoCriticas || carregandoCert || carregandoPag;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal"
        title="Dashboard Federal."
        subtitle="Atalhos para o monitoramento fiscal dos clientes na Receita Federal. Os cartões cinza acendem conforme cada etapa da integração com o Serpro entra no ar."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {carregando
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[150px] w-full" />)
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
                <DsBadge tone="neutral" dot={false}>Em breve · {c.onda}</DsBadge>
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
