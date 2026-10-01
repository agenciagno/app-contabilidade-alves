/** Hoje em horário de Brasília (AAAA-MM-DD). */
export const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Dias entre duas datas AAAA-MM-DD (positivo quando `ate` é depois de `de`). */
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/**
 * Feriados nacionais de 2026 e 2027: espelho da tabela `national_holidays` do banco, que é o que o servidor usa (função serpro_vencimento_mensal).
 * Ao cadastrar 2028 na tabela, acrescente aqui também.
 */
const FERIADOS_NACIONAIS = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-03-01', '2027-03-02', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27', '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
]);

/**
 * Vencimento do PGDAS-D e do DAS do período `pa` (AAAA-MM): dia 20 do mês seguinte, passando ao próximo dia útil quando cai em sábado, domingo ou feriado nacional.
 * Confere com o vencimento que o Pagamentos traz (ex.: 20/09/2026 caiu no domingo, venceu 21/09; 20/11/2026 é feriado, o prazo vai a 23/11).
 */
export function vencimentoDoPeriodo(pa: string): string {
  const ano = Number(pa.slice(0, 4));
  const mes = Number(pa.slice(5, 7));
  const d = new Date(Date.UTC(ano, mes, 20)); // mês seguinte ao período (mes é 1..12, o índice do JS já é o mês seguinte)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || FERIADOS_NACIONAIS.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Número de documento sem zeros à esquerda: o PGDAS devolve "07202624555771590" e o Pagamentos "7202624555771590" para o mesmo DAS. */
export const semZeros = (numero: string | null | undefined) => String(numero ?? '').replace(/^0+/, '');
