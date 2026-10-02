// Leitura do PDF "Declaração" do PGDAS-D (Serpro Integra Contador, serviços CONSULTIMADECREC14 / CONSDECREC15).
// Regra fixa de texto, sem IA (decisão de 30/09/2026: cláusula de transferência internacional de dados).
// Entrada: o texto do PDF (extraído no servidor com `npm:unpdf`). Saída: campos estruturados + avisos.
// Nunca inventa número: campo que não for lido fica null e entra em `avisos`; se a conferência de consistência falhar,
// `confiavel` = false e a tela mostra "não consegui ler" (o PDF original continua guardado).
// Validado só com a declaração de EXEMPLO da documentação (dados simulados). Confirmar com uma declaração real antes de ligar.

export interface Triplo { interno: number; externo: number; total: number }
export interface MesValor { mes: string; valor: number } // mes = AAAA-MM
export interface Tributos { irpj: number; csll: number; cofins: number; pis: number; cpp: number; icms: number; ipi: number; iss: number; total: number }

/** Uma atividade da seção 2.7 ("Valor do Débito por Tributo para a Atividade"): o que foi vendido/prestado, a receita e o tributo de cada uma. */
export interface Atividade {
  descricao: string; // texto da Receita, normalizado
  tipo: "revenda" | "industrializacao" | "servico" | "outro";
  receita: number;
  tributos: Tributos;
  /** Só para revenda/industrialização: true = com substituição tributária/monofásico/antecipação (ICMS não sai no DAS); false = sem; null = não deu para dizer. */
  st_ou_monofasico: boolean | null;
  /** Só para serviço: true = ISS retido/substituído (ISS não sai no DAS); false = sem retenção; null = não deu para dizer. */
  iss_retido: boolean | null;
}

export interface DeclaracaoPgdasd {
  tipo: "original" | "retificadora" | null;
  periodo_apuracao: string | null; // AAAA-MM
  cnpj_matriz: string | null;
  optante: boolean | null;
  regime: "competencia" | "caixa" | null;
  numero_declaracao: string | null;
  rpa: Triplo | null; // Receita Bruta do PA
  rbt12: Triplo | null; // acumulada nos 12 meses anteriores
  rba: Triplo | null; // acumulada no ano-calendário
  rbaa: Triplo | null; // acumulada no ano-calendário anterior
  limite: { interno: number; total: number } | null;
  historico_interno: MesValor[]; // "Receitas Brutas Anteriores", mercado interno, mês a mês
  historico_externo: MesValor[];
  folha: MesValor[]; // "Folha de Salários Anteriores" ([] = "Nenhuma")
  fator_r_aplica: boolean | null;
  fator_r_texto: string | null; // texto como veio ("Não se aplica" ou o valor); converter só depois de ver uma declaração real
  debito_declarado: Tributos | null; // Total Geral da Empresa, exigível + suspenso
  atividades: Atividade[]; // seção 2.7, todas as atividades de todos os estabelecimentos ([] = não li)
  municipio: string | null;
  uf: string | null;
  sublimite: number | null;
  impedido_icms_iss: boolean | null;
  transmissao: string | null; // ISO, horário de Brasília
  numero_recibo: string | null;
  avisos: string[];
  confiavel: boolean;
}

/** "1.234,56" → 1234.56 */
export function brl(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}
const NUM = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;
const reTriplo = new RegExp(String.raw`${NUM}\s+${NUM}\s+${NUM}`);

function triplo(m: RegExpMatchArray | null): Triplo | null {
  return m ? { interno: brl(m[1]), externo: brl(m[2]), total: brl(m[3]) } : null;
}

function mesesValores(trecho: string): MesValor[] {
  const out: MesValor[] = [];
  for (const m of trecho.matchAll(new RegExp(String.raw`(\d{2})/(\d{4})\s+${NUM}`, "g"))) out.push({ mes: `${m[2]}-${m[1]}`, valor: brl(m[3]) });
  return out;
}

function entre(texto: string, ini: RegExp, fim: RegExp): string {
  const i = texto.search(ini);
  if (i < 0) return "";
  const resto = texto.slice(i);
  const j = resto.slice(1).search(fim);
  return j < 0 ? resto : resto.slice(0, j + 1);
}

/** Seção 2.7: um bloco por atividade (descrição, "Receita Bruta Informada" e a linha de 9 valores IRPJ…Total). */
function lerAtividades(t: string): Atividade[] {
  const re = new RegExp(
    String.raw`Valor do Débito por Tributo para a Atividade \(R\$\):\s*([\s\S]*?)Receita Bruta Informada:\s*R\$\s*${NUM}[\s\S]*?IRPJ[^\n]*\n\s*((?:${NUM}\s+){8}${NUM})`,
    "g",
  );
  const out: Atividade[] = [];
  for (const m of t.matchAll(re)) {
    const descricao = m[1]
      .split("\n").filter((l) => !/^\s*(Número da Declaração:|Autenticação:)/.test(l)).join(" ")
      .replace(/\s+/g, " ").trim();
    const v = [...m[3].matchAll(new RegExp(NUM, "g"))].map((x) => brl(x[1]));
    const tipo: Atividade["tipo"] = /^revenda de mercadorias/i.test(descricao) ? "revenda"
      : /^venda de mercadorias industrializadas/i.test(descricao) ? "industrializacao"
      : /^presta[cç][aã]o de servi[cç]os/i.test(descricao) ? "servico" : "outro";
    const mercadoria = tipo === "revenda" || tipo === "industrializacao";
    out.push({
      descricao, tipo, receita: brl(m[2]),
      tributos: { irpj: v[0], csll: v[1], cofins: v[2], pis: v[3], cpp: v[4], icms: v[5], ipi: v[6], iss: v[7], total: v[8] },
      st_ou_monofasico: mercadoria ? (/\bcom\s+substitui[cç][aã]o\s+tribut[aá]ria/i.test(descricao) ? true : /\bsem\s+substitui[cç][aã]o\s+tribut[aá]ria/i.test(descricao) ? false : null) : null,
      iss_retido: tipo === "servico" ? (/\bcom\s+reten[cç][aã]o/i.test(descricao) ? true : /\bsem\s+reten[cç][aã]o/i.test(descricao) ? false : null) : null,
    });
  }
  return out;
}

export function lerDeclaracaoPgdasd(texto: string): DeclaracaoPgdasd {
  const t = texto.replace(/\r/g, "");
  const avisos: string[] = [];
  const pega = <T>(nome: string, valor: T | null | undefined): T | null => {
    if (valor === null || valor === undefined) { avisos.push(`não li: ${nome}`); return null; }
    return valor;
  };

  const tipoM = /Declaração\s+(Original|Retificadora)/i.exec(t);
  const paM = /Período de Apuração:\s*\d{2}\/(\d{2})\/(\d{4})\s+a\s+\d{2}\/\d{2}\/\d{4}/i.exec(t);
  const cnpjM = /CNPJ Matriz:\s*([\d./-]{14,18})/i.exec(t);
  const optM = /Optante pelo Simples Nacional:\s*(Sim|Não)/i.exec(t);
  const regM = /Regime de Apuração:\s*(Competência|Caixa)/i.exec(t);
  const numM = /Nº da Declaração:\s*(\d{17})/i.exec(t);

  // 2.1 Discriminativo de Receitas: os valores vêm depois do rótulo (que pode quebrar em 2 linhas).
  const bloco21 = entre(t, /2\.1\s*Discriminativo de Receitas/i, /2\.2\)/);
  const rpa = triplo(new RegExp(String.raw`\(RPA\)[^\n]*?\s${NUM}\s+${NUM}\s+${NUM}`).exec(bloco21));
  const rbt12 = triplo(new RegExp(String.raw`\(RBT12\)\s+${NUM}\s+${NUM}\s+${NUM}`).exec(bloco21));
  const rba = triplo(new RegExp(String.raw`\(RBA\)\s+${NUM}\s+${NUM}\s+${NUM}`).exec(bloco21));
  const rbaa = triplo(new RegExp(String.raw`\(RBAA\)\s+${NUM}\s+${NUM}\s+${NUM}`).exec(bloco21));
  const limM = new RegExp(String.raw`Limite de receita bruta proporcionalizado\s+${NUM}\s+${NUM}`, "i").exec(bloco21);

  const interno = mesesValores(entre(t, /2\.2\.1\)\s*Mercado Interno/i, /2\.2\.2\)/));
  const externo = mesesValores(entre(t, /2\.2\.2\)\s*Mercado Externo/i, /2\.3\)/));
  const blocoFolha = entre(t, /2\.3\)\s*Folha de Sal[aá]rios/i, /2\.4\)/);
  const folha = /Nenhuma/i.test(blocoFolha) ? [] : mesesValores(blocoFolha);
  const fatorM = /Fator r\s*=\s*([^\n]+)/i.exec(t);

  const blocoGeral = entre(t, /2\.8\)\s*Total Geral da Empresa/i, /\n\s*3\.\s*Informa/);
  const linhaTrib = new RegExp(String.raw`(?:${NUM}\s+){8}${NUM}`).exec(blocoGeral);
  let debito: Tributos | null = null;
  if (linhaTrib) {
    const v = [...linhaTrib[0].matchAll(new RegExp(NUM, "g"))].map((m) => brl(m[1]));
    debito = { irpj: v[0], csll: v[1], cofins: v[2], pis: v[3], cpp: v[4], icms: v[5], ipi: v[6], iss: v[7], total: v[8] };
  }

  const munM = /Município:\s*(.+?)\s+UF:\s*([A-Z]{2})/.exec(t);
  const subM = new RegExp(String.raw`Sublimite de Receita Anual \(R\$\):\s*${NUM}`, "i").exec(t);
  const impM = /Impedido de recolher ICMS\/ISS no DAS:\s*(Sim|Não)/i.exec(t);
  const trM = /Data e hor[aá]rio da transmiss[aã]o da Declara[cç][aã]o:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/i.exec(t);
  const recM = [...t.matchAll(/N[uú]mero do Recibo:\s*(\d{2}\.\d{2}\.\d{5}\.\d{7}-\s*\d)/g)].pop();

  const d: DeclaracaoPgdasd = {
    tipo: pega("tipo da declaração", tipoM ? (tipoM[1].toLowerCase() as "original" | "retificadora") : null),
    periodo_apuracao: pega("período de apuração", paM ? `${paM[2]}-${paM[1]}` : null),
    cnpj_matriz: pega("CNPJ matriz", cnpjM ? cnpjM[1] : null),
    optante: pega("optante", optM ? optM[1].toLowerCase() === "sim" : null),
    regime: pega("regime de apuração", regM ? (regM[1].toLowerCase().startsWith("caixa") ? "caixa" : "competencia") : null),
    numero_declaracao: pega("número da declaração", numM ? numM[1] : null),
    rpa: pega("RPA", rpa),
    rbt12: pega("RBT12", rbt12),
    rba: pega("RBA", rba),
    rbaa: pega("RBAA", rbaa),
    limite: pega("limite de receita", limM ? { interno: brl(limM[1]), total: brl(limM[2]) } : null),
    historico_interno: interno,
    historico_externo: externo,
    folha,
    fator_r_aplica: fatorM ? !/n[aã]o se aplica/i.test(fatorM[1]) : null,
    fator_r_texto: fatorM ? fatorM[1].trim() : null,
    debito_declarado: pega("débito declarado", debito),
    atividades: lerAtividades(t),
    municipio: munM ? munM[1].trim() : null,
    uf: munM ? munM[2] : null,
    sublimite: subM ? brl(subM[1]) : null,
    impedido_icms_iss: impM ? impM[1].toLowerCase() === "sim" : null,
    transmissao: trM ? `${trM[3]}-${trM[2]}-${trM[1]}T${trM[4]}:${trM[5]}:${trM[6]}-03:00` : null,
    numero_recibo: recM ? recM[1].replace(/\s+/g, "") : null,
    avisos,
    confiavel: true,
  };
  if (!d.fator_r_texto) avisos.push("não li: fator r");
  if (!interno.length) avisos.push("não li: receitas brutas anteriores (mercado interno)");

  // Conferências de consistência: se não fecham, o dado não é confiável e a tela avisa.
  const tol = 0.011;
  for (const [nome, v] of [["RPA", d.rpa], ["RBT12", d.rbt12], ["RBA", d.rba], ["RBAA", d.rbaa]] as const) {
    if (v && Math.abs(v.interno + v.externo - v.total) > tol) avisos.push(`${nome}: interno + externo não fecha com o total`);
  }
  if (d.rbt12 && d.periodo_apuracao && interno.length) {
    // RBT12 = soma dos 12 meses anteriores ao PA (interno + externo). Só confere quando o histórico cobre os 12 meses.
    const [a, m] = d.periodo_apuracao.split("-").map(Number);
    const janela: string[] = [];
    for (let i = 12; i >= 1; i--) { const dt = new Date(a, m - 1 - i, 1); janela.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`); }
    const mapa = (l: MesValor[]) => new Map(l.map((x) => [x.mes, x.valor]));
    const mi = mapa(interno), me = mapa(externo);
    if (janela.every((k) => mi.has(k))) {
      const soma = janela.reduce((s, k) => s + (mi.get(k) ?? 0) + (me.get(k) ?? 0), 0);
      if (Math.abs(soma - d.rbt12.total) > 0.05) avisos.push(`RBT12 (${d.rbt12.total}) não bate com a soma dos 12 meses anteriores (${soma.toFixed(2)})`);
    } else avisos.push("histórico não cobre os 12 meses anteriores: RBT12 não conferido");
  }
  if (d.periodo_apuracao && interno.length) {
    // Declaração real (30/09/2026): o histórico traz o ano anterior inteiro + o ano corrente até o mês anterior ao PA (19 meses em agosto).
    // RBA = meses do ano corrente anteriores ao PA + RPA; RBAA = os 12 meses do ano anterior. Só confere quando o histórico cobre o trecho todo.
    const [a, m] = d.periodo_apuracao.split("-").map(Number);
    const mi = new Map(interno.map((x) => [x.mes, x.valor])), me = new Map(externo.map((x) => [x.mes, x.valor]));
    const chave = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;
    const somaMeses = (ks: string[]) => (ks.every((k) => mi.has(k)) ? ks.reduce((s, k) => s + (mi.get(k) ?? 0) + (me.get(k) ?? 0), 0) : null);
    if (d.rba && d.rpa) {
      const soma = somaMeses(Array.from({ length: m - 1 }, (_, i) => chave(a, i + 1)));
      if (soma !== null && Math.abs(soma + d.rpa.total - d.rba.total) > 0.05) avisos.push(`RBA (${d.rba.total}) não bate com os meses do ano mais a receita do período (${(soma + d.rpa.total).toFixed(2)})`);
    }
    if (d.rbaa) {
      const soma = somaMeses(Array.from({ length: 12 }, (_, i) => chave(a - 1, i + 1)));
      if (soma !== null && Math.abs(soma - d.rbaa.total) > 0.05) avisos.push(`RBAA (${d.rbaa.total}) não bate com a soma do ano anterior (${soma.toFixed(2)})`);
    }
  }
  if (d.debito_declarado) {
    const b = d.debito_declarado;
    const soma = b.irpj + b.csll + b.cofins + b.pis + b.cpp + b.icms + b.ipi + b.iss;
    if (Math.abs(soma - b.total) > 0.05) avisos.push("tributos não fecham com o total do débito declarado");
  }
  if (!d.atividades.length) avisos.push("não li: atividades (seção 2.7)");
  else if (d.debito_declarado) {
    const soma = d.atividades.reduce((x, a) => x + a.tributos.total, 0);
    if (Math.abs(soma - d.debito_declarado.total) > 0.05) avisos.push(`atividades divergem do total do débito declarado (${soma.toFixed(2)} x ${d.debito_declarado.total.toFixed(2)})`);
  }
  // Campos essenciais para faturamento/sublimite: sem eles, não é confiável.
  d.confiavel = !!(d.periodo_apuracao && d.rpa && d.rbt12 && d.numero_declaracao) && !avisos.some((a) => /não fecha|não bate/.test(a));
  return d;
}
