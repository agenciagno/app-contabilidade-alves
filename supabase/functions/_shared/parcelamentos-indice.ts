// Parcelamentos do Simples Nacional no Integra Contador: quatro modalidades com o MESMO desenho de serviços (formato confirmado no trial, 30/09/2026).
//   PEDIDOSPARC1x3   → { parcelamentos: [{ numero, dataDoPedido: 20160211, situacao, dataDaSituacao }] }
//   PARCELASPARAGERAR1x2 → { listaParcelas: [{ parcela: 202304, valor: 441.83 }] }   (parcelas em aberto: atrasadas e a do mês; RELP-SN manda "parcela" como texto)
//   GERARDAS1x1 (Emitir) com { parcelaParaEmitir: 202304 } → { docArrecadacaoPdfB64 }
import { pega } from "./pgdasd-indice.ts";

export type Modalidade = "PARCSN" | "PARCSN-ESP" | "PERTSN" | "RELPSN";

export const MODALIDADES: { mod: Modalidade; sistema: string; pedidos: string; parcelas: string; das: string; rotulo: string }[] = [
  { mod: "PARCSN", sistema: "PARCSN", pedidos: "PEDIDOSPARC163", parcelas: "PARCELASPARAGERAR162", das: "GERARDAS161", rotulo: "Parcelamento ordinário" },
  { mod: "PARCSN-ESP", sistema: "PARCSN-ESP", pedidos: "PEDIDOSPARC173", parcelas: "PARCELASPARAGERAR172", das: "GERARDAS171", rotulo: "Parcelamento especial" },
  { mod: "PERTSN", sistema: "PERTSN", pedidos: "PEDIDOSPARC183", parcelas: "PARCELASPARAGERAR182", das: "GERARDAS181", rotulo: "PERT-SN" },
  { mod: "RELPSN", sistema: "RELPSN", pedidos: "PEDIDOSPARC193", parcelas: "PARCELASPARAGERAR192", das: "GERARDAS191", rotulo: "RELP-SN" },
];

export interface PedidoParc { numero: number; data_pedido: string | null; situacao: string | null; data_situacao: string | null; ativo: boolean }
export interface ParcelaAberta { parcela: number; valor: number | null }

/** 20160211 → "2016-02-11" (datas impossíveis viram null). */
function dataAAAAMMDD(v: unknown): string | null {
  const s = String(v ?? "");
  if (!/^\d{8}$/.test(s)) return null;
  const a = Number(s.slice(0, 4)), m = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  const dt = new Date(Date.UTC(a, m - 1, d));
  return a >= 1990 && dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

function comoObjeto(dados: unknown): any {
  if (typeof dados === "string") { try { return JSON.parse(dados); } catch { return null; } }
  return dados;
}

export function lerPedidos(dados: unknown): PedidoParc[] {
  const raiz = comoObjeto(dados);
  const lista = pega(raiz, "parcelamentos");
  if (!Array.isArray(lista)) return [];
  const out: PedidoParc[] = [];
  for (const p of lista) {
    const numero = Number(pega(p, "numero"));
    if (!Number.isInteger(numero)) continue;
    const situacao = String(pega(p, "situacao") ?? "").trim() || null;
    // "Em parcelamento" é a única situação que conta como ativa; qualquer outra (encerrado, rescindido, liquidado...) não gera parcela.
    out.push({ numero, data_pedido: dataAAAAMMDD(pega(p, "dataDoPedido")), situacao, data_situacao: dataAAAAMMDD(pega(p, "dataDaSituacao")), ativo: /^\s*em parcelamento\s*$/i.test(situacao ?? "") });
  }
  return out;
}

export function lerParcelasAbertas(dados: unknown): ParcelaAberta[] {
  const raiz = comoObjeto(dados);
  const lista = pega(raiz, "listaParcelas");
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<number>();
  const out: ParcelaAberta[] = [];
  for (const p of lista) {
    const parcela = Number(pega(p, "parcela"));
    if (!/^\d{6}$/.test(String(parcela)) || vistas.has(parcela)) continue;
    const mes = parcela % 100;
    if (mes < 1 || mes > 12) continue;
    vistas.add(parcela);
    const v = Number(pega(p, "valor"));
    out.push({ parcela, valor: Number.isFinite(v) ? v : null });
  }
  return out.sort((a, b) => a.parcela - b.parcela);
}
