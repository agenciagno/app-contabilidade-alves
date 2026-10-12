import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { DsAlert, DsBadge, PageHeader, StatCardRow, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Switch } from '@/components/ui/switch';
import { ConfigRelatorios } from '@/components/tech/ConfigRelatorios';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustoSerpro } from '@/hooks/useSerproConsumo';
import {
  custoEstimado, useConsumoSerpro, useSalvarSerproConfig, useSerproConfig,
} from '@/hooks/useSerproConsumo';
import { STATUS_MONITORADO, useClientesCaixa } from '@/hooks/useSerproCaixaPostal';
import { ROTINAS, cobra, type InterruptorRotina, type RotinaSerpro, type TipoRotina } from '@/lib/rotinasSerpro';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ALERTAS_EQUIPE: { chave: 'alerta_pgdas_antes_prazo' | 'alerta_mensagem_parada' | 'alerta_baixa_sem_declaracao' | 'alerta_sem_resposta'; titulo: string; texto: string }[] = [
  {
    chave: 'alerta_pgdas_antes_prazo', titulo: 'PGDAS-D faltando até 3 dias para o prazo',
    texto: 'Do dia 17 até o prazo, avisa quais clientes do Simples ainda não transmitiram o PGDAS-D na última leitura (só os lidos nos últimos 7 dias). Um aviso por cliente e competência.',
  },
  {
    chave: 'alerta_mensagem_parada', titulo: 'Mensagem da Receita sem tratamento',
    texto: 'Mensagem crítica da Caixa Postal (intimação, malha, exclusão do Simples, multa MAED, cobrança, processo) ainda "nova" 3 dias depois de enviada, nos últimos 30 dias. Um aviso por mensagem.',
  },
  {
    chave: 'alerta_baixa_sem_declaracao', titulo: 'Tarefa de DAS concluída sem declaração na Receita',
    texto: 'Tarefa de DAS concluída (últimos 3 meses), mas a Receita não mostra o PGDAS-D depois do prazo. Leva ao Cross-check, onde dá para reabrir a tarefa.',
  },
  {
    chave: 'alerta_sem_resposta', titulo: 'Cliente avisado sem resposta',
    texto: 'Cliente avisado por e-mail ou WhatsApp (CA · Ausências) há 3 dias ou mais, com a declaração ainda em aberto e o acompanhamento em "A tratar", "Cliente avisado" ou "Aguardando cliente".',
  },
];
const ROTULO_TIPO: Record<TipoRotina, string> = { Monitorar: 'Monitorar (grátis)', Consultar: 'Consultar', Emitir: 'Emitir', sem_chamada: 'Sem chamada ao Serpro' };

/** Valores do Serpro são só de administrador (decisão de Gabriel, 09/10/2026): o menu já esconde a tela; aqui trava o endereço digitado. */
export default function TechConsumoSerpro() {
  const { admin } = useCustoSerpro();
  if (!admin) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="~/tech · serpro" title="SERPRO." />
        <DsAlert tone="info" title="Só administradores" description="O consumo e os valores do Serpro aparecem só para administradores." />
      </div>
    );
  }
  return <ConsumoSerproAdmin />;
}

function ConsumoSerproAdmin() {
  const { data: chamadas = [], isLoading } = useConsumoSerpro();
  const { data: config } = useSerproConfig();
  const { data: clientesCaixa = [] } = useClientesCaixa();
  const salvar = useSalvarSerproConfig();
  const [alerta, setAlerta] = useState('');
  const [volume, setVolume] = useState('');

  useEffect(() => {
    if (config) { setAlerta(String(config.alerta_gasto_mensal)); setVolume(config.volume_declarado_mes ? String(config.volume_declarado_mes) : ''); }
  }, [config]);

  const r = useMemo(() => {
    const prod = chamadas.filter((c) => c.ambiente === 'producao');
    const cobradas = prod.filter((c) => c.cobravel === true);
    const qtd = (t: 'Consultar' | 'Emitir' | 'Declarar') => cobradas.filter((c) => c.tipo_chamada === t).length;
    const custo = (['Consultar', 'Emitir', 'Declarar'] as const).reduce((s, t) => s + custoEstimado(t, qtd(t)), 0);

    const porServico = new Map<string, { tipo: string; total: number; cobradas: number }>();
    for (const c of prod) {
      const chave = `${c.id_sistema}.${c.id_servico}`;
      const s = porServico.get(chave) ?? { tipo: c.tipo_chamada, total: 0, cobradas: 0 };
      s.total++; if (c.cobravel) s.cobradas++;
      porServico.set(chave, s);
    }
    const cronCobradas = cobradas.filter((c) => c.origem === 'cron');
    const erros = {
      semProcuracao: prod.filter((c) => c.status_http === 403).length,
      timeout: prod.filter((c) => c.status_http === 504).length,
      limite: prod.filter((c) => c.status_http === 429).length,
      servidor: prod.filter((c) => (c.status_http ?? 0) >= 500 && c.status_http !== 504).length,
    };
    return {
      total: prod.length, cobradas: cobradas.length, gratis: prod.length - cobradas.length, custo,
      rotinaCobradas: cronCobradas.length,
      rotinaCusto: (['Consultar', 'Emitir', 'Declarar'] as const).reduce((acc, t) => acc + custoEstimado(t, cronCobradas.filter((c) => c.tipo_chamada === t).length), 0),
      consulta: qtd('Consultar'), emissao: qtd('Emitir'), declaracao: qtd('Declarar'), erros, testes: chamadas.length - prod.length,
      servicos: [...porServico.entries()].sort((a, b) => b[1].total - a[1].total),
    };
  }, [chamadas]);

  const monitorados = clientesCaixa.filter((c) => c.status_cliente === STATUS_MONITORADO).length;
  const foraPorStatus = new Map<string, number>();
  for (const c of clientesCaixa) {
    if (c.status_cliente !== STATUS_MONITORADO) foraPorStatus.set(c.status_cliente ?? 'Sem status', (foraPorStatus.get(c.status_cliente ?? 'Sem status') ?? 0) + 1);
  }

  // Custo fixo por mês = soma do que as rotinas LIGADAS que cobram gastam. Rotina com interruptor desligado não conta (aparece em "se ligar").
  const ligada = (x: RotinaSerpro) => !x.interruptor || (config ? config[x.interruptor] : (x.padraoLigado ?? true));
  const ligadas = ROTINAS.filter(ligada);
  const fixas = ligadas.filter(cobra);
  const custoDe = (lista: RotinaSerpro[]) => custoEstimado('Consultar', lista.filter((x) => x.tipo === 'Consultar').reduce((n, x) => n + x.chamadasPorMes, 0)) + custoEstimado('Emitir', lista.filter((x) => x.tipo === 'Emitir').reduce((n, x) => n + x.chamadasPorMes, 0));
  const custoFixoMes = fixas.length ? custoDe(fixas) : 0;
  const desligadasQueCobram = ROTINAS.filter((x) => !ligada(x) && cobra(x));
  const custoSeLigar = desligadasQueCobram.length ? custoDe(desligadasQueCobram) : 0;
  const rotina = (id: string) => ROTINAS.find((x) => x.id === id)!;
  const INTERRUPTORES_QUE_COBRAM: { chave: InterruptorRotina; titulo: string; texto: React.ReactNode; rotina: RotinaSerpro; ligada: string; desligada: string }[] = [
    {
      chave: 'auto_rotina_pgdas', rotina: rotina('pgdas-consulta'), titulo: 'Consultar o PGDAS-D sozinho',
      texto: (<>Dia <strong className="text-ink">16</strong>: consulta todos os clientes do Simples e mostra quem já transmitiu e como estão os DAS. No <strong className="text-ink">dia seguinte ao prazo</strong>: consulta só quem ainda não transmitiu. Sem procuração ou já consultado no dia: não cobra.</>),
      ligada: 'Consulta automática do PGDAS-D ligada.', desligada: 'Consulta automática do PGDAS-D desligada.',
    },
    {
      chave: 'auto_leitura_faturamento', rotina: rotina('leitura-faturamento'), titulo: 'Ler o faturamento do Simples todo mês',
      texto: (<>Dia <strong className="text-ink">30</strong> (fev.: último dia): lê o PDF da declaração do mês anterior de <strong className="text-ink">todos os clientes do Simples</strong> (só matriz) e atualiza o cartão "Faturamento e limites". <strong className="text-ink">Primeira leitura: 30/10/2026.</strong> Sem procuração, já lido ou sem transmissão: não cobra. Avisa no sino ao terminar. Precisa da rotina do PGDAS-D ligada.</>),
      ligada: 'Leitura mensal do faturamento ligada.', desligada: 'Leitura mensal do faturamento desligada.',
    },
    {
      chave: 'auto_rotina_sitfis', rotina: rotina('sitfis-mensal'), titulo: 'Gerar a situação fiscal de todos os clientes todo mês',
      texto: (<>Dia <strong className="text-ink">30</strong> (fev.: último dia): gera o relatório de situação fiscal de <strong className="text-ink">todos os clientes ativos</strong> (só matriz). <strong className="text-ink">Primeira rodada: 30/10/2026.</strong> Cada relatório custa <strong className="text-ink">R$ 0,32</strong>; o pedido do protocolo é grátis. Sem procuração ou já com relatório do dia: não cobra. Avisa no sino, e no dia seguinte a rotina de tarefas cria a tarefa de quem tem pendência.</>),
      ligada: 'Rotina mensal da Situação Fiscal ligada.', desligada: 'Rotina mensal da Situação Fiscal desligada.',
    },
    {
      chave: 'auto_rotina_dctfweb', rotina: rotina('dctfweb-mensal'), titulo: 'Consultar a DCTFWeb e a MIT de quem teve movimento, todo mês',
      texto: (<>Todo dia, a Receita avisa de graça quem do Presumido e do Real teve movimento. Dia <strong className="text-ink">30</strong> (fev.: último dia): consulta <strong className="text-ink">só esses clientes</strong> (recibo da DCTFWeb e apurações da MIT) e conclui as tarefas "DCTF" e "MIT" de quem entregou. Sem movimento: não cobra. <strong className="text-ink">Primeira rodada: 30/10/2026.</strong></>),
      ligada: 'Rotina mensal da DCTFWeb e MIT ligada.', desligada: 'Rotina mensal da DCTFWeb e MIT desligada.',
    },
    {
      chave: 'auto_rotina_defis', rotina: rotina('defis-anual'), titulo: 'Conferir a DEFIS duas vezes por ano',
      texto: (<>Vence em <strong className="text-ink">31 de março</strong> (ou próximo dia útil). Em <strong className="text-ink">15 de março</strong>: consulta quem ainda não tem a DEFIS do ano, para a equipe cobrar a tempo. No <strong className="text-ink">dia seguinte ao prazo</strong>: consulta só quem continua sem ela (prova de "não entregue"). Ficam de fora empresa aberta depois do ano, filial e quem não tem procuração.</>),
      ligada: 'Rotina anual da DEFIS ligada.', desligada: 'Rotina anual da DEFIS desligada.',
    },
    {
      chave: 'auto_lote_pagamentos_simples', rotina: rotina('lote-simples'), titulo: 'Detalhes dos pagamentos do Simples no dia 30',
      texto: (<>Dia <strong className="text-ink">30</strong> (fev.: último dia): usa o selo gratuito "pagamento novo" para achar quem pagou e consulta <strong className="text-ink">só esses clientes do Simples</strong> (documento, data, valor e composição). Conclui a tarefa do DAS e avisa no sino quantos seguem sem pagamento. Quem não pagou ou não tem procuração: não cobra. Pagamento dos últimos dias do mês entra no mês seguinte.</>),
      ligada: 'Lote do dia 30 do Simples ligado.', desligada: 'Lote do dia 30 do Simples desligado.',
    },
    {
      chave: 'auto_lote_pagamentos_presumido_real', rotina: rotina('lote-presumido-real'), titulo: 'Consulta completa dos pagamentos do Presumido e do Real no dia 30',
      texto: (<>Dia <strong className="text-ink">30</strong> (fev.: último dia): consulta os pagamentos de <strong className="text-ink">todos os clientes do Presumido e do Real</strong> (só matriz) e guarda os DARF pagos. Conclui PIS/COFINS e IRPJ/CSLL quando os dois foram pagos. Sem procuração ou já consultado no dia: não cobra.</>),
      ligada: 'Lote do dia 30 do Presumido e Real ligado.', desligada: 'Lote do dia 30 do Presumido e Real desligado.',
    },
  ];

  const alertaValor = config?.alerta_gasto_mensal ?? 100;
  const passouAlerta = r.custo >= alertaValor;
  const volumeDeclarado = config?.volume_declarado_mes ?? null;

  const handleSalvar = async () => {
    const a = Number(alerta.replace(',', '.'));
    const v = volume.trim() ? Math.round(Number(volume)) : null;
    if (!Number.isFinite(a) || a < 0) { toast.error('Informe um valor de alerta válido.'); return; }
    try {
      await salvar.mutateAsync({ alerta_gasto_mensal: a, volume_declarado_mes: v });
      toast.success('Configuração salva.');
    } catch { toast.error('Não foi possível salvar.'); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/tech · serpro"
        title="SERPRO."
      />

      <Tabs defaultValue="consumo" className="space-y-6">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="consumo" className={tabsTriggerClass}>Consumo / Financeiro</TabsTrigger>
          <TabsTrigger value="rotinas" className={tabsTriggerClass}>Rotinas / Automações</TabsTrigger>
          <TabsTrigger value="regras" className={tabsTriggerClass}>Regras</TabsTrigger>
        </TabsList>

        <TabsContent value="consumo" className="mt-0 space-y-6">
          {passouAlerta && (
            <DsAlert tone="warn" title="Gasto do ciclo acima do alerta" description={`A estimativa (${reais(r.custo)}) passou do limite de ${reais(alertaValor)}. Confira o que mais consumiu abaixo.`} />
          )}

          {isLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <StatCardRow
              items={[
                { label: 'Gasto estimado do ciclo', value: reais(r.custo), hint: `alerta em ${reais(alertaValor)}`, emphasis: passouAlerta ? 'warm' : 'none' },
                { label: 'Chamadas cobradas', value: r.cobradas, hint: `${r.consulta} consulta · ${r.emissao} emissão · ${r.declaracao} declaração` },
                { label: 'Chamadas gratuitas', value: r.gratis, hint: 'monitoramento e apoio (não cobradas)' },
                { label: 'Volume no ciclo', value: r.total, hint: volumeDeclarado ? `declarado ao Serpro: ${volumeDeclarado}` : 'volume declarado não informado' },
              ]}
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
              <h2 className="text-h4-card text-ink">Alerta e volume declarado</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-meta text-muted-ink">
                  Alertar quando o gasto passar de (R$)
                  <Input inputMode="decimal" value={alerta} onChange={(e) => setAlerta(e.target.value)} />
                </label>
                <label className="space-y-1.5 text-meta text-muted-ink">
                  Volume declarado no Serpro (chamadas)
                  <Input inputMode="numeric" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="ex.: 5000" />
                </label>
              </div>
              <DicaBotao texto="Salva o alerta de gasto mensal e o volume declarado ao Serpro.">
                <Button onClick={handleSalvar} disabled={salvar.isPending}>
                  {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
                </Button>
              </DicaBotao>
              <p className="text-meta text-muted-ink-2">
                O Serpro suspende o acesso sozinho se o consumo subir de forma abrupta acima do volume seguro (contrato, cláusula 5).
                {r.testes > 0 && ` ${r.testes} chamadas de teste (trial) neste ciclo não entram na conta.`}
              </p>
            </section>

            <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
              <h2 className="text-h4-card text-ink">Erros no ciclo</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Sem procuração (403)', r.erros.semProcuracao, 'cobrado pelo Serpro'],
                  ['Sem resposta (504)', r.erros.timeout, 'não cobrado; não reenviar de imediato'],
                  ['Limite atingido (429)', r.erros.limite, 'não cobrado'],
                  ['Erro do servidor (5xx)', r.erros.servidor, 'não cobrado'],
                ].map(([rot, n, dica]) => (
                  <div key={String(rot)} className="rounded-md border border-line bg-bg-2 p-3">
                    <p className="text-meta uppercase text-muted-ink-2">{rot}</p>
                    <p className="text-metric-xl text-ink">{n}</p>
                    <p className="text-meta text-muted-ink">{dica}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="space-y-3">
            <h2 className="text-h4-card text-ink">Por serviço</h2>
            <div className="overflow-hidden rounded-lg border border-line bg-paper">
              <Table>
                <TableHeader><TableRow><TableHead>Serviço</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Chamadas</TableHead><TableHead className="text-right">Cobradas</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.servicos.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="p-8 text-center text-ui text-muted-ink">Nenhuma chamada de produção neste ciclo.</TableCell></TableRow>
                  ) : r.servicos.map(([chave, s]) => (
                    <TableRow key={chave}>
                      <TableCell className="font-mono text-ui">{chave}</TableCell>
                      <TableCell className="text-ui">{s.tipo}</TableCell>
                      <TableCell className="text-right font-mono text-ui">{s.total}</TableCell>
                      <TableCell className="text-right font-mono text-ui">{s.cobradas}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
            <div className="space-y-1">
              <h2 className="text-h4-card text-ink">Rotinas automáticas e custo fixo por mês</h2>
              <p className="text-ui text-muted-ink">
                O que roda sozinho e quanto custa por mês. É o custo fixo: o que passar disso vem de cliques da equipe.
              </p>
            </div>

            <StatCardRow
              items={[
                { label: 'Custo fixo por mês', value: reais(custoFixoMes), hint: custoFixoMes === 0 ? 'nenhuma rotina automática cobra' : 'rotinas automáticas que cobram' },
                { label: 'Rotinas ligadas', value: ligadas.length, hint: `${ligadas.length - fixas.length} grátis ou sem chamada ao Serpro${desligadasQueCobram.length ? ` · ${desligadasQueCobram.length} desligada${desligadasQueCobram.length === 1 ? '' : 's'}` : ''}` },
                { label: 'Cobrado por rotina neste ciclo', value: r.rotinaCobradas, hint: `${reais(r.rotinaCusto)} medido no registro de chamadas`, emphasis: r.rotinaCobradas > 0 ? 'warm' : 'none' },
                { label: 'Se ligar as desligadas', value: reais(custoSeLigar), hint: desligadasQueCobram.length ? 'por mês (estimativa), além do custo fixo' : 'nenhuma rotina que cobra está desligada' },
              ]}
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rotina</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Tipo de chamada</TableHead>
                  <TableHead className="text-right">Chamadas por mês</TableHead>
                  <TableHead className="text-right">Custo por mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROTINAS.map((x) => {
                  const on = ligada(x);
                  const custo = cobra(x) ? reais(custoEstimado(x.tipo as 'Consultar' | 'Emitir', x.chamadasPorMes)) : 'R$ 0,00';
                  return (
                    <TableRow key={x.id} className={on ? undefined : 'opacity-70'}>
                      <TableCell className="align-top text-ui text-ink">
                        {x.nome}
                        {x.interruptor && <div className="mt-1"><DsBadge tone={on ? 'ok' : 'neutral'}>{on ? 'Ligada' : 'Desligada'}</DsBadge></div>}
                      </TableCell>
                      <TableCell className="align-top text-ui text-muted-ink">{x.quando}</TableCell>
                      <TableCell className="align-top text-ui text-muted-ink">{ROTULO_TIPO[x.tipo]}</TableCell>
                      <TableCell className="text-right align-top text-ui text-ink">{on ? x.chamadasPorMes : <span className="text-muted-ink-2">{x.chamadasPorMes} se ligar</span>}</TableCell>
                      <TableCell className="text-right align-top text-ui text-ink">{on ? custo : <span className="text-muted-ink-2">{custo} se ligar</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <p className="text-meta text-muted-ink-2">
              Passe único do PGDAS da carteira do Simples (aprovado em 01/10/2026): uma consulta por cliente, feita uma vez, sem repetir sozinha. Aparece como gasto manual no ciclo.
            </p>
          </section>
        </TabsContent>

        <TabsContent value="rotinas" className="mt-0 space-y-6">
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-paper p-5">
            <div className="min-w-[260px] flex-1 space-y-1">
              <h2 className="text-h4-card text-ink">Concluir tarefas fiscais sozinho</h2>
              <p className="text-ui text-muted-ink">
                Quando a consulta prova que o item está feito, a tarefa do mês é concluída na hora, com a origem registrada.
                <strong className="text-ink"> Conclui:</strong> DAS pago ou declaração sem receita e sem débito, DCTFWeb com recibo, MIT encerrada e DARF pago de PIS/COFINS ou de IRPJ/CSLL.
                <strong className="text-ink"> Não conclui:</strong> "sem declaração", "sem apuração" ou DAS só transmitido (a tarefa inclui enviar o DAS ao cliente).
              </p>
            </div>
            <DicaBotao texto={config?.auto_concluir_tarefas === false ? 'Desligado: nenhuma tarefa é concluída sozinha. Ligue para voltar a concluir.' : 'Ligado: desligue se quiser que as tarefas fiquem sempre por conta da equipe.'}>
              <Switch
                checked={config?.auto_concluir_tarefas ?? true}
                disabled={!config || salvar.isPending}
                onCheckedChange={async (v) => {
                  try { await salvar.mutateAsync({ auto_concluir_tarefas: v }); toast.success(v ? 'Conclusão automática ligada.' : 'Conclusão automática desligada.'); }
                  catch { toast.error('Não foi possível salvar.'); }
                }}
              />
            </DicaBotao>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-paper p-5">
            <div className="min-w-[260px] flex-1 space-y-1">
              <h2 className="text-h4-card text-ink">Criar tarefas fiscais sozinho</h2>
              <p className="text-ui text-muted-ink">
                Todo dia, 08:00: cria a tarefa, com o responsável do cliente, para <strong className="text-ink">mensagem da Caixa Postal que exige ação</strong> (últimos 30 dias)
                e para <strong className="text-ink">pendência na Situação Fiscal</strong>. Uma tarefa aberta por cliente e por tipo. Não chama o Serpro: grátis.
              </p>
            </div>
            <DicaBotao texto={config?.auto_criar_tarefas === false ? 'Desligado: nenhuma tarefa é criada sozinha. Ligue para voltar a criar.' : 'Ligado: desligue se quiser criar as tarefas só à mão.'}>
              <Switch
                checked={config?.auto_criar_tarefas ?? true}
                disabled={!config || salvar.isPending}
                onCheckedChange={async (v) => {
                  try { await salvar.mutateAsync({ auto_criar_tarefas: v }); toast.success(v ? 'Criação automática de tarefas ligada.' : 'Criação automática de tarefas desligada.'); }
                  catch { toast.error('Não foi possível salvar.'); }
                }}
              />
            </DicaBotao>
          </section>

          <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
            <div className="space-y-1">
              <h2 className="text-h4-card text-ink">Alertas da equipe no sino</h2>
              <p className="text-ui text-muted-ink">
                Todo dia, 08:15: avisa no sino o <strong className="text-ink">responsável do cliente</strong> (ou quem o cobre na ausência); sem responsável, vai para os administradores.
                Um aviso por item, nunca repete. Não chama o Serpro: grátis.
              </p>
            </div>
            <div className="divide-y divide-line-2">
              {ALERTAS_EQUIPE.map((a) => {
                const ligado = config ? config[a.chave] : true;
                return (
                  <div key={a.chave} className="flex flex-wrap items-center justify-between gap-4 py-3">
                    <div className="min-w-[260px] flex-1 space-y-0.5">
                      <h3 className="flex flex-wrap items-center gap-2 text-ui-strong text-ink">{a.titulo}<DsBadge tone={ligado ? 'ok' : 'neutral'}>{ligado ? 'Ligado' : 'Desligado'}</DsBadge></h3>
                      <p className="text-meta text-muted-ink">{a.texto}</p>
                    </div>
                    <DicaBotao texto={ligado ? 'Ligado: desligue se a equipe não quiser mais esse aviso no sino.' : 'Desligado: nenhum aviso deste tipo. Ligue quando quiser.'}>
                      <Switch
                        checked={ligado}
                        disabled={!config || salvar.isPending}
                        onCheckedChange={async (v) => {
                          try { await salvar.mutateAsync({ [a.chave]: v }); toast.success(v ? `${a.titulo}: ligado.` : `${a.titulo}: desligado.`); }
                          catch { toast.error('Não foi possível salvar.'); }
                        }}
                      />
                    </DicaBotao>
                  </div>
                );
              })}
            </div>
          </section>

          {INTERRUPTORES_QUE_COBRAM.map((it) => {
            const ligado = config ? config[it.chave] : (it.rotina.padraoLigado ?? true);
            return (
              <section key={it.chave} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-paper p-5">
                <div className="min-w-[260px] flex-1 space-y-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-h4-card text-ink">
                    {it.titulo} <span className="text-meta text-muted-ink-2">(esta rotina cobra)</span>
                    <DsBadge tone={ligado ? 'ok' : 'neutral'}>{ligado ? 'Ligada' : 'Desligada'}</DsBadge>
                  </h2>
                  <p className="text-ui text-muted-ink">
                    {it.texto} Custa cerca de <strong className="text-ink">{reais(custoEstimado(it.rotina.tipo === 'Emitir' ? 'Emitir' : 'Consultar', it.rotina.chamadasPorMes))} por mês</strong> ({it.rotina.chamadasPorMes} chamadas, estimativa).
                  </p>
                </div>
                <DicaBotao texto={ligado ? 'Ligado: desligue se não quiser que o sistema consulte (e cobre) sozinho.' : 'Desligado: nenhuma consulta automática desta rotina. Ligue quando quiser.'}>
                  <Switch
                    checked={ligado}
                    disabled={!config || salvar.isPending}
                    onCheckedChange={async (v) => {
                      try { await salvar.mutateAsync({ [it.chave]: v }); toast.success(v ? it.ligada : it.desligada); }
                      catch { toast.error('Não foi possível salvar.'); }
                    }}
                  />
                </DicaBotao>
              </section>
            );
          })}
        </TabsContent>

        <TabsContent value="regras" className="mt-0 space-y-6">
          <DsAlert
            tone="info"
            title="Como funciona o custo"
            description={'O selo da Caixa Postal é grátis (rotina diária das 07:30). "Consultar" baixa a lista de mensagens de um cliente e custa R$ 0,24 por consulta (1ª faixa do contrato), sem registrar ciência. O corpo de cada mensagem só abre por clique individual, depois do aviso de ciência. Serviços de monitoramento e apoio não são cobrados.'}
          />

          <section className="space-y-1.5 rounded-lg border border-line bg-paper p-5">
            <h2 className="text-h4-card text-ink">Quem entra no monitoramento</h2>
            <p className="text-ui text-muted-ink">
              Só clientes com status <strong className="text-ink">{STATUS_MONITORADO}</strong> entram na rotina das 07:30 e nas consultas ao Serpro.
              Cliente suspenso por falta de pagamento (“Suspensa - Contabilidade”), ex-cliente, baixado, inapto ou suspenso na Receita
              fica de fora sozinho, sem nenhuma chamada. Quando voltar para “{STATUS_MONITORADO}” no cadastro, volta na hora.
            </p>
            <p className="text-meta text-muted-ink-2">
              {monitorados} clientes monitorados hoje
              {foraPorStatus.size > 0 && ` · fora: ${[...foraPorStatus.entries()].map(([s, n]) => `${n} ${s}`).join(', ')}`}
              {!foraPorStatus.has('Suspensa - Contabilidade') && ' · nenhum suspenso por falta de pagamento'}.
            </p>
          </section>

          <ConfigRelatorios />
        </TabsContent>
      </Tabs>
    </div>
  );
}
