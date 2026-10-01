/**
 * Textos prontos para a equipe mandar ao cliente (sempre editáveis, nunca saem sozinhos).
 * Só gera texto para o que a Receita já confirma: declaração em falta ou ainda no prazo. "A confirmar" e "não consultado"
 * não viram mensagem: ainda não dá para afirmar ao cliente que algo está em falta.
 */
import { dataBR, sigla, type Ausencia } from '@/lib/situacaoCarteira';

export interface ModeloMensagem { assunto: string; texto: string }

const ASSINATURA = 'Qualquer dúvida, estamos à disposição.\nContabilidade Alves';
const ABERTURA = 'Olá! Aqui é da Contabilidade Alves.';

/** Ausência que pode virar mensagem ao cliente. */
export const podeAvisarAusencia = (a: Ausencia) => (a.situacao === 'em_falta' || a.situacao === 'a_vencer') && (a.obrigacao === 'PGDAS-D' || a.obrigacao === 'DEFIS');

export function modeloAusencia(a: Ausencia): ModeloMensagem | null {
  if (!podeAvisarAusencia(a)) return null;
  const prazo = dataBR(a.prazo);
  const emFalta = a.situacao === 'em_falta';

  if (a.obrigacao === 'PGDAS-D') {
    const comp = sigla(a.competencia);
    const situacao = emFalta
      ? `Ainda não transmitimos o PGDAS-D (declaração mensal do Simples Nacional) de ${comp} da sua empresa, e o prazo era ${prazo}.`
      : `O prazo do PGDAS-D (declaração mensal do Simples Nacional) de ${comp} da sua empresa é ${prazo}.`;
    const pedido = emFalta
      ? 'Para regularizar, precisamos do movimento do mês: notas de venda e de serviços emitidas e, se houver, as compras. Pode nos enviar hoje? Quanto antes a declaração for transmitida, menor o risco de multa e de problema com a certidão da empresa.'
      : 'Para transmitirmos a tempo, precisamos do movimento do mês: notas de venda e de serviços emitidas e, se houver, as compras. Pode nos enviar o quanto antes?';
    return {
      assunto: emFalta ? `PGDAS-D ${comp} pendente: precisamos do movimento do mês` : `PGDAS-D ${comp}: prazo em ${prazo}`,
      texto: `${ABERTURA} ${situacao}\n\n${pedido}\n\n${ASSINATURA}`,
    };
  }

  const ano = a.competencia;
  const situacao = emFalta
    ? `A DEFIS ${ano} (declaração anual do Simples Nacional) da sua empresa ainda não consta como entregue, e o prazo foi ${prazo}.`
    : `O prazo da DEFIS ${ano} (declaração anual do Simples Nacional) da sua empresa é ${prazo}.`;
  const pedido = emFalta
    ? `Para entregarmos, precisamos confirmar com você algumas informações do ano de ${ano}. Pode falar com a nossa equipe hoje?`
    : `Para entregarmos a tempo, precisamos confirmar com você algumas informações do ano de ${ano}. Pode falar com a nossa equipe nos próximos dias?`;
  return {
    assunto: emFalta ? `DEFIS ${ano} pendente` : `DEFIS ${ano}: prazo em ${prazo}`,
    texto: `${ABERTURA} ${situacao}\n\n${pedido}\n\n${ASSINATURA}`,
  };
}

/** Envio de documentos a partir da ficha do cliente. */
export const modeloDocumentos = (): ModeloMensagem => ({
  assunto: 'Documentos da sua empresa — Contabilidade Alves',
  texto: `${ABERTURA} Seguem os documentos da sua empresa que separamos para você.\n\n${ASSINATURA}`,
});

export const modeloRelatorioSituacao = (): ModeloMensagem => ({
  assunto: 'Relatório de situação fiscal da sua empresa',
  texto: `${ABERTURA} Segue o relatório de situação fiscal da sua empresa, com o que está em dia, o que está pendente e o que precisa ser feito.\n\nSe quiser conversar sobre algum ponto, é só responder por aqui.\n\n${ASSINATURA}`,
});

export const modeloRelatorioFaturamento = (): ModeloMensagem => ({
  assunto: 'Relatório de faturamento dos últimos 12 meses',
  texto: `${ABERTURA} Segue o relatório de faturamento dos últimos 12 meses da sua empresa, com a assinatura do nosso contador.\n\n${ASSINATURA}`,
});
