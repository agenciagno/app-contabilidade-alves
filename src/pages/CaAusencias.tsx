import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DsAlert, PageHeader, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { AusenciasLista } from '@/components/gestao360/AusenciasLista';
import { AusenciasVisaoGeral } from '@/components/gestao360/AusenciasVisaoGeral';
import { ClienteFiltro } from '@/components/gestao360/ClienteFiltro';
import { CruzamentoTarefas } from '@/components/gestao360/CruzamentoTarefas';
import { ListaClientesSheet, type ListaAberta } from '@/components/gestao360/ListaClientesSheet';
import { RadarCnd } from '@/components/gestao360/RadarCnd';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCruzamentoReceita } from '@/hooks/useCruzamentoReceita';
import { useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';
import { dataBR } from '@/lib/situacaoCarteira';

const ABAS = ['visao-geral', 'ausencias', 'radar-cnd', 'cross-check'] as const;
type Aba = (typeof ABAS)[number];

export default function CaAusencias() {
  const { linhas, carregando, erro, competencia, hoje, fontesAtualizadas } = useSituacaoCarteira();
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState<ListaAberta | null>(null);

  const abaParam = params.get('aba') as Aba | null;
  const aba: Aba = abaParam && (ABAS as readonly string[]).includes(abaParam) ? abaParam : 'visao-geral';
  const clienteId = params.get('cliente');
  const escolhida = clienteId ? linhas.find((l) => l.contact_id === clienteId) ?? null : null;
  const visiveis = useMemo(() => (escolhida ? [escolhida] : linhas), [escolhida, linhas]);

  const atualizar = (mudar: (p: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); mudar(n); return n; }, { replace: true });
  const escolher = (id: string | null) => atualizar((n) => { if (id) n.set('cliente', id); else n.delete('cliente'); });
  const irPara = (a: Aba) => atualizar((n) => { if (a === 'visao-geral') n.delete('aba'); else n.set('aba', a); });
  const ausenciasDoCliente = (id: string) => atualizar((n) => { n.set('cliente', id); n.set('aba', 'ausencias'); });

  const cruzamento = useCruzamentoReceita(linhas, competencia, hoje);
  const cruzamentoVisivel = useMemo(() => (escolhida ? cruzamento.linhas.filter((l) => l.contact_id === escolhida.contact_id) : cruzamento.linhas), [cruzamento.linhas, escolhida]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/gestão 360°"
        title="CA · Ausências."
        subtitle={`Declarações em falta de cada cliente, com o que a Receita confirma. Cliente não consultado nunca conta como em dia. Última leitura: ${fontesAtualizadas.filter((f) => f.rotulo === 'PGDAS-D' || f.rotulo === 'DEFIS').map((f) => `${f.rotulo} ${f.em ? dataBR(f.em) : 'sem leitura'}`).join(' · ')}.`}
        actions={<ClienteFiltro linhas={linhas} valor={escolhida?.contact_id ?? null} onChange={escolher} />}
      />

      {erro ? <DsAlert tone="danger" title="Não foi possível carregar tudo" description="Alguma fonte falhou. Os números abaixo podem estar incompletos; recarregue a página." /> : null}

      {carregando ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[150px] w-full" />)}
        </div>
      ) : linhas.length === 0 ? (
        <DsAlert tone="info" title="Nenhum cliente monitorado" description="Só clientes com status Ativo e CNPJ entram aqui." />
      ) : (
        <Tabs value={aba} onValueChange={(v) => irPara(v as Aba)} className="space-y-4">
          <TabsList className={tabsListClass}>
            <TabsTrigger value="visao-geral" className={tabsTriggerClass}>Visão geral</TabsTrigger>
            <TabsTrigger value="ausencias" className={tabsTriggerClass}>Ausências</TabsTrigger>
            <TabsTrigger value="radar-cnd" className={tabsTriggerClass}>Radar CND</TabsTrigger>
            <TabsTrigger value="cross-check" className={tabsTriggerClass}>Cross-check</TabsTrigger>
          </TabsList>

          <TabsContent value="visao-geral" className="mt-0">
            <AusenciasVisaoGeral linhas={visiveis} filtrado={!!escolhida} competencia={competencia} hoje={hoje} onAbrir={setLista} onAusenciasDoCliente={ausenciasDoCliente} />
          </TabsContent>
          <TabsContent value="ausencias" className="mt-0">
            <AusenciasLista key={escolhida?.contact_id ?? 'todos'} linhas={visiveis} inicial={escolhida ? 'todas' : 'em_falta'} />
          </TabsContent>
          <TabsContent value="radar-cnd" className="mt-0">
            <RadarCnd linhas={visiveis} />
          </TabsContent>
          <TabsContent value="cross-check" className="mt-0">
            <CruzamentoTarefas linhas={cruzamentoVisivel} carregando={cruzamento.carregando} erro={cruzamento.erro} />
          </TabsContent>
        </Tabs>
      )}

      <ListaClientesSheet lista={lista} onClose={() => setLista(null)} />
    </div>
  );
}
