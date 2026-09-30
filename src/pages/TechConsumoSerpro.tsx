import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { DsAlert, PageHeader, StatCardRow } from '@/components/ds';
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

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
    const erros = {
      semProcuracao: prod.filter((c) => c.status_http === 403).length,
      timeout: prod.filter((c) => c.status_http === 504).length,
      limite: prod.filter((c) => c.status_http === 429).length,
      servidor: prod.filter((c) => (c.status_http ?? 0) >= 500 && c.status_http !== 504).length,
    };
    return {
      total: prod.length, cobradas: cobradas.length, gratis: prod.length - cobradas.length, custo,
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
            Quando você consulta um cliente e a Receita mostra o DAS do mês <strong className="text-ink">pago</strong>, ou uma declaração
            transmitida <strong className="text-ink">sem receita e sem débito</strong>, a tarefa "DAS - Simples Nacional" daquele mês é
            concluída na hora (protocolo PAGO ou ZERADO, com a origem registrada na tarefa). Declaração transmitida sozinha não conclui:
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
