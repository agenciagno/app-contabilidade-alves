// DARF atualizado (SICALC.CONSOLIDARGERARDARF51 / GERARDARFCODBARRA53, versão 2.9). Formatos da documentação + trial (30/09/2026):
//   entrada  dados = { codigoReceita, codigoReceitaExtensao, tipoPA, dataPA, vencimento, valorImposto, dataConsolidacao, [numeroReferencia], [observacao] }
//            dataPA: ME "mm/aaaa" · TR "tt/aaaa" (01 a 04) · AN "aaaa"; datas em ISO "AAAA-MM-DDT00:00:00"
//   saída    { consolidado: { valorPrincipalMoedaCorrente, valorTotalConsolidado, valorMultaMora, percentualMultaMora, valorJuros, percentualJuros,
//              termoInicialJuros, dataArrecadacaoConsolidacao, dataValidadeCalculo }, darf: <pdf base64>, numeroDocumento }
//            o código de barras vem em { codigoDeBarras: { campo1ComDV..campo4ComDV, codigo44 } }
import { pega } from "./pgdasd-indice.ts";

export interface EntradaDarf {
  codigo_receita: string;
  extensao: string;
  tipo_pa: "AN" | "TR" | "ME";
  data_pa: string;
  vencimento: string; // AAAA-MM-DD
  valor_imposto: number;
  data_consolidacao: string; // AAAA-MM-DD
  numero_referencia: string | null;
  observacao: string | null;
}

const dataValida = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return dt.getUTCFullYear() === Number(m[1]) && dt.getUTCMonth() === Number(m[2]) - 1 && dt.getUTCDate() === Number(m[3]);
};

/** Valida o que a equipe digitou antes de gastar uma emissão. `hoje` = AAAA-MM-DD (Brasília). Devolve a entrada limpa ou uma mensagem de erro. */
export function validarEntradaDarf(p: any, hoje: string): { entrada: EntradaDarf } | { erro: string } {
  const receita = String(p?.receita ?? "").trim();
  const extensao = String(p?.extensao ?? "01").trim() || "01";
  const tipo = String(p?.tipo_pa ?? "");
  const dataPa = String(p?.data_pa ?? "").trim();
  const venc = String(p?.vencimento ?? "").trim();
  const cons = String(p?.data_consolidacao ?? "").trim();
  const valor = Number(String(p?.valor_imposto ?? "").replace(",", "."));

  if (!/^\d{4}$/.test(receita)) return { erro: "O código da receita tem 4 dígitos (ex.: 2089)." };
  if (!/^\d{2}$/.test(extensao)) return { erro: "A extensão da receita tem 2 dígitos (ex.: 01)." };
  if (!["AN", "TR", "ME"].includes(tipo)) return { erro: "Tipo do período inválido (mensal, trimestral ou anual)." };
  const formato = tipo === "ME" ? /^(0[1-9]|1[0-2])\/\d{4}$/ : tipo === "TR" ? /^0[1-4]\/\d{4}$/ : /^\d{4}$/;
  if (!formato.test(dataPa)) return { erro: tipo === "ME" ? "Período mensal no formato mm/aaaa." : tipo === "TR" ? "Período trimestral no formato tt/aaaa, com o trimestre de 01 a 04." : "Período anual no formato aaaa." };
  if (!dataValida(venc)) return { erro: "Informe a data de vencimento original do tributo." };
  if (!dataValida(cons)) return { erro: "Informe a data prevista do pagamento." };
  if (cons < hoje) return { erro: "A data do pagamento não pode ser anterior a hoje." };
  const dia = new Date(`${cons}T00:00:00Z`).getUTCDay();
  if (dia === 0 || dia === 6) return { erro: "A data do pagamento cai em fim de semana. Use um dia útil: a Receita pode recusar o cálculo." };
  if (!Number.isFinite(valor) || valor <= 0 || valor > 999_999_999) return { erro: "Informe o valor do imposto (maior que zero)." };
  const ref = String(p?.numero_referencia ?? "").trim();
  const obs = String(p?.observacao ?? "").trim();
  if (ref.length > 30) return { erro: "Número de referência longo demais." };
  if (obs.length > 100) return { erro: "Observação longa demais (até 100 caracteres)." };
  return { entrada: { codigo_receita: receita, extensao, tipo_pa: tipo as EntradaDarf["tipo_pa"], data_pa: dataPa, vencimento: venc, valor_imposto: Math.round(valor * 100) / 100, data_consolidacao: cons, numero_referencia: ref || null, observacao: obs || null } };
}

export function dadosParaSerpro(e: EntradaDarf): Record<string, string> {
  const d: Record<string, string> = {
    codigoReceita: e.codigo_receita, codigoReceitaExtensao: e.extensao, tipoPA: e.tipo_pa, dataPA: e.data_pa,
    vencimento: `${e.vencimento}T00:00:00`, valorImposto: e.valor_imposto.toFixed(2), dataConsolidacao: `${e.data_consolidacao}T00:00:00`,
  };
  if (e.numero_referencia) d.numeroReferencia = e.numero_referencia;
  if (e.observacao) d.observacao = e.observacao;
  return d;
}

const num = (v: unknown): number | null => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
const dia = (v: unknown): string | null => { const s = String(v ?? "").slice(0, 10); return dataValida(s) ? s : null; };

export interface Consolidado {
  valor_principal: number | null; valor_multa: number | null; percentual_multa: number | null;
  valor_juros: number | null; percentual_juros: number | null; valor_total: number | null; valido_ate: string | null;
}

export function lerConsolidado(dados: unknown): Consolidado | null {
  let raiz: any = dados;
  if (typeof raiz === "string") { try { raiz = JSON.parse(raiz); } catch { return null; } }
  const c = pega(raiz, "consolidado");
  if (!c || typeof c !== "object") return null;
  return {
    valor_principal: num(pega(c, "valorPrincipalMoedaCorrente")), valor_multa: num(pega(c, "valorMultaMora")), percentual_multa: num(pega(c, "percentualMultaMora")),
    valor_juros: num(pega(c, "valorJuros")), percentual_juros: num(pega(c, "percentualJuros")), valor_total: num(pega(c, "valorTotalConsolidado")),
    valido_ate: dia(pega(c, "dataValidadeCalculo")),
  };
}

export function lerCodigoBarras(dados: unknown): string | null {
  let raiz: any = dados;
  if (typeof raiz === "string") { try { raiz = JSON.parse(raiz); } catch { return null; } }
  const cb = pega(raiz, "codigoDeBarras");
  const c44 = String(pega(cb, "codigo44") ?? "").replace(/\D/g, "");
  return c44.length === 44 ? c44 : null;
}
