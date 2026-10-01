import { useMemo } from 'react';

import { DsAlert, PageHeader, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { AusenciasLista } from '@/components/gestao360/AusenciasLista';
import { ClienteFiltro } from '@/components/gestao360/ClienteFiltro';
import { CruzamentoTarefas } from '@/components/gestao360/CruzamentoTarefas';
import { RadarCnd } from '@/components/gestao360/RadarCnd';
import { ResponsavelFiltro } from '@/components/gestao360/ResponsavelFiltro';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCruzamentoReceita } from '@/hooks/useCruzamentoReceita';
import { useFiltroCarteira } from '@/hooks/useFiltroCarteira';
import { useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';
import { dataBR } from '@/lib/situacaoCarteira';

const ABAS = ['ausencias', 'radar-cnd', 'cross-check'] as const;
type Aba = (typeof ABAS)[number];

/** Quem não entregou e o que fazer. Os números da carteira ficam no Portal 360°; aqui só a lista de trabalho. */
export default function CaAusencias() {
  const { linhas, carregando, erro, competencia, hoje, fontesAtualizadas } = useSituacaoCarteira();
  const { params, atualizar, escolhida, resp, doResponsavel, visiveis, escolherCliente: escolher, escolherResponsavel } = useFiltroCarteira(linhas);

  const abaParam = params.get('aba') as Aba | null;
  const aba: Aba = abaParam && (ABAS as readonly string[]).includes(abaParam) ? abaParam : 'ausencias';
  const irPara = (a: Aba) => atualizar((n) => { if (a === 'ausencias') n.delete('aba'); else n.set('aba', a); });

  const cruzamento = useCruzamentoReceita(linhas, competencia, hoje);
  // Sem filtro, entram também as tarefas de clientes fora do monitoramento (não estão na carteira); com filtro, só os clientes visíveis.
  const filtrado = !!escolhida || !!resp;
  const cruzamentoVisivel = useMemo(() => {
    if (!filtrado) return cruzamento.linhas;
    const ids = new Set(visiveis.map((l) => l.contact_id));
    return cruzamento.linhas.filter((l) => ids.has(l.contact_id));
  }, [cruzamento.linhas, visiveis, filtrado]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/gestão 360°"
        title="CA · Ausências."
        subtitle={`Quem não entregou e o que fazer, com o que a Receita confirma. Cliente não consultado nunca conta como em dia. Última leitura: ${fontesAtualizadas.filter((f) => f.rotulo === 'PGDAS-D' || f.rotulo === 'DEFIS').map((f) => `${f.rotulo} ${f.em ? dataBR(f.em) : 'sem leitura'}`).join(' · ')}.`}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <ResponsavelFiltro linhas={linhas} valor={resp} onChange={escolherResponsavel} />
            <ClienteFiltro linhas={doResponsavel} valor={escolhida?.contact_id ?? null} onChange={escolher} />
          </div>
        )}
      />

      {erro ? <DsAlert tone="danger" title="Não foi possível carregar tudo" description="Alguma fonte falhou. Os números abaixo podem estar incompletos; recarregue a página." /> : null}

      {carregando ? (
        <Skeleton className="h-[320px] w-full" />
      ) : linhas.length === 0 ? (
        <DsAlert tone="info" title="Nenhum cliente monitorado" description="Só clientes com status Ativo e CNPJ entram aqui." />
      ) : (
        <Tabs value={aba} onValueChange={(v) => irPara(v as Aba)} className="space-y-4">
          <TabsList className={tabsListClass}>
            <TabsTrigger value="ausencias" className={tabsTriggerClass}>Ausências</TabsTrigger>
            <TabsTrigger value="radar-cnd" className={tabsTriggerClass}>Radar CND</TabsTrigger>
            <TabsTrigger value="cross-check" className={tabsTriggerClass}>Cross-check</TabsTrigger>
          </TabsList>

          <TabsContent value="ausencias" className="mt-0">
            <AusenciasLista key={`${escolhida?.contact_id ?? 'todos'}-${resp ?? 'todos'}`} linhas={visiveis} inicial={escolhida ? 'todas' : 'em_falta'} />
          </TabsContent>
          <TabsContent value="radar-cnd" className="mt-0">
            <RadarCnd linhas={visiveis} />
          </TabsContent>
          <TabsContent value="cross-check" className="mt-0">
            <CruzamentoTarefas linhas={cruzamentoVisivel} carregando={cruzamento.carregando} erro={cruzamento.erro} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
