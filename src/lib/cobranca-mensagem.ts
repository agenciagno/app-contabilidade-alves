import { format, parseISO } from 'date-fns';

// Chave Pix (CNPJ) da Alves Assessoria — única forma de pagamento citada na cobrança,
// independente de quantos boletos estejam em atraso (decisão de 22/10/2026).
export const PIX_KEY_CNPJ = '26764962000100';
export const PIX_LINHA = `PIX: ${PIX_KEY_CNPJ} (Alves Assessoria - Chave CNPJ)`;
const ASSINATURA = 'José Geraldo Alves - CRC/MG064187';

export const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

/** CNPJ (14 dígitos) ou CPF (11) com máscara; qualquer outra coisa volta como veio. */
export function fmtDocumento(doc: string | null | undefined): string {
  const d = (doc ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc ?? '';
}

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
    `📲 ${PIX_LINHA}`,
    '',
    'Qualquer dúvida, estamos à disposição.',
    ASSINATURA,
  ];
  return linhas.join('\n');
}
