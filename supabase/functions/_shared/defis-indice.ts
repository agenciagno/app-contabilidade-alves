// Leitura do índice de declarações da DEFIS (DEFIS.CONSDECLARACAO142). Formato confirmado no trial (30/09/2026):
// dados = lista de { anoCalendario: 2019, idDefis: "000000002019001", tipo: 1, dataHora: "20230725102410" }.
// tipo: 1 original normal · 2 retificadora normal · 3 original de situação especial · 4 retificadora de situação especial.
import { dataHoraBR, pega } from "./pgdasd-indice.ts";

export interface DefisIndice {
  ano_calendario: number;
  id_defis: string;
  tipo: 1 | 2 | 3 | 4;
  transmitida_em: string | null; // ISO, horário de Brasília
}

export function lerIndiceDefis(dados: unknown): DefisIndice[] {
  let raiz: any = dados;
  if (typeof raiz === "string") { try { raiz = JSON.parse(raiz); } catch { raiz = null; } }
  const lista: any[] = Array.isArray(raiz) ? raiz : Array.isArray(pega(raiz, "declaracoes")) ? pega(raiz, "declaracoes") : [];
  const out: DefisIndice[] = [];
  for (const d of lista) {
    const ano = Number(pega(d, "anoCalendario"));
    const id = String(pega(d, "idDefis") ?? "").trim();
    const tipo = Number(pega(d, "tipo"));
    if (!Number.isInteger(ano) || !id || ![1, 2, 3, 4].includes(tipo)) continue;
    out.push({ ano_calendario: ano, id_defis: id, tipo: tipo as 1 | 2 | 3 | 4, transmitida_em: dataHoraBR(pega(d, "dataHora")) });
  }
  return out;
}
