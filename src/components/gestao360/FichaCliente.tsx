import { Link } from 'react-router-dom';

import { DsBadge, type BadgeTone } from '@/components/ds';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { TOM_NIVEL } from '@/components/gestao360/ListaClientesSheet';
import { digitos, ROTULO_NIVEL, type LinhaCarteira } from '@/lib/situacaoCarteira';

const sigla = (pa: string) => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

interface Linha { fonte: string; tom: BadgeTone; rotulo: string; detalhe?: string; to: string }

/** Uma linha por fonte, com o estado do cliente. Fonte que não se aplica ao cliente não aparece. */
function linhasDaFicha(l: LinhaCarteira): Linha[] {
  const out: Linha[] = [];
  const q = `?q=${digitos(l.documento)}`;
  const fed = (p: string) => `/dashboard-federal/${p}${q}`;

  if (l.pgdas.estado !== 'nao_se_aplica') {
    const p = l.pgdas;
    if (p.estado === 'nao_consultado') out.push({ fonte: 'PGDAS-D', tom: 'neutral', rotulo: 'Não consultado', detalhe: 'Ainda sem consulta neste ano', to: fed('pgdas') });
    else if (p.estado === 'em_falta') out.push({ fonte: 'PGDAS-D', tom: 'danger', rotulo: 'Em falta', detalhe: p.emFalta.map(sigla).join(', '), to: fed('pgdas') });
    else if (p.estado === 'a_confirmar') out.push({ fonte: 'PGDAS-D', tom: 'warn', rotulo: 'A confirmar', detalhe: `${p.aConfirmar.map(sigla).join(', ')}: consultar de novo`, to: fed('pgdas') });
    else out.push({ fonte: 'PGDAS-D', tom: 'ok', rotulo: 'Em dia', detalhe: p.aVencer.length ? `${sigla(p.aVencer[0])} ainda no prazo` : undefined, to: fed('pgdas') });
  }

  if (l.defis.estado !== 'nao_se_aplica' && l.defis.estado !== 'filial') {
    const d = l.defis;
    const m: Record<string, { tom: BadgeTone; rotulo: string }> = {
      entregue: { tom: 'ok', rotulo: 'Entregue' }, retificada: { tom: 'ok', rotulo: 'Retificada' },
      em_atraso: { tom: 'danger', rotulo: 'Não entregue' }, a_entregar: { tom: 'info', rotulo: 'A entregar' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
    };
    out.push({ fonte: `DEFIS ${d.ano}`, ...(m[d.estado] ?? { tom: 'neutral' as BadgeTone, rotulo: d.estado }), to: fed('defis') });
  }

  if (l.das !== 'nao_simples' && l.das !== 'filial') {
    const m: Record<string, { tom: BadgeTone; rotulo: string }> = {
      pago: { tom: 'ok', rotulo: 'Pago' }, vencido: { tom: 'danger', rotulo: 'Vencido' }, a_vencer: { tom: 'info', rotulo: 'A vencer' },
      sem_das: { tom: 'neutral', rotulo: 'Sem DAS gerado' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
    };
    out.push({ fonte: `DAS ${sigla(l.dasCompetencia)}`, ...(m[l.das] ?? { tom: 'neutral' as BadgeTone, rotulo: l.das }), to: fed('pagamentos') });
  }

  if (l.dctfweb !== 'nao_se_aplica' && l.dctfweb !== 'filial') {
    const m: Record<string, { tom: BadgeTone; rotulo: string; detalhe?: string }> = {
      transmitida: { tom: 'ok', rotulo: 'Com recibo' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
      sem_declaracao: { tom: 'warn', rotulo: 'A confirmar', detalhe: 'Sem declaração: só existe com movimento' },
    };
    out.push({ fonte: 'DCTFWeb', ...(m[l.dctfweb] ?? { tom: 'neutral' as BadgeTone, rotulo: l.dctfweb }), to: fed('dctfweb-mit') });
  }
  if (l.mit !== 'nao_se_aplica' && l.mit !== 'filial') {
    const m: Record<string, { tom: BadgeTone; rotulo: string }> = {
      encerrada: { tom: 'ok', rotulo: 'Encerrada' }, outra_situacao: { tom: 'info', rotulo: 'Outra situação' },
      sem_apuracao: { tom: 'warn', rotulo: 'A confirmar' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
    };
    out.push({ fonte: 'MIT', ...(m[l.mit] ?? { tom: 'neutral' as BadgeTone, rotulo: l.mit }), to: fed('dctfweb-mit') });
  }

  const sf: Record<string, { tom: BadgeTone; rotulo: string }> = {
    sem_pendencias: { tom: 'ok', rotulo: 'Sem pendências' }, com_pendencias: { tom: 'danger', rotulo: 'Com pendências' },
    a_conferir: { tom: 'warn', rotulo: 'A conferir' }, sem_relatorio: { tom: 'neutral', rotulo: 'Sem relatório' },
  };
  out.push({ fonte: 'Situação fiscal', ...(sf[l.sitfis] ?? { tom: 'neutral' as BadgeTone, rotulo: l.sitfis }), detalhe: l.sitfisEm ? `Relatório de ${dataBR(l.sitfisEm)}` : undefined, to: fed('situacao-fiscal') });

  const ce: Record<string, { tom: BadgeTone; rotulo: string }> = {
    regular: { tom: 'ok', rotulo: 'Regular' }, irregular: { tom: 'danger', rotulo: 'Irregular' }, vencida: { tom: 'warn', rotulo: 'Vencida' }, sem_leitura: { tom: 'neutral', rotulo: 'Sem leitura' },
  };
  out.push({
    fonte: 'Certidão federal', ...ce[l.certidao.situacao],
    detalhe: l.certidao.tipo ? `${l.certidao.tipo}${l.certidao.validade ? ` · até ${dataBR(l.certidao.validade)}` : ''}` : undefined, to: fed('situacao-fiscal'),
  });

  const cx: Record<string, { tom: BadgeTone; rotulo: string }> = {
    nao_lida: { tom: 'warn', rotulo: 'Mensagem não lida' }, nova: { tom: 'info', rotulo: 'Nova mensagem' }, todas_lidas: { tom: 'ok', rotulo: 'Todas lidas' },
    sem_procuracao: { tom: 'danger', rotulo: 'Sem procuração' }, nao_verificada: { tom: 'neutral', rotulo: 'Não verificada' }, inativo: { tom: 'neutral', rotulo: 'Inativo' },
  };
  out.push({ fonte: 'Caixa Postal e-CAC', ...(cx[l.caixa] ?? { tom: 'neutral' as BadgeTone, rotulo: l.caixa }), to: `/mensagens${q}` });

  const m = l.mensagens;
  const alta = Object.values(m.danger).reduce((s, n) => s + n, 0);
  out.push({
    fonte: 'Mensagens que exigem ação', tom: alta > 0 ? 'danger' : m.total > 0 ? 'warn' : 'ok',
    rotulo: m.total === 0 ? 'Nenhuma em aberto' : `${m.total} em aberto`,
    detalhe: m.exclusaoSimples ? 'Inclui termo de exclusão do Simples' : m.intimacoes ? `${m.intimacoes} intimação(ões)` : undefined, to: fed('intimacoes'),
  });

  const pr = l.procuracao;
  const ps: Record<string, { tom: BadgeTone; rotulo: string }> = {
    total: { tom: 'ok', rotulo: 'Completa' }, parcial: { tom: 'warn', rotulo: 'Parcial' }, sem: { tom: 'danger', rotulo: 'Sem procuração' },
    vencida: { tom: 'danger', rotulo: 'Vencida' }, nao_mapeado: { tom: 'neutral', rotulo: 'Não mapeada' }, desconhecida: { tom: 'neutral', rotulo: 'Desconhecida' },
  };
  out.push({
    fonte: 'Procuração', ...ps[pr.situacao],
    ...(pr.vencendo && pr.diasParaVencer !== null && pr.situacao !== 'vencida' ? { tom: 'warn' as BadgeTone, detalhe: `Vence em ${pr.diasParaVencer} dias` } : {}),
    to: fed('procuracoes'),
  });

  if (l.regime === 'simples_nacional') {
    const lm = l.limite;
    const nivel = lm.nivel;
    const nm: Record<string, { tom: BadgeTone; rotulo: string }> = {
      regular: { tom: 'ok', rotulo: 'Regular' }, atencao: { tom: 'warn', rotulo: 'Atenção' }, critico: { tom: 'danger', rotulo: 'Crítico' }, acima: { tom: 'danger', rotulo: 'Acima do limite' },
    };
    out.push({
      fonte: 'Limite do Simples', ...(nivel ? nm[nivel] : { tom: 'neutral' as BadgeTone, rotulo: 'Sem leitura' }),
      detalhe: lm.percentual !== null ? `${lm.percentual.toFixed(0)}% do limite` : undefined, to: fed('faturamento'),
    });
  }
  return out;
}

/** Ficha do cliente escolhido no filtro: o mesmo estado que a carteira soma, só que de um cliente. */
export function FichaCliente({ linha: l }: { linha: LinhaCarteira }) {
  const linhas = linhasDaFicha(l);
  return (
    <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h4-card text-ink">{l.nome}</h2>
          <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)} · {l.regimeRotulo}</p>
        </div>
        <div className="flex items-center gap-3">
          <DsBadge tone={TOM_NIVEL[l.nivel]}>{ROTULO_NIVEL[l.nivel]}</DsBadge>
          <Link to={`/crm/cliente/${l.contact_id}`} className="text-ui-strong text-action hover:underline">Abrir cadastro</Link>
        </div>
      </div>

      {l.motivos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-ui text-ink">
          {l.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

      <div className="divide-y divide-line-2">
        {linhas.map((r) => (
          <div key={r.fonte} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <span className="w-[200px] shrink-0 text-ui-strong text-ink">{r.fonte}</span>
            <DsBadge tone={r.tom}>{r.rotulo}</DsBadge>
            <span className="min-w-0 flex-1 text-meta text-muted-ink">{r.detalhe}</span>
            <Link to={r.to} className="text-ui-strong text-action hover:underline">Ver</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
