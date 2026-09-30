// Leitura do PDF do Relatório de Situação Fiscal (SITFIS.RELATORIOSITFIS92). Regra fixa de texto, sem IA (decisão de 30/09/2026).
// Validado só com o relatório de EXEMPLO do trial (caso "sem pendências"). Ainda não vimos um relatório real com pendências:
// por isso a leitura é conservadora. Só diz "sem pendências" quando o texto traz a frase oficial e o fim do relatório;
// só diz "com pendências" quando acha títulos "Pendência - ..."; qualquer outra coisa vira "nao_lido" e a tela manda abrir o PDF.
// Nunca inventa: campo que não for lido fica null.

export interface RelatorioSitfis {
  resultado: "sem_pendencias" | "com_pendencias" | "nao_lido";
  categorias: string[]; // títulos das pendências, ex.: "Débito (SIEF)"
  certidao: { tipo: string; emissao: string | null; validade: string | null } | null; // datas em AAAA-MM-DD
  avisos: string[];
  confiavel: boolean;
}

/** "10/09/2026" → "2026-09-10"; placeholders como "99/99/9999" e datas impossíveis viram null. */
const dataISO = (s: string | undefined): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? "");
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, mes - 1, d));
  return a >= 2000 && a <= 2100 && dt.getUTCFullYear() === a && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export function lerRelatorioSitfis(texto: string): RelatorioSitfis {
  const t = texto.replace(/\r/g, "");
  const avisos: string[] = [];
  const temFim = /Final do Relat[óo]rio/i.test(t);
  // O relatório tem duas áreas (Receita e PGFN). "Sem pendências" só vale quando as duas foram declaradas limpas: numa frase única
  // ("...da Receita Federal e da Procuradoria-Geral da Fazenda Nacional") ou em uma frase para cada área.
  const frases = [...t.matchAll(/N[ãa]o foram detectadas pend[eê]ncias[^.]*\./gi)].map((m) => m[0]);
  const limpo = frases.some((f) => /Receita Federal/i.test(f)) && frases.some((f) => /Procuradoria|PGFN/i.test(f));
  const temDiagnostico = /Diagn[óo]stico Fiscal/i.test(t);

  // Títulos de pendência: "Pendência - Débito (SIEF)", com ou sem traços de sublinhado em volta.
  const categorias: string[] = [];
  for (const m of t.matchAll(/^[\s_]*Pend[eê]ncia\s*[-–]\s*(.+?)[\s_]*$/gim)) {
    const nome = m[1].replace(/\s+/g, " ").trim();
    if (nome && !categorias.includes(nome)) categorias.push(nome);
  }
  const mencionaPendencia = /Pend[eê]ncia/i.test(frases.reduce((txt, f) => txt.replace(f, ""), t));

  let resultado: RelatorioSitfis["resultado"] = "nao_lido";
  if (!temDiagnostico) avisos.push("não achei o diagnóstico fiscal");
  if (!temFim) avisos.push("não achei o final do relatório");
  if (temDiagnostico && temFim) {
    if (categorias.length) resultado = "com_pendencias";
    else if (mencionaPendencia) { resultado = "com_pendencias"; avisos.push("há pendências, mas não reconheci os títulos: abra o PDF"); }
    else if (limpo) resultado = "sem_pendencias";
    else avisos.push(frases.length ? "só uma das áreas (Receita ou PGFN) veio sem pendência: abra o PDF" : "não reconheci o diagnóstico: abra o PDF");
  }

  // Última certidão emitida (só quando as datas são reais).
  let certidao: RelatorioSitfis["certidao"] = null;
  const c = /Certid[ãa]o\s+(Negativa|Positiva(?:\s+com\s+Efeitos\s+de\s+Negativa)?|Positiva)\s*:\s*\S+\s+Emiss[ãa]o:\s*(\S+)\s+Data de Validade:\s*(\S+)/i.exec(t);
  if (c) {
    const emissao = dataISO(c[2]), validade = dataISO(c[3]);
    if (emissao || validade) certidao = { tipo: c[1].replace(/\s+/g, " "), emissao, validade };
  }

  // Qualquer aviso (título não reconhecido, só uma área limpa...) tira a confiança: a tela manda abrir o PDF.
  return { resultado, categorias, certidao, avisos, confiavel: resultado !== "nao_lido" && avisos.length === 0 };
}
