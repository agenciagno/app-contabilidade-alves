import { format, parseISO } from 'date-fns';

// Chave Pix (CNPJ) da Alves Assessoria — usada na mensagem geral, quando não faz sentido
// mandar a linha "copia e cola" de um boleto específico (2+ boletos selecionados).
export const PIX_KEY_CNPJ = '26764962000100';
const ASSINATURA = 'José Geraldo Alves - CRC/MG064187';

export const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export const fmtDateCobranca = (s: string) => format(parseISO(s), 'dd/MM/yyyy');

export interface MensagemBoletoInput {
  valor_atualizado: number;
  data_vencimento: string;
  url_qrcode: string | null;
}

/** Monta a mensagem de cobrança — modelo individual (1 boleto) ou geral (2+ boletos,
 * seja de um cliente só com vários boletos em aberto ou de vários clientes juntos). */
export function buildCobrancaMensagem(boletos: MensagemBoletoInput[]): string {
  if (boletos.length === 0) return '';
  const unico = boletos.length === 1;
  const datas = Array.from(new Set(boletos.map((b) => fmtDateCobranca(b.data_vencimento))));
  const totalValor = boletos.reduce((s, b) => s + b.valor_atualizado, 0);

  const linhas: string[] = [
    `Olá! Nosso Setor Financeiro não identificou o pagamento ${unico ? 'do seguinte boleto' : 'dos seguintes boletos'}, referente a Honorário Contábil.`,
    '',
    `🗓️ Vencimento: ${datas.join(' e ')}`,
    unico ? `💰Valor: ${fmtBRL(totalValor)}` : `💰Valor: ${boletos.length} boletos, totalizando: ${fmtBRL(totalValor)}`,
    '',
    unico && boletos[0].url_qrcode
      ? `📲 Pix copia e cola: ${boletos[0].url_qrcode}`
      : `📲 PIX: ${PIX_KEY_CNPJ} (Alves Assessoria - Chave CNPJ)`,
    '',
    'Qualquer dúvida, estamos à disposição.',
    ASSINATURA,
  ];
  return linhas.join('\n');
}
