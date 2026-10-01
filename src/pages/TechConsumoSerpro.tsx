import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { DsAlert, DsBadge, PageHeader, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import {
  cicloAtual, custoEstimado, useConsumoSerpro, useSalvarSerproConfig, useSerproConfig,
} from '@/hooks/useSerproConsumo';
import { STATUS_MONITORADO, useClientesCaixa } from '@/hooks/useSerproCaixaPostal';
import { ROTINAS, cobra, type InterruptorRotina, type RotinaSerpro, type TipoRotina } from '@/lib/rotinasSerpro';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ROTULO_TIPO: Record<TipoRotina, string> = { Monitorar: 'Monitorar (grátis)', Consultar: 'Consultar', Emitir: 'Emitir', sem_chamada: 'Sem chamada ao Serpro' };

function useNomesUsuarios() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-nomes-usuarios', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name').eq('company_id', company!.id);
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.user_id, p.full_name ?? 'Usuário']));
    },
  });
}

export default function TechConsumoSerpro() {
  const ciclo = cicloAtual();
  const { data: chamadas = [], isLoading } = useConsumoSerpro();
  const { data: config } = useSerproConfig();
  const { data: nomes } = useNomesUsuarios();
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
    const porDia = new Map<string, { total: number; cobradas: number }>();
    const porUsuario = new Map<string, { total: number; cobradas: number }>();
    for (const c of prod) {
      const chave = `${c.id_sistema}.${c.id_servico}`;
      const s = porServico.get(chave) ?? { tipo: c.tipo_chamada, total: 0, cobradas: 0 };
      s.total++; if (c.cobravel) s.cobradas++;
      porServico.set(chave, s);
      const d = format(new Date(c.created_at), 'dd/MM');
      const dia = porDia.get(d) ?? { total: 0, cobradas: 0 };
      dia.total++; if (c.cobravel) dia.cobradas++;
      porDia.set(d, dia);
      const u = c.acionado_por ?? (c.origem === 'cron' ? 'cron' : 'sistema');
      const us = porUsuario.get(u) ?? { total: 0, cobradas: 0 };
      us.total++; if (c.cobravel) us.cobradas++;
      porUsuario.set(u, us);
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
      dias: [...porDia.entries()].slice(0, 14),
      usuarios: [...porUsuario.entries()].sort((a, b) => b[1].total - a[1].total),
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
      texto: (<>No <strong className="text-ink">dia 16</strong>, o sistema consulta o ano de cada cliente do Simples (07:45 a 08:00) para mostrar quem já transmitiu o mês anterior e como estão os DAS. No <strong className="text-ink">dia seguinte ao prazo</strong> (dia 20, ou o próximo dia útil se cair em fim de semana ou feriado nacional), consulta de novo só quem ainda não transmitiu. Quem não tem procuração não é consultado, e quem já foi consultado no dia não é cobrado de novo.</>),
      ligada: 'Consulta automática do PGDAS-D ligada.', desligada: 'Consulta automática do PGDAS-D desligada.',
    },
    {
      chave: 'auto_leitura_faturamento', rotina: rotina('leitura-faturamento'), titulo: 'Ler o faturamento do Simples a cada dois meses',
      texto: (<>A cada dois meses, no <strong className="text-ink">dia 30 de outubro, dezembro, fevereiro (último dia), abril, junho e agosto</strong>, a partir das 18:20, o sistema baixa e lê o PDF da declaração do mês anterior de <strong className="text-ink">todos os clientes do Simples</strong> (só matriz) e guarda receita, acumulado de 12 meses, limite, sublimite e fator r, que alimentam o cartão "Faturamento e limites". <strong className="text-ink">A primeira leitura é em 30/10/2026.</strong> Cada rodada custa cerca de <strong className="text-ink">{reais(custoEstimado('Consultar', 144))}</strong> (144 clientes). Quem já foi lido, quem não tem procuração e quem ainda não transmitiu não é cobrado. Ao terminar, avisa no sino quantos estão acima do limite, em atenção ou perto do sublimite. Ela usa a lista de declarações que a rotina do PGDAS-D (dias 16 e seguinte ao prazo) mantém atualizada: com aquela rotina desligada, não há o que ler.</>),
      ligada: 'Leitura bimestral do faturamento ligada.', desligada: 'Leitura bimestral do faturamento desligada.',
    },
    {
      chave: 'auto_rotina_sitfis', rotina: rotina('sitfis-bimestral'), titulo: 'Gerar a situação fiscal de todos os clientes a cada dois meses',
      texto: (<>A cada dois meses, no <strong className="text-ink">dia 30 de outubro, dezembro, fevereiro (último dia), abril, junho e agosto</strong>, a partir das 19:00, o sistema gera o relatório de situação fiscal de <strong className="text-ink">todos os clientes ativos</strong> (só matriz) e lê o resultado: sem pendências, com pendências ou a conferir. <strong className="text-ink">A primeira rodada é em 30/10/2026</strong>, sem rodada de atualização antes. Cada relatório emitido custa <strong className="text-ink">R$ 0,32</strong>, cerca de <strong className="text-ink">{reais(custoEstimado('Emitir', 197))} por rodada</strong> (197 clientes); o pedido do protocolo é grátis. Quem não tem procuração, quem já tem relatório do dia e quem falhou hoje não é cobrado de novo. Ao terminar, avisa no sino, e no dia seguinte às 08:00 a rotina de tarefas cria a tarefa de quem tem pendência.</>),
      ligada: 'Rotina bimestral da Situação Fiscal ligada.', desligada: 'Rotina bimestral da Situação Fiscal desligada.',
    },
    {
      chave: 'auto_rotina_defis', rotina: rotina('defis-anual'), titulo: 'Conferir a DEFIS duas vezes por ano',
      texto: (<>A DEFIS vence em <strong className="text-ink">31 de março</strong> do ano seguinte (se cair em fim de semana ou feriado, no próximo dia útil). Em <strong className="text-ink">15 de março</strong>, o sistema consulta o índice das DEFIS de cada cliente do Simples que ainda não tem a do ano na lista, para a equipe cobrar a tempo. No <strong className="text-ink">dia seguinte ao prazo</strong> (1º de abril de 2027), consulta de novo <strong className="text-ink">só quem continua sem a DEFIS</strong>: a consulta depois do prazo é a prova de "não entregue". Empresa aberta depois do ano, filial e quem não tem procuração não entram. Ao fim de cada rodada, avisa no sino.</>),
      ligada: 'Rotina anual da DEFIS ligada.', desligada: 'Rotina anual da DEFIS desligada.',
    },
    {
      chave: 'auto_lote_pagamentos_simples', rotina: rotina('lote-simples'), titulo: 'Detalhes dos pagamentos do Simples no dia 30',
      texto: (<>Durante o mês, quem pagou aparece pela rotina gratuita diária (selo "pagamento novo"). No <strong className="text-ink">dia 30</strong> (em fevereiro, no último dia do mês), às 18:00, o sistema relê esse sensor gratuito e consulta Pagamentos na Receita <strong className="text-ink">só dos clientes do Simples que tiveram pagamento no mês</strong>, para guardar os detalhes: documento, data, valor e composição. Quem não pagou nada não é cobrado. Conclui a tarefa do DAS de quem pagou e, ao terminar, avisa no sino quantos DAS continuam sem pagamento. Quem não tem procuração e quem já foi consultado no dia também não é cobrado. A Receita demora uns dias para registrar: o pagamento dos últimos dias do mês entra na consulta do mês seguinte.</>),
      ligada: 'Lote do dia 30 do Simples ligado.', desligada: 'Lote do dia 30 do Simples desligado.',
    },
    {
      chave: 'auto_lote_pagamentos_presumido_real', rotina: rotina('lote-presumido-real'), titulo: 'Consulta completa dos pagamentos do Presumido e do Real no dia 30',
      texto: (<>Durante o mês, quem pagou aparece pela rotina gratuita diária (selo "pagamento novo"). No <strong className="text-ink">dia 30</strong> (em fevereiro, no último dia do mês), às 18:10, o sistema consulta Pagamentos na Receita de <strong className="text-ink">todos os clientes do Presumido e do Real</strong> (só matriz) e guarda os detalhes dos DARF pagos. Conclui as tarefas de PIS/COFINS e IRPJ/CSLL quando os dois tributos foram pagos e, ao terminar, avisa no sino. Quem não tem procuração e quem já foi consultado no dia não é cobrado.</>),
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

  const nomeUsuario = (id: string) => (id === 'cron' ? 'Rotina automática (07:30)' : id === 'sistema' ? 'Sistema' : nomes?.get(id) ?? 'Usuário');

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/tech · consumo serpro"
        title="Consumo Serpro."
        subtitle={`Ciclo de cobrança: ${ciclo.rotulo}. Valores são estimativa a partir do nosso registro de chamadas; o oficial fica em “Consultar Consumo” na Área do Cliente do Serpro.`}
      />

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

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-paper p-5">
        <div className="min-w-[260px] flex-1 space-y-1">
          <h2 className="text-h4-card text-ink">Concluir tarefas fiscais sozinho</h2>
          <p className="text-ui text-muted-ink">
            Quando você consulta um cliente e a Receita prova que está feito, a tarefa daquele mês é concluída na hora, com a origem registrada:
            DAS <strong className="text-ink">pago</strong> ou declaração <strong className="text-ink">sem receita e sem débito</strong> ("DAS - Simples Nacional"),
            DCTFWeb com recibo ("DCTF"), MIT encerrada ("MIT") e DARF pago de PIS e COFINS ou de IRPJ e CSLL do mesmo período.
            "Sem declaração" ou "sem apuração" não conclui (a Receita não prova "sem movimento"), e DAS transmitido sozinho também não:
            a tarefa inclui enviar o DAS ao cliente.
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
            Todo dia às 08:00, o sistema olha o que já está salvo e cria uma tarefa fiscal, com o responsável do cliente, quando a Receita mandou algo
            que ainda não tem tarefa aberta: <strong className="text-ink">comunicação que exige ação</strong> na Caixa Postal (dos últimos 30 dias),
            <strong className="text-ink"> pendência na Situação Fiscal</strong> ou <strong className="text-ink">parcela de parcelamento em atraso</strong>.
            É uma tarefa aberta por cliente e por tipo. Não chama o Serpro e não custa nada.
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
                {it.texto} Cada cliente gera uma chamada cobrada: cerca de <strong className="text-ink">{reais(custoEstimado(it.rotina.tipo === 'Emitir' ? 'Emitir' : 'Consultar', it.rotina.chamadasPorMes))} por mês</strong> na média ({it.rotina.chamadasPorMes} chamadas por mês, estimativa).
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

      <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
        <div className="space-y-1">
          <h2 className="text-h4-card text-ink">Rotinas automáticas e custo fixo por mês</h2>
          <p className="text-ui text-muted-ink">
            Tudo o que roda sozinho, sem ninguém clicar, e quanto isso custa no Serpro. É o seu custo fixo: o que passar disso vem de cliques da equipe.
            Os avisos do sino e as tarefas criadas leem só o que já está salvo no sistema.
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
              <TableHead>O que faz</TableHead>
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
                  <TableCell className="max-w-[420px] align-top text-meta text-muted-ink">{x.faz}</TableCell>
                  <TableCell className="align-top text-ui text-muted-ink">{ROTULO_TIPO[x.tipo]}</TableCell>
                  <TableCell className="text-right align-top text-ui text-ink">{on ? x.chamadasPorMes : <span className="text-muted-ink-2">{x.chamadasPorMes} se ligar</span>}</TableCell>
                  <TableCell className="text-right align-top text-ui text-ink">{on ? custo : <span className="text-muted-ink-2">{custo} se ligar</span>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <p className="text-meta text-muted-ink-2">
          Há também o passe único do PGDAS da carteira do Simples, aprovado em 01/10/2026: uma consulta por cliente, feita uma vez, que não se repete sozinha. Ele aparece como gasto manual no ciclo.
        </p>
      </section>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-h4-card text-ink">Por dia (últimos 14 com chamadas)</h2>
          <div className="overflow-hidden rounded-lg border border-line bg-paper">
            <Table>
              <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Chamadas</TableHead><TableHead className="text-right">Cobradas</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.dias.map(([d, v]) => (
                  <TableRow key={d}><TableCell className="font-mono text-ui">{d}</TableCell><TableCell className="text-right font-mono text-ui">{v.total}</TableCell><TableCell className="text-right font-mono text-ui">{v.cobradas}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-h4-card text-ink">Por usuário</h2>
          <div className="overflow-hidden rounded-lg border border-line bg-paper">
            <Table>
              <TableHeader><TableRow><TableHead>Quem</TableHead><TableHead className="text-right">Chamadas</TableHead><TableHead className="text-right">Cobradas</TableHead></TableRow></TableHeader>
              <TableBody>
                {r.usuarios.map(([u, v]) => (
                  <TableRow key={u}><TableCell className="text-ui">{nomeUsuario(u)}</TableCell><TableCell className="text-right font-mono text-ui">{v.total}</TableCell><TableCell className="text-right font-mono text-ui">{v.cobradas}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
