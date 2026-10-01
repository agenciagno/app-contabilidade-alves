/** Hoje em horário de Brasília (AAAA-MM-DD). */
export const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Dias entre duas datas AAAA-MM-DD (positivo quando `ate` é depois de `de`). */
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/**
 * Vencimento do PGDAS-D e do DAS do período `pa` (AAAA-MM): dia 20 do mês seguinte, e segunda-feira quando cai no sábado ou domingo.
 * Feriado nacional não é tratado. Confere com o vencimento que o Pagamentos traz (ex.: 20/09/2026 caiu no domingo, venceu 21/09).
 */
export function vencimentoDoPeriodo(pa: string): string {
  const ano = Number(pa.slice(0, 4));
  const mes = Number(pa.slice(5, 7));
  const d = new Date(Date.UTC(ano, mes, 20)); // mês seguinte ao período (mes é 1..12, o índice do JS já é o mês seguinte)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Número de documento sem zeros à esquerda: o PGDAS devolve "07202624555771590" e o Pagamentos "7202624555771590" para o mesmo DAS. */
export const semZeros = (numero: string | null | undefined) => String(numero ?? '').replace(/^0+/, '');
