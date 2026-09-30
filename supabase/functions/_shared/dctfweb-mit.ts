// DCTFWeb e MIT no Integra Contador (formatos da documentação + trial, 30/09/2026).
//   DCTFWEB.CONSRECIBO32  dados { categoria: 40 (GERAL_MENSAL), anoPA, mesPA } → 200 { PDFByteArrayBase64 } (recibo da declaração mais recente);
//                         mensagem "MG08 - Não foi encontrada Declaração com os dados informados" = nada transmitido para o período.
//   MIT.LISTAAPURACOES317 dados { anoApuracao } → { Apuracoes: [{ periodoApuracao: 202501, idApuracao, situacao: 3, dataEncerramento: "20250320",
//                         eventoEspecial, valorTotalApurado }] }. situacao 3 aparece nos exemplos como apuração encerrada; a documentação não traz a tabela.
import { pega } from "./pgdasd-indice.ts";

export interface ApuracaoMit {
  periodo: string; // AAAA-MM-01
  id_apuracao: number;
  situacao: number | null;
  data_encerramento: string | null; // AAAA-MM-DD
  evento_especial: boolean;
  valor_total: number | null;
}

const dia = (v: unknown): string | null => {
  const s = String(v ?? "");
  if (!/^\d{8}$/.test(s)) return null;
  const dt = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
  return dt.getUTCFullYear() === Number(s.slice(0, 4)) && dt.getUTCMonth() === Number(s.slice(4, 6)) - 1 && dt.getUTCDate() === Number(s.slice(6, 8))
    ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};

export function lerApuracoesMit(dados: unknown): ApuracaoMit[] {
  let raiz: any = dados;
  if (typeof raiz === "string") { try { raiz = JSON.parse(raiz); } catch { return []; } }
  const lista = pega(raiz, "Apuracoes");
  if (!Array.isArray(lista)) return [];
  const out: ApuracaoMit[] = [];
  for (const a of lista) {
    const per = String(pega(a, "periodoApuracao") ?? "");
    const id = Number(pega(a, "idApuracao"));
    if (!/^\d{6}$/.test(per) || !Number.isSafeInteger(id) || Number(per.slice(4)) < 1 || Number(per.slice(4)) > 12) continue;
    const sit = Number(pega(a, "situacao"));
    const v = Number(pega(a, "valorTotalApurado"));
    out.push({
      periodo: `${per.slice(0, 4)}-${per.slice(4, 6)}-01`, id_apuracao: id, situacao: Number.isInteger(sit) ? sit : null,
      data_encerramento: dia(pega(a, "dataEncerramento")), evento_especial: pega(a, "eventoEspecial") === true, valor_total: Number.isFinite(v) ? v : null,
    });
  }
  return out;
}

/** MG08: não há declaração transmitida para o período (vale qualquer status HTTP). */
export function semDeclaracaoDctfweb(resposta: any): boolean {
  const msgs: { codigo?: string; texto?: string }[] = Array.isArray(resposta?.mensagens) ? resposta.mensagens : [];
  return msgs.some((m) => /MG08/i.test(String(m.codigo ?? "")) || /n[aã]o foi encontrada declara[cç][aã]o/i.test(String(m.texto ?? "")));
}

export function pdfDoRecibo(dados: unknown): string | null {
  const b = pega(typeof dados === "string" ? safeJson(dados) : dados, "PDFByteArrayBase64");
  return typeof b === "string" && b.length > 100 ? b : null;
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
