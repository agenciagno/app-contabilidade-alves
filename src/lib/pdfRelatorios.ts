/**
 * PDFs dos relatórios para o cliente (rodada 3): Relatório de Situação Fiscal e Relatório de Faturamento (12 meses).
 * Gera no navegador (jsPDF), sem servidor e sem custo. O Relatório de Faturamento leva a assinatura do contador (nome, CRC, CPF) e, sem o
 * modelo validado, sai com marca d'água "RASCUNHO" (a tela também impede o envio ao cliente).
 * Só caracteres do alfabeto latino (Helvetica padrão do PDF): nada de símbolos especiais.
 */
import type { AcaoPlano, RelatorioFaturamento, Score } from '@/lib/relatoriosCliente';
import { ROTULO_PRIORIDADE } from '@/lib/relatoriosCliente';

export interface DadosEmpresa { nome: string; cnpj: string; regime: string }
export interface Assinatura { nome: string; crc: string; cpf: string }

type RGB = [number, number, number];
const INK: RGB = [16, 25, 35];
const MUTED: RGB = [92, 108, 125];
const LINE: RGB = [227, 232, 238];
const BG2: RGB = [237, 240, 244];
const ACTION: RGB = [29, 111, 216];
const OK: RGB = [26, 159, 99];
const WARN: RGB = [217, 119, 6];
const DANGER: RGB = [220, 38, 38];

const M = 18; // margem lateral (mm)
const LARGURA = 210 - 2 * M;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const brl = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '));
export const mesAno = (pa: string) => `${MESES[Number(pa.slice(5, 7)) - 1]}/${pa.slice(0, 4)}`;
const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const dataLonga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES_LONGOS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

/** Logo da marca (public/logo-azul.png) como data URL, para o PDF. Falhou? O PDF sai só com o nome. */
export async function carregarLogo(): Promise<string | undefined> {
  try {
    const r = await fetch('/logo-azul.png');
    if (!r.ok) return undefined;
    const img = await createImageBitmap(await r.blob());
    const w = 500, h = Math.round((w * img.height) / img.width); // o PNG original tem 2228 px e deixaria o PDF com 5 MB
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); // a página é branca: JPEG leve, sem transparência
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch { return undefined; }
}

async function novoDoc() {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setFont('helvetica', 'normal');
  return { doc, autoTable };
}
type Doc = Awaited<ReturnType<typeof novoDoc>>['doc'];

const cor = (doc: Doc, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
const fundo = (doc: Doc, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const finalY = (doc: Doc) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/** Cabeçalho da primeira página: logo (ou nome) à esquerda, título do relatório à direita, linha embaixo. Devolve o y de onde seguir. */
function cabecalho(doc: Doc, titulo: string, geradoEm: string, logo?: string): number {
  if (logo) doc.addImage(logo, logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, 12, 44, (44 * 610) / 2228);
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); cor(doc, ACTION); doc.text('Contabilidade Alves', M, 20); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); cor(doc, INK); doc.text(titulo, 210 - M, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor(doc, MUTED); doc.text(`Gerado em ${dataBR(geradoEm)}`, 210 - M, 22, { align: 'right' });
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.4); doc.line(M, 28, 210 - M, 28);
  return 36;
}

function rodape(doc: Doc, texto: string) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3); doc.line(M, 285, 210 - M, 285);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); cor(doc, MUTED);
    doc.text(texto, M, 290); doc.text(`Página ${p} de ${n}`, 210 - M, 290, { align: 'right' });
  }
}

function marcaDagua(doc: Doc, texto: string) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.saveGraphicsState();
    doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.12 }) as never);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(80); cor(doc, DANGER);
    doc.text(texto, 105, 175, { align: 'center', angle: 35 });
    doc.restoreGraphicsState();
  }
}

function identificacao(doc: Doc, d: DadosEmpresa, y: number): number {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); cor(doc, INK);
  const linhas = doc.splitTextToSize(d.nome, LARGURA) as string[];
  doc.text(linhas, M, y);
  y += linhas.length * 6.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); cor(doc, MUTED);
  doc.text(`CNPJ ${d.cnpj}  ·  ${d.regime}`, M, y);
  return y + 8;
}

function titulo(doc: Doc, texto: string, y: number): number {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); cor(doc, INK); doc.text(texto, M, y);
  return y + 3;
}

function paragrafo(doc: Doc, texto: string, y: number, tamanho = 8, c: RGB = MUTED): number {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(tamanho); cor(doc, c);
  const linhas = doc.splitTextToSize(texto, LARGURA) as string[];
  doc.text(linhas, M, y);
  return y + linhas.length * (tamanho * 0.45) + 2;
}

const ROTULO_ESTADO = { regular: 'Regular', pendente: 'Pendente', nao_verificado: 'Não verificado' } as const;
const COR_ESTADO: Record<keyof typeof ROTULO_ESTADO, RGB> = { regular: OK, pendente: DANGER, nao_verificado: MUTED };

// ---------------------------------------------------------------- Relatório de Situação Fiscal
export async function gerarPdfSituacao(d: DadosEmpresa, score: Score, plano: AcaoPlano[], geradoEm: string, logo?: string): Promise<ArrayBuffer> {
  const { doc, autoTable } = await novoDoc();
  let y = cabecalho(doc, 'Relatório de Situação Fiscal', geradoEm, logo);
  y = identificacao(doc, d, y);

  // Cartão do score
  fundo(doc, BG2); doc.roundedRect(M, y, LARGURA, 34, 2, 2, 'F');
  const pct = score.percentual;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30); cor(doc, pct === null ? MUTED : pct >= 80 ? OK : pct >= 50 ? WARN : DANGER);
  doc.text(pct === null ? '—' : `${pct}%`, M + 8, y + 17);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); cor(doc, INK);
  doc.text(score.verificados === 0 ? 'Nenhum item verificado ainda' : `${score.regulares} de ${score.verificados} itens verificados estão regulares`, M + 48, y + 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); cor(doc, MUTED);
  doc.text(`${score.pendentes} ${score.pendentes === 1 ? 'pendente' : 'pendentes'}  ·  ${score.naoVerificados} não ${score.naoVerificados === 1 ? 'verificado' : 'verificados'}`, M + 48, y + 17);
  const total = score.itens.length || 1;
  const barra = 118; let x = M + 48;
  for (const [n, c] of [[score.regulares, OK], [score.pendentes, DANGER], [score.naoVerificados, [186, 196, 207] as RGB]] as [number, RGB][]) {
    if (!n) continue;
    const w = (barra * n) / total; fundo(doc, c); doc.rect(x, y + 21, w, 3.2, 'F'); x += w;
  }
  if (score.naoVerificados > 0 && score.verificados > 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); cor(doc, MUTED);
    doc.text('Score parcial: considera só os itens já verificados. Os demais seguem como "não verificado".', M + 48, y + 29.5);
  }
  y += 42;

  y = titulo(doc, 'Situação por item', y);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'plain',
    head: [['Item', 'Situação', 'Detalhe', 'Lido em']],
    body: score.itens.map((i) => [i.rotulo, ROTULO_ESTADO[i.estado], i.detalhe, i.lidoEm ? dataBR(i.lidoEm) : '—']),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: BG2, textColor: MUTED, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 26 }, 2: { cellWidth: 70 }, 3: { cellWidth: 28 } },
    didParseCell: (h) => {
      if (h.section === 'body' && h.column.index === 1) {
        const estado = score.itens[h.row.index].estado; h.cell.styles.textColor = COR_ESTADO[estado]; h.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = finalY(doc) + 10;

  if (y > 235) { doc.addPage(); y = 22; }
  y = titulo(doc, 'O que precisa ser feito', y);
  if (plano.length === 0) {
    y = paragrafo(doc, 'Nenhuma ação necessária com os itens verificados.', y + 5, 9, INK);
  } else {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'plain',
      head: [['Prioridade', 'Ação', 'O que fazer', 'Quem']],
      body: plano.map((a) => [ROTULO_PRIORIDADE[a.prioridade], a.titulo, a.oQueFazer, a.quem]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'top' },
      headStyles: { fillColor: BG2, textColor: MUTED, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' }, 1: { cellWidth: 44, fontStyle: 'bold' }, 2: { cellWidth: 74 }, 3: { cellWidth: 34 } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 0) h.cell.styles.textColor = plano[h.row.index].prioridade === 1 ? DANGER : plano[h.row.index].prioridade === 2 ? WARN : plano[h.row.index].prioridade === 3 ? ACTION : MUTED;
      },
    });
    y = finalY(doc) + 8;
  }

  if (y > 250) { doc.addPage(); y = 22; }
  paragrafo(doc,
    'Este relatório reúne o que a Receita Federal e a PGFN disponibilizam à Contabilidade Alves por meio do Serpro e o que está registrado em nosso sistema, na data de leitura de cada item. '
    + '"Não verificado" quer dizer que ainda não temos o dado confirmado: não significa que esteja regular. O relatório não substitui a certidão oficial emitida pela Receita Federal.', y, 7.5);

  rodape(doc, 'Contabilidade Alves · Juatuba/MG · Relatório de Situação Fiscal');
  return doc.output('arraybuffer');
}

// ---------------------------------------------------------------- Relatório de Faturamento (12 meses)
export async function gerarPdfFaturamento(
  d: DadosEmpresa, r: RelatorioFaturamento, assinatura: Assinatura | null, rascunho: boolean, geradoEm: string, logo?: string,
): Promise<ArrayBuffer> {
  const { doc, autoTable } = await novoDoc();
  let y = cabecalho(doc, 'Relatório de Faturamento', geradoEm, logo);
  y = identificacao(doc, d, y);

  const inicio = r.meses[0].mes, fim = r.meses[11].mes;
  y = titulo(doc, `Receita bruta dos últimos 12 meses (${mesAno(inicio)} a ${mesAno(fim)})`, y);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'plain',
    head: [['Mês', 'Mercado interno', 'Mercado externo', 'Total']],
    body: [
      ...r.meses.map((m) => [mesAno(m.mes), brl(m.interno), brl(m.externo), brl(m.total)]),
      ['Total (RBT12)', '', '', brl(r.rbt12 ?? r.somaMeses)],
    ],
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: BG2, textColor: MUTED, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 42 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (h) => {
      if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right';
      if (h.section === 'body' && h.row.index === 12) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = BG2; }
    },
  });
  y = finalY(doc) + 4;
  if (r.mesesSemDado > 0 || (r.rbt12 !== null && Math.abs(r.somaMeses - r.rbt12) > 1)) {
    y = paragrafo(doc, `${r.mesesSemDado > 0 ? `${r.mesesSemDado} ${r.mesesSemDado === 1 ? 'mês sem valor informado' : 'meses sem valor informado'} (empresa em atividade há menos de 12 meses ou sem declaração no período). ` : ''}`
      + `O total é o RBT12 informado pela Receita${r.rbt12 !== null ? ` (${brl(r.rbt12)})` : ''}; a soma dos meses listados é ${brl(r.somaMeses)}.`, y, 7.5);
  }
  y += 4;

  if (y > 205) { doc.addPage(); y = 22; }
  y = titulo(doc, 'Indicadores', y);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'plain',
    body: [
      [`Receita do mês de apuração (${mesAno(r.periodo)})`, brl(r.rpa)],
      [`Acumulado no ano até ${mesAno(r.periodo)}`, brl(r.rba)],
      ['Limite do Simples Nacional', brl(r.limite)],
      ['Sublimite estadual', brl(r.sublimite)],
      ['Uso do limite', r.percentualLimite === null ? '—' : `${r.percentualLimite.toFixed(1).replace('.', ',')}%`],
      ...(r.fatorR ? [['Fator r', r.fatorR]] : []),
    ],
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    columnStyles: { 0: { cellWidth: 100, textColor: MUTED }, 1: { halign: 'right', fontStyle: 'bold' } },
  });
  y = finalY(doc) + 6;

  const fonte = `Fonte: PGDAS-D nº ${r.numeroDeclaracao}${r.transmitidaEm ? `, transmitido em ${dataBR(r.transmitidaEm)}` : ''}${r.numeroRecibo ? `, recibo ${r.numeroRecibo}` : ''}; lido em ${dataBR(r.lidoEm)}${r.municipio ? `. Município: ${r.municipio}${r.uf ? `/${r.uf}` : ''}` : ''}.`;
  y = paragrafo(doc, fonte, y, 7.5);
  y = paragrafo(doc, 'Os valores acima correspondem ao faturamento declarado pela empresa no PGDAS-D e informado pela Receita Federal na data de leitura indicada. Este relatório tem caráter informativo e não substitui as declarações oficiais.', y, 7.5);

  // Assinatura do contador
  if (y > 236) { doc.addPage(); y = 22; }
  y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); cor(doc, INK);
  doc.text(`Juatuba/MG, ${dataLonga(geradoEm)}.`, M, y);
  y += 22;
  doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(0.3); doc.line(M, y, M + 85, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); cor(doc, INK);
  doc.text(assinatura?.nome || '[nome do contador não cadastrado]', M, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor(doc, MUTED);
  doc.text(`Contador  ·  CRC ${assinatura?.crc || '[não cadastrado]'}  ·  CPF ${assinatura?.cpf || '[não cadastrado]'}`, M, y + 10);
  doc.text('Contabilidade Alves', M, y + 15);

  rodape(doc, 'Contabilidade Alves · Juatuba/MG · Relatório de Faturamento');
  if (rascunho) marcaDagua(doc, 'RASCUNHO');
  return doc.output('arraybuffer');
}

/** Baixa o PDF no navegador. */
export function baixarPdf(bytes: ArrayBuffer, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

/** PDF em base64 (para guardar no servidor). */
export function pdfParaBase64(bytes: ArrayBuffer): string {
  let bin = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
