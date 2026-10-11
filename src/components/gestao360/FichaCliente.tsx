import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Download, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { DsBadge, type BadgeTone } from '@/components/ds';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { EnviarClienteDialog } from '@/components/gestao360/EnviarClienteDialog';
import { TOM_NIVEL } from '@/components/gestao360/ListaClientesSheet';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { ROTULO_CANAL, useDocumentosCliente, useEnviosCliente } from '@/hooks/useEnvioCliente';
import { useGuardarRelatorio, useRelatorioConfig } from '@/hooks/useRelatoriosCliente';
import type { FaturamentoRow } from '@/hooks/useSerproFaturamento';
import { modeloDocumentos, modeloRelatorioFaturamento, modeloRelatorioSituacao, type ModeloMensagem } from '@/lib/mensagensCliente';
import { baixarPdf, brl, carregarLogo, gerarPdfFaturamento, gerarPdfSituacao, mesAno, pdfParaBase64 } from '@/lib/pdfRelatorios';
import { calcularScore, montarPlanoAcao, montarRelatorioFaturamento } from '@/lib/relatoriosCliente';
import { hojeBR } from '@/lib/prazosFederais';
import { digitos, ROTULO_NIVEL, type LinhaCarteira } from '@/lib/situacaoCarteira';

const sigla = (pa: string) => `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

interface Linha { fonte: string; tom: BadgeTone; rotulo: string; detalhe?: string; to: string }

/** Uma linha por fonte, com o estado do cliente. Fonte que não se aplica ao cliente não aparece. */
function linhasDaFicha(l: LinhaCarteira): Linha[] {
  const out: Linha[] = [];
  const q = `?q=${digitos(l.documento)}`;
  const fed = (p: string) => `/dashboard-federal/${p}${q}`;
  // PGDAS-D, DAS, DCTFWeb e MIT abrem já na ficha do cliente na tela (`&cliente=`).
  const comFicha = (p: string) => `/dashboard-federal/${p}${q}&cliente=${l.contact_id}`;

  if (l.pgdas.estado !== 'nao_se_aplica') {
    const p = l.pgdas;
    if (p.estado === 'nao_consultado') out.push({ fonte: 'PGDAS-D', tom: 'neutral', rotulo: 'Não consultado', detalhe: 'Ainda sem consulta neste ano', to: comFicha('simples-nacional') });
    else if (p.estado === 'em_falta') out.push({ fonte: 'PGDAS-D', tom: 'danger', rotulo: 'Em falta', detalhe: p.emFalta.map(sigla).join(', '), to: comFicha('simples-nacional') });
    else if (p.estado === 'a_confirmar') out.push({ fonte: 'PGDAS-D', tom: 'warn', rotulo: 'A confirmar', detalhe: `${p.aConfirmar.map(sigla).join(', ')}: consultar de novo`, to: comFicha('simples-nacional') });
    else out.push({ fonte: 'PGDAS-D', tom: 'ok', rotulo: 'Em dia', detalhe: p.aVencer.length ? `${sigla(p.aVencer[0])} ainda no prazo` : undefined, to: comFicha('simples-nacional') });
  }

  if (l.defis.estado !== 'nao_se_aplica' && l.defis.estado !== 'filial') {
    const d = l.defis;
    const m: Record<string, { tom: BadgeTone; rotulo: string }> = {
      entregue: { tom: 'ok', rotulo: 'Entregue' }, retificada: { tom: 'ok', rotulo: 'Retificada' },
      em_atraso: { tom: 'danger', rotulo: 'Não entregue' }, a_entregar: { tom: 'info', rotulo: 'A entregar' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
    };
    out.push({ fonte: `DEFIS ${d.ano}`, ...(m[d.estado] ?? { tom: 'neutral' as BadgeTone, rotulo: d.estado }), to: `${fed('simples-nacional')}&aba=defis` });
  }

  if (l.das !== 'nao_simples' && l.das !== 'filial') {
    const m: Record<string, { tom: BadgeTone; rotulo: string }> = {
      pago: { tom: 'ok', rotulo: 'Pago' }, vencido: { tom: 'danger', rotulo: 'Vencido' }, a_vencer: { tom: 'info', rotulo: 'A vencer' },
      sem_das: { tom: 'neutral', rotulo: 'Sem DAS gerado' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
    };
    out.push({ fonte: `DAS ${sigla(l.dasCompetencia)}`, ...(m[l.das] ?? { tom: 'neutral' as BadgeTone, rotulo: l.das }), to: comFicha('simples-nacional') });
  }

  if (l.dctfweb !== 'nao_se_aplica' && l.dctfweb !== 'filial') {
    const m: Record<string, { tom: BadgeTone; rotulo: string; detalhe?: string }> = {
      transmitida: { tom: 'ok', rotulo: 'Com recibo' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
      sem_declaracao: { tom: 'warn', rotulo: 'A confirmar', detalhe: 'Sem declaração: só existe com movimento' },
    };
    out.push({ fonte: 'DCTFWeb', ...(m[l.dctfweb] ?? { tom: 'neutral' as BadgeTone, rotulo: l.dctfweb }), to: comFicha('dctfweb-mit') });
  }
  if (l.mit !== 'nao_se_aplica' && l.mit !== 'filial') {
    const m: Record<string, { tom: BadgeTone; rotulo: string }> = {
      encerrada: { tom: 'ok', rotulo: 'Encerrada' }, outra_situacao: { tom: 'info', rotulo: 'Outra situação' },
      sem_apuracao: { tom: 'warn', rotulo: 'A confirmar' }, nao_consultado: { tom: 'neutral', rotulo: 'Não consultado' },
    };
    out.push({ fonte: 'MIT', ...(m[l.mit] ?? { tom: 'neutral' as BadgeTone, rotulo: l.mit }), to: comFicha('dctfweb-mit') });
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

const DOCS_VISIVEIS = 6;

/** Ficha do cliente escolhido no filtro: o mesmo estado que a carteira soma, só que de um cliente, mais os documentos para enviar. */
export function FichaCliente({ linha: l, faturamento = null, extra }: {
  linha: LinhaCarteira;
  /** Leitura de faturamento mais recente e confiável do cliente. */
  faturamento?: FaturamentoRow | null;
  /** Bloco logo abaixo do cabeçalho (a Ficha Fiscal põe aqui o "O que fazer"). */
  extra?: ReactNode;
}) {
  const linhas = linhasDaFicha(l);
  const docs = useDocumentosCliente(l.contact_id);
  const envios = useEnviosCliente(l.contact_id);
  const config = useRelatorioConfig();
  const guardar = useGuardarRelatorio();
  const [envio, setEnvio] = useState<{ marcados: string[]; modelo?: ModeloMensagem } | null>(null);
  const [gerando, setGerando] = useState<'situacao' | 'faturamento' | null>(null);
  const guardados = docs.data ?? [];
  const ultimo = envios.data?.[0];

  const score = useMemo(() => calcularScore(l), [l]);
  const relFat = useMemo(() => montarRelatorioFaturamento(l, faturamento), [l, faturamento]);
  const validado = config.data?.faturamento_validado ?? false;
  const dados = { nome: l.nome, cnpj: formatarCnpj(l.documento), regime: l.regimeRotulo };
  const arquivo = (tipo: string) => `${tipo}-${l.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${hojeBR()}.pdf`;

  const montarPdf = async (tipo: 'situacao' | 'faturamento'): Promise<ArrayBuffer> => {
    const logo = await carregarLogo();
    if (tipo === 'situacao') return gerarPdfSituacao(dados, score, montarPlanoAcao(l, score), hojeBR(), logo);
    const c = config.data;
    const assinatura = c && (c.contador_nome || c.contador_crc || c.contador_cpf) ? { nome: c.contador_nome, crc: c.contador_crc, cpf: c.contador_cpf } : null;
    return gerarPdfFaturamento(dados, relFat!, assinatura, !validado, hojeBR(), logo);
  };
  const baixar = async (tipo: 'situacao' | 'faturamento') => {
    setGerando(tipo);
    try { baixarPdf(await montarPdf(tipo), arquivo(tipo === 'situacao' ? 'situacao-fiscal' : validado ? 'faturamento' : 'faturamento-rascunho')); }
    catch { toast.error('Não foi possível gerar o PDF.'); }
    finally { setGerando(null); }
  };
  const enviarRelatorio = async (tipo: 'situacao' | 'faturamento') => {
    setGerando(tipo);
    try {
      const r = await guardar.mutateAsync({
        contactId: l.contact_id, tipo, periodo: tipo === 'faturamento' ? relFat?.periodo : undefined, pdfBase64: pdfParaBase64(await montarPdf(tipo)),
        resumo: tipo === 'situacao' ? { percentual: score.percentual, regulares: score.regulares, verificados: score.verificados, naoVerificados: score.naoVerificados } : { periodo: relFat?.periodo, rbt12: relFat?.rbt12 },
      });
      setEnvio({ marcados: [`${r.tipo}:${r.id}`], modelo: tipo === 'situacao' ? modeloRelatorioSituacao() : modeloRelatorioFaturamento() });
    } catch (e) { toast.error((e as Error)?.message || 'Não foi possível guardar o relatório.'); }
    finally { setGerando(null); }
  };
  const ocupado = gerando !== null;

  return (
    <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h4-card text-ink">{l.nome}</h2>
          <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)} · {l.regimeRotulo}</p>
          <p className="text-meta text-muted-ink-2">Responsável: {l.responsavel?.nome ?? 'sem responsável no cadastro'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DsBadge tone={TOM_NIVEL[l.nivel]}>{ROTULO_NIVEL[l.nivel]}</DsBadge>
          <Link to={`/gestao-360/ausencias?cliente=${l.contact_id}&aba=ausencias`} className="text-ui-strong text-action hover:underline">Ausências do cliente</Link>
          <Link to={`/crm/cliente/${l.contact_id}`} className="text-ui-strong text-action hover:underline">Abrir cadastro</Link>
          <Button size="sm" onClick={() => setEnvio({ marcados: [] })}><Send className="mr-1.5 h-4 w-4" />Enviar ao cliente</Button>
        </div>
      </div>

      {l.motivos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-ui text-ink">
          {l.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

      {extra}

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

      <div className="space-y-3 border-t border-line-2 pt-4">
        <h3 className="text-ui-strong text-ink">Relatórios para o cliente</h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-[260px] flex-1">
            <p className="text-ui text-ink">Relatório de situação fiscal</p>
            <p className="text-meta text-muted-ink">
              {score.verificados === 0
                ? 'Nenhum item verificado ainda: o relatório sairia só com itens "não verificados".'
                : `Score${score.naoVerificados > 0 ? ' parcial' : ''} ${score.percentual}% · ${score.regulares} de ${score.verificados} itens verificados regulares · ${score.naoVerificados} não ${score.naoVerificados === 1 ? 'verificado' : 'verificados'}`}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => baixar('situacao')}>
            {gerando === 'situacao' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}Baixar PDF
          </Button>
          <DicaBotao texto={score.verificados === 0 ? 'Ainda não há item verificado deste cliente.' : 'Gera o PDF, guarda e abre o envio ao cliente com o relatório já marcado.'}>
            <Button size="sm" disabled={ocupado || score.verificados === 0} onClick={() => enviarRelatorio('situacao')}><Send className="mr-1.5 h-4 w-4" />Enviar ao cliente</Button>
          </DicaBotao>
        </div>
        {l.regime === 'simples_nacional' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-[260px] flex-1">
              <p className="flex flex-wrap items-center gap-2 text-ui text-ink">Faturamento dos últimos 12 meses {relFat && !validado && <DsBadge tone="warn">Modelo aguardando validação do contador</DsBadge>}</p>
              <p className="text-meta text-muted-ink">
                {relFat
                  ? `Leitura de ${mesAno(relFat.periodo)} · RBT12 ${brl(relFat.rbt12 ?? relFat.somaMeses)}${validado ? ' · com assinatura do contador' : ' · só rascunho: não vai ao cliente até o contador validar o modelo (Tech > Rotinas)'}`
                  : 'Faturamento ainda não lido para este cliente. A leitura mensal roda no dia 30; para ler agora (1 consulta), abra Faturamento.'}
              </p>
            </div>
            {relFat ? (
              <>
                <Button variant="outline" size="sm" disabled={ocupado} onClick={() => baixar('faturamento')}>
                  {gerando === 'faturamento' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}{validado ? 'Baixar PDF' : 'Baixar rascunho'}
                </Button>
                <DicaBotao texto={validado ? 'Gera o PDF assinado, guarda e abre o envio ao cliente com o relatório já marcado.' : 'O contador ainda não validou o modelo. Enquanto isso, só dá para baixar o rascunho.'}>
                  <Button size="sm" disabled={ocupado || !validado} onClick={() => enviarRelatorio('faturamento')}><Send className="mr-1.5 h-4 w-4" />Enviar ao cliente</Button>
                </DicaBotao>
              </>
            ) : (
              <Link to={`/dashboard-federal/simples-nacional?q=${digitos(l.documento)}`} className="text-ui-strong text-action hover:underline">Abrir no Simples Nacional</Link>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-line-2 pt-4">
        <h3 className="text-ui-strong text-ink">Documentos guardados</h3>
        {docs.isLoading ? (
          <p className="text-meta text-muted-ink">Procurando documentos…</p>
        ) : guardados.length === 0 ? (
          <p className="text-meta text-muted-ink">Nenhum documento deste cliente está guardado ainda. A rodada mensal (dia 30) guarda a Situação fiscal dos clientes.</p>
        ) : (
          <div className="divide-y divide-line-2">
            {guardados.slice(0, DOCS_VISIVEIS).map((d) => (
              <div key={`${d.tipo}:${d.id}`} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-ui text-ink">{d.rotulo}</span>
                <button type="button" onClick={() => setEnvio({ marcados: [`${d.tipo}:${d.id}`] })} className="text-ui-strong text-action hover:underline">Enviar</button>
              </div>
            ))}
            {guardados.length > DOCS_VISIVEIS && <p className="pt-2 text-meta text-muted-ink">+ {guardados.length - DOCS_VISIVEIS} no botão "Enviar ao cliente".</p>}
          </div>
        )}
        <p className="text-meta text-muted-ink-2">
          {ultimo ? `Último envio: ${ROTULO_CANAL[ultimo.canal] ?? ultimo.canal} em ${format(new Date(ultimo.enviado_em), 'dd/MM/yyyy HH:mm')}.` : 'Nenhum envio registrado para este cliente.'}
        </p>
      </div>

      {envio && (
        <EnviarClienteDialog
          key={envio.marcados.join(',') || 'novo'} contactId={l.contact_id} nome={l.nome} modelo={envio.modelo ?? modeloDocumentos()}
          origem="ficha" marcadosInicial={envio.marcados} onClose={() => setEnvio(null)}
        />
      )}
    </section>
  );
}
