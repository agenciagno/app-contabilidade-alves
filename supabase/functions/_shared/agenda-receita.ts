// Planilha oficial da agenda tributária da Receita Federal (ADE Corat do mês): leitura e casamento com o catálogo da CA.
// Fonte: https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/AAAA/<Mês> (link `anexo-ade-corat-no-NN-de-DD-MM-AA.xlsx`).
// Abas: "Tributos" (dia, código de receita, grupo, descrição, período, periodicidade, documento, categoria da declaração, origem, fundamentação)
// e "Declarações" (prazo, interessado, nome, período, base normativa). Módulo puro (sem Deno/XLSX): recebe as linhas como matriz de textos.

export interface ItemAgenda {
  aba: "tributos" | "declaracoes";
  dia: number | null; // null quando a Receita não dá um dia do mês (diária, "até o 2º dia útil…")
  dia_texto: string | null;
  codigo_receita: string | null;
  grupo: string | null;
  descricao: string | null;
  periodo: string | null;
  periodicidade: string | null;
  documento: string | null;
  categoria_declaracao: string | null;
  origem_escrituracao: string | null;
  base_legal: string | null;
  interessado: string | null;
}

export interface MapeamentoAgenda {
  obligation_id: string;
  aba: "tributos" | "declaracoes";
  campo: "grupo" | "descricao" | "codigo_receita";
  padrao: string | null; // regex (sem diferenciar maiúsculas) aplicada ao campo
  codigos: string[] | null; // alternativa ao padrão: lista exata de códigos de receita
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const limpa = (v: unknown): string | null => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t === "" || t === "--" ? null : t;
};
const diaDoMes = (t: string | null): number | null => (t && /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31 ? +t : null);

const CABECALHOS: Record<string, Record<string, keyof ItemAgenda>> = {
  tributos: {
    "dia de vencimento": "dia_texto",
    "codigo de receita": "codigo_receita",
    "grupo de tributo": "grupo",
    "descricao": "descricao",
    "periodo de apuracao": "periodo",
    "periodicidade": "periodicidade",
    "documento de arrecadacao": "documento",
    "categoria da declaracao": "categoria_declaracao",
    "origem escrituracao": "origem_escrituracao",
    "fundamentacao legal": "base_legal",
  },
  declaracoes: {
    "prazo de apresentacao": "dia_texto",
    "interessado": "interessado",
    "declaracoes, demonstrativos e documentos": "descricao",
    "periodo de referencia": "periodo",
    "base normativa": "base_legal",
  },
};

/** Lê as linhas de uma aba (matriz de textos). Acha a linha de cabeçalho sozinha; ignora linhas sem dia/prazo. */
export function itensDeLinhas(aba: "tributos" | "declaracoes", linhas: unknown[][]): ItemAgenda[] {
  const mapa = CABECALHOS[aba];
  const iCab = linhas.findIndex((l) => l.some((c) => semAcento(String(c ?? "")) in mapa));
  if (iCab < 0) return [];
  const colunas = new Map<number, keyof ItemAgenda>();
  linhas[iCab].forEach((c, i) => {
    const k = semAcento(String(c ?? ""));
    if (k in mapa) colunas.set(i, mapa[k]);
  });
  const itens: ItemAgenda[] = [];
  for (const l of linhas.slice(iCab + 1)) {
    const item: ItemAgenda = {
      aba, dia: null, dia_texto: null, codigo_receita: null, grupo: null, descricao: null, periodo: null,
      periodicidade: null, documento: null, categoria_declaracao: null, origem_escrituracao: null, base_legal: null, interessado: null,
    };
    for (const [i, campo] of colunas) (item as unknown as Record<string, unknown>)[campo] = limpa(l[i]);
    if (!item.dia_texto && !item.descricao) continue;
    item.dia = diaDoMes(item.dia_texto);
    itens.push(item);
  }
  return itens;
}

/** Linhas oficiais que correspondem ao mapeamento de uma obrigação (só as que têm dia do mês). */
export function linhasDoMapeamento(m: MapeamentoAgenda, itens: ItemAgenda[]): ItemAgenda[] {
  const re = m.padrao ? new RegExp(m.padrao, "i") : null;
  return itens.filter((i) => {
    if (i.aba !== m.aba || i.dia === null) return false;
    const valor = i[m.campo] as string | null;
    if (valor === null) return false;
    if (m.codigos?.length) return m.codigos.includes(valor.trim());
    return re ? re.test(valor) : false;
  });
}

/** Data oficial (a mais cedo entre as linhas casadas) de uma obrigação no mês; null se a planilha não traz linha. */
export function dataOficial(m: MapeamentoAgenda, itens: ItemAgenda[], ano: number, mes: number): { data: string; linhas: ItemAgenda[] } | null {
  const linhas = linhasDoMapeamento(m, itens);
  if (!linhas.length) return null;
  const dia = Math.min(...linhas.map((l) => l.dia as number));
  return { data: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, linhas };
}

/** A Receita não é consistente no endereço do mês: antes `marco`, `janeiro` (minúsculo, sem cedilha), agora `Outubro` (capitalizado). Tenta todas. */
export function nomesDoMes(mes: number): string[] {
  const nome = MESES_PT[mes - 1];
  const sem = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return [...new Set([nome, sem.toLowerCase(), nome.toLowerCase(), sem])];
}

export const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Dentre os links .xlsx da página do mês, o da ADE de maior número (retificações saem com número maior). */
export function escolherXlsx(html: string, base: string, ano: number): { url: string; titulo: string } | null {
  const links = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => m[1]).filter((u) => u.includes(`/${ano}/`));
  if (!links.length) return null;
  const numero = (u: string) => Number(/no-(\d+)/i.exec(u)?.[1] ?? 0);
  const url = [...new Set(links)].sort((a, b) => numero(b) - numero(a))[0];
  const abs = url.startsWith("http") ? url : new URL(url, base).toString();
  const m = /no-(\d+)-de-(\d{2})-(\d{2})-(\d{2})/i.exec(url);
  return { url: abs, titulo: m ? `ADE Corat nº ${m[1]} de ${m[2]}/${m[3]}/${m[4]}` : "ADE Corat" };
}
