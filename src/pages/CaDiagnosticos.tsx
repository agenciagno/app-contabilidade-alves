import { DsAlert, PageHeader, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { DiagnosticosIndicadores } from '@/components/gestao360/DiagnosticosIndicadores';
import { DiagnosticosOportunidades } from '@/components/gestao360/DiagnosticosOportunidades';
import { DiagnosticosPerfil } from '@/components/gestao360/DiagnosticosPerfil';
import { DiagnosticosSaude } from '@/components/gestao360/DiagnosticosSaude';
import { ResponsavelFiltro } from '@/components/gestao360/ResponsavelFiltro';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePerfilCarteira } from '@/hooks/useDiagnosticos';
import { useFiltroCarteira } from '@/hooks/useFiltroCarteira';
import { useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';

const ABAS = ['perfil', 'saude', 'oportunidades', 'indicadores'] as const;
type Aba = (typeof ABAS)[number];

/** Quem é a carteira e como ela está. O que pede ação hoje fica no Portal 360°; aqui é a visão do conjunto. */
export default function CaDiagnosticos() {
  const { linhas, carregando, erro, competencia, hoje, faturamento } = useSituacaoCarteira();
  const perfil = usePerfilCarteira();
  const { params, atualizar, resp, doResponsavel, escolherResponsavel } = useFiltroCarteira(linhas);

  const abaParam = params.get('aba') as Aba | null;
  const aba: Aba = abaParam && (ABAS as readonly string[]).includes(abaParam) ? abaParam : 'perfil';
  const irPara = (a: Aba) => atualizar((n) => { if (a === 'perfil') n.delete('aba'); else n.set('aba', a); });
  const pronto = !carregando && !perfil.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/gestão 360°"
        title="CA · Diagnósticos."
        subtitle="Quem é a carteira e como ela está, com o que já está salvo. O que pede ação hoje fica no Portal 360°. Cliente sem dado nunca conta como regular."
        actions={<ResponsavelFiltro linhas={linhas} valor={resp} onChange={escolherResponsavel} />}
      />

      {(erro || perfil.error) ? <DsAlert tone="danger" title="Não foi possível carregar tudo" description="Alguma fonte falhou. Os números abaixo podem estar incompletos; recarregue a página." /> : null}

      {!pronto ? (
        <Skeleton className="h-[360px] w-full" />
      ) : linhas.length === 0 ? (
        <DsAlert tone="info" title="Nenhum cliente monitorado" description="Só clientes com status Ativo e CNPJ entram aqui." />
      ) : (
        <Tabs value={aba} onValueChange={(v) => irPara(v as Aba)} className="space-y-4">
          <TabsList className={tabsListClass}>
            <TabsTrigger value="perfil" className={tabsTriggerClass}>Perfil</TabsTrigger>
            <TabsTrigger value="saude" className={tabsTriggerClass}>Saúde</TabsTrigger>
            <TabsTrigger value="oportunidades" className={tabsTriggerClass}>Oportunidades</TabsTrigger>
            <TabsTrigger value="indicadores" className={tabsTriggerClass}>Indicadores</TabsTrigger>
          </TabsList>
          <TabsContent value="perfil" className="mt-0"><DiagnosticosPerfil linhas={doResponsavel} perfis={perfil.data ?? new Map()} hoje={hoje} /></TabsContent>
          <TabsContent value="saude" className="mt-0"><DiagnosticosSaude linhas={doResponsavel} competencia={competencia} hoje={hoje} /></TabsContent>
          <TabsContent value="oportunidades" className="mt-0"><DiagnosticosOportunidades linhas={doResponsavel} faturamento={faturamento} /></TabsContent>
          <TabsContent value="indicadores" className="mt-0"><DiagnosticosIndicadores linhas={doResponsavel} competencia={competencia} hoje={hoje} faturamento={faturamento} perfis={perfil.data ?? new Map()} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
