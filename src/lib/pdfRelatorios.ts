/**
 * PDFs dos relatórios para o cliente: Relatório Completo da Empresa (10/10/2026, substituiu o de Situação Fiscal da rodada 3) e Relatório de Faturamento (12 meses).
 * Gera no navegador (jsPDF), sem servidor e sem custo. O Relatório de Faturamento leva a assinatura do contador (nome, CRC, CPF) e, sem o
 * modelo validado, sai com marca d'água "RASCUNHO" (a tela também impede o envio ao cliente).
 * Só caracteres do alfabeto latino (Helvetica padrão do PDF): nada de símbolos especiais.
 */
import type { RelatorioFaturamento } from '@/lib/relatoriosCliente';
import { ROTULO_PRIORIDADE } from '@/lib/relatoriosCliente';
import { ROTULO_VEREDITO, type RelatorioCompleto } from '@/lib/relatorioCompleto';

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

// ---------------------------------------------------------------- Relatório Completo da Empresa (10/10/2026)
const COR_MONITOR: Record<string, RGB> = { em_dia: OK, pendencia: WARN, atencao: DANGER, processando: ACTION, nao_verificado: MUTED };
const COR_VEREDITO: Record<RelatorioCompleto['veredito'], RGB> = { regular: OK, atencao: WARN, pendencias: DANGER };
const TABELA = {
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'top' as const },
  headStyles: { fillColor: BG2, textColor: MUTED, fontStyle: 'bold' as const, fontSize: 8 },
};

/**
 * "Como está minha empresa por completo?": capa com veredito e as 3 ações mais urgentes, situação por item (score), situação fiscal e
 * certidão, obrigações do ano mês a mês, pagamentos do ano, faturamento, parcelamentos, comunicações e e-Processo, procuração e
 * certificado, plano de ação e, com o modelo validado pelo contador, a assinatura dele. Só dado já salvo; cada bloco diz de quando é.
 */
export async function gerarPdfCompleto(r: RelatorioCompleto, assinatura: Assinatura | null, geradoEm: string, logo?: string): Promise<ArrayBuffer> {
  const { doc, autoTable } = await novoDoc();
  const pagina = (y: number, precisa: number) => { if (y + precisa > 272) { doc.addPage(); return 22; } return y; };
  const tabela = (y: number, opcoes: Record<string, unknown>) => {
    autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'plain', ...TABELA, ...opcoes } as never);
    return finalY(doc) + 8;
  };
  const periodo = `${mesAno(`${r.ano}-01`)} a ${mesAno(r.competencia)}`;

  let y = cabecalho(doc, 'Relatório Completo da Empresa', geradoEm, logo);
  y = identificacao(doc, { nome: r.nome, cnpj: formatarDoc(r.documento), regime: r.regime }, y);
  y = paragrafo(doc, `Período: ${periodo}. Dados lidos da Receita Federal e da PGFN e registrados no sistema da Contabilidade Alves até ${dataBR(geradoEm)}.`, y - 3, 8);
  y += 3;

  // Capa: veredito, score e as 3 ações mais urgentes
  const top = r.plano.slice(0, 3);
  const alturaCapa = 30 + top.length * 6;
  fundo(doc, BG2); doc.roundedRect(M, y, LARGURA, alturaCapa, 2, 2, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor(doc, MUTED); doc.text('Como está a sua empresa', M + 6, y + 8);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); cor(doc, COR_VEREDITO[r.veredito]); doc.text(ROTULO_VEREDITO[r.veredito], M + 6, y + 16);
  const pct = r.score.percentual;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); cor(doc, pct === null ? MUTED : pct >= 80 ? OK : pct >= 50 ? WARN : DANGER);
  doc.text(pct === null ? '—' : `${pct}%`, 210 - M - 6, y + 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); cor(doc, MUTED);
  doc.text(r.score.verificados === 0 ? 'nenhum item verificado' : `${r.score.regulares} de ${r.score.verificados} itens regulares${r.score.naoVerificados ? ' (parcial)' : ''}`, 210 - M - 6, y + 19, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); cor(doc, INK);
  doc.text(top.length ? 'O mais importante agora' : 'Nenhuma ação necessária nos itens verificados.', M + 6, y + 25);
  top.forEach((a, i) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); cor(doc, a.prioridade === 1 ? DANGER : a.prioridade === 2 ? WARN : ACTION);
    doc.text(ROTULO_PRIORIDADE[a.prioridade], M + 6, y + 31 + i * 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor(doc, INK);
    doc.text(doc.splitTextToSize(`${a.titulo} · ${a.quem}`, LARGURA - 34)[0] as string, M + 28, y + 31 + i * 6);
  });
  y += alturaCapa + 8;

  // 1. Situação por item
  y = titulo(doc, '1. Situação por item', y);
  y = tabela(y, {
    head: [['Item', 'Situação', 'Detalhe', 'Lido em']],
    body: r.score.itens.map((i) => [i.rotulo, ROTULO_ESTADO[i.estado], i.detalhe, i.lidoEm ? dataBR(i.lidoEm) : '—']),
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 26 }, 2: { cellWidth: 70 }, 3: { cellWidth: 28 } },
    didParseCell: (h: { section: string; column: { index: number }; row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
      if (h.section === 'body' && h.column.index === 1) { h.cell.styles.textColor = COR_ESTADO[r.score.itens[h.row.index].estado]; h.cell.styles.fontStyle = 'bold'; }
    },
  });

  // 2. Situação fiscal e certidão
  y = pagina(y, 40);
  y = titulo(doc, '2. Situação fiscal e certidão federal', y);
  const c = r.situacao.certidao;
  y = tabela(y, {
    body: [
      ['Relatório da Receita e da PGFN', `${r.situacao.resultado}${r.situacao.geradoEm ? ` (de ${dataBR(r.situacao.geradoEm)})` : ''}`],
      ...(r.situacao.categorias.length ? [['Pendências apontadas', r.situacao.categorias.join('; ')]] : []),
      ['Certidão federal', `${c.texto}${c.tipo ? ` · ${c.tipo}` : ''}${c.validade ? ` · válida até ${dataBR(c.validade)}` : ''}`],
    ],
    columnStyles: { 0: { cellWidth: 60, textColor: MUTED }, 1: { fontStyle: 'bold' } },
  });

  // 3. Obrigações do ano
  if (r.obrigacoes) {
    const o = r.obrigacoes;
    y = pagina(y, 50);
    y = titulo(doc, `3. Obrigações de ${r.ano}, mês a mês`, y);
    y = tabela(y, {
      head: [['Mês', o.colunas[0], o.colunas[1], o.colunas[0] === 'PGDAS-D' ? 'DAS pago' : 'DARF pago', 'Pago em']],
      body: o.meses.map((m) => [mesAno(m.pa), m.a?.texto ?? '—', m.b?.texto ?? '—', m.pago === null ? '—' : brl(m.pago), m.pagoEm ? dataBR(m.pagoEm) : '—']),
      columnStyles: { 0: { cellWidth: 24, fontStyle: 'bold' }, 3: { halign: 'right' }, 4: { cellWidth: 24 } },
      didParseCell: (h: { section: string; column: { index: number }; row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
        if (h.section !== 'body' || (h.column.index !== 1 && h.column.index !== 2)) return;
        const cel = h.column.index === 1 ? o.meses[h.row.index].a : o.meses[h.row.index].b;
        if (cel) h.cell.styles.textColor = COR_MONITOR[cel.estado] ?? INK;
      },
    });
    if (o.colunas[0] === 'DCTFWeb') y = paragrafo(doc, 'IRPJ e CSLL são trimestrais e o mesmo período pode receber DARF de outras origens: o valor pago não é comparado automaticamente com o apurado.', y - 5, 7.5) + 4;
  } else {
    y = pagina(y, 20);
    y = titulo(doc, `3. Obrigações de ${r.ano}`, y);
    y = paragrafo(doc, 'O acompanhamento mês a mês cobre o Simples Nacional (PGDAS-D e DAS) e o Lucro Presumido e o Real (DCTFWeb e MIT).', y + 4, 8.5, INK) + 4;
  }

  // 4. Pagamentos do ano
  y = pagina(y, 40);
  y = titulo(doc, `4. Pagamentos de ${r.ano} registrados na Receita`, y);
  if (r.pagamentos.quantidade === 0) {
    y = paragrafo(doc, 'Nenhum pagamento do ano consultado até agora.', y + 4, 8.5, INK) + 4;
  } else {
    y = tabela(y, {
      head: [['Tipo de documento', 'Quantidade', 'Total pago']],
      body: [...r.pagamentos.porTipo.map((p) => [p.tipo, String(p.quantidade), brl(p.total)]), ['Total', String(r.pagamentos.quantidade), brl(r.pagamentos.total)]],
      columnStyles: { 1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } },
      didParseCell: (h: { section: string; row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
        if (h.section === 'body' && h.row.index === r.pagamentos.porTipo.length) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = BG2; }
      },
    });
  }

  // 5. Faturamento (Simples)
  let n = 5;
  if (r.faturamento) {
    const f = r.faturamento;
    y = pagina(y, 30);
    y = titulo(doc, `${n++}. Faturamento e limite do Simples Nacional`, y);
    y = tabela(y, {
      body: [
        [`Receita dos últimos 12 meses (RBT12, até ${mesAno(f.periodo)})`, brl(f.rbt12)],
        ['Limite do Simples Nacional', brl(f.limite)],
        ['Uso do limite', f.percentualLimite === null ? '—' : `${f.percentualLimite.toFixed(1).replace('.', ',')}%`],
      ],
      columnStyles: { 0: { cellWidth: 110, textColor: MUTED }, 1: { halign: 'right', fontStyle: 'bold' } },
    });
  }

  // Parcelamentos
  if (r.parcelamentos && (r.parcelamentos.ativos.length || r.parcelamentos.atrasadas.length || r.parcelamentos.doMes !== null)) {
    const p = r.parcelamentos;
    y = pagina(y, 30);
    y = titulo(doc, `${n++}. Parcelamentos`, y);
    y = tabela(y, {
      body: [
        ['Parcelamentos ativos', p.ativos.length ? p.ativos.join(', ') : 'Nenhum'],
        ['Parcelas em atraso', p.atrasadas.length ? `${p.atrasadas.length} (${p.atrasadas.map((a) => a.parcela).join(', ')}) · ${brl(p.valorAtrasado)}` : 'Nenhuma'],
        ['Parcela do mês', p.doMes === null ? '—' : brl(p.doMes)],
      ],
      columnStyles: { 0: { cellWidth: 60, textColor: MUTED }, 1: { fontStyle: 'bold' } },
    });
  }

  // Comunicações e e-Processo
  y = pagina(y, 30);
  y = titulo(doc, `${n++}. Comunicações da Receita e processos`, y);
  const cm = r.comunicacoes;
  y = tabela(y, {
    body: [
      ['Mensagens da Caixa Postal que pedem ação', cm.abertas === 0 ? 'Nenhuma em aberto' : `${cm.abertas} em aberto${cm.intimacoes ? ` · ${cm.intimacoes} intimação(ões)` : ''}${cm.exclusaoSimples ? ' · inclui termo de exclusão do Simples' : ''}`],
      ['Processos digitais (e-Processo)', !r.eprocessos.consultado ? 'Ainda não consultado' : r.eprocessos.lista.length === 0 ? 'Nenhum processo' : `${r.eprocessos.lista.length} ${r.eprocessos.lista.length === 1 ? 'processo' : 'processos'}`],
      ...r.eprocessos.lista.slice(0, 8).map((p) => [`   ${p.numero}`, `${p.tipo}${p.situacao ? ` · ${p.situacao}` : ''}${p.protocolo ? ` · protocolo ${dataBR(p.protocolo)}` : ''}`]),
    ],
    columnStyles: { 0: { cellWidth: 70, textColor: MUTED }, 1: { fontStyle: 'bold' } },
  });

  // Procuração e certificado
  y = pagina(y, 25);
  y = titulo(doc, `${n++}. Procuração eletrônica e certificado digital`, y);
  y = tabela(y, {
    body: [['Procuração no e-CAC para a Contabilidade Alves', r.procuracao], ['Certificado digital da empresa', r.certificado]],
    columnStyles: { 0: { cellWidth: 70, textColor: MUTED }, 1: { fontStyle: 'bold' } },
  });

  // Plano de ação
  y = pagina(y, 30);
  y = titulo(doc, `${n++}. O que precisa ser feito`, y);
  if (r.plano.length === 0) {
    y = paragrafo(doc, 'Nenhuma ação necessária com os itens verificados.', y + 4, 9, INK) + 4;
  } else {
    y = tabela(y, {
      head: [['Prioridade', 'Ação', 'O que fazer', 'Quem']],
      body: r.plano.map((a) => [ROTULO_PRIORIDADE[a.prioridade], a.titulo, a.oQueFazer, a.quem]),
      columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' }, 1: { cellWidth: 44, fontStyle: 'bold' }, 2: { cellWidth: 74 }, 3: { cellWidth: 34 } },
      didParseCell: (h: { section: string; column: { index: number }; row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
        if (h.section === 'body' && h.column.index === 0) { const p = r.plano[h.row.index].prioridade; h.cell.styles.textColor = p === 1 ? DANGER : p === 2 ? WARN : p === 3 ? ACTION : MUTED; }
      },
    });
  }

  y = pagina(y, 30);
  y = paragrafo(doc,
    'Este relatório reúne o que a Receita Federal e a PGFN disponibilizam à Contabilidade Alves por meio do Serpro e o que está registrado em nosso sistema, na data de leitura de cada item. '
    + '"Não verificado" quer dizer que ainda não temos o dado confirmado: não significa que esteja regular. Os pagamentos mostram só o que a Receita informa como pago. O relatório não substitui a certidão oficial emitida pela Receita Federal.', y, 7.5);

  if (assinatura) {
    y = pagina(y + 6, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); cor(doc, INK);
    doc.text(`Juatuba/MG, ${dataLonga(geradoEm)}.`, M, y);
    y += 20;
    doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(0.3); doc.line(M, y, M + 85, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); cor(doc, INK); doc.text(assinatura.nome, M, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor(doc, MUTED);
    doc.text(`Contador  ·  CRC ${assinatura.crc}  ·  CPF ${assinatura.cpf}`, M, y + 10);
    doc.text('Contabilidade Alves', M, y + 15);
  }

  rodape(doc, 'Contabilidade Alves · Juatuba/MG · Relatório Completo da Empresa');
  return doc.output('arraybuffer');
}

const formatarDoc = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

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
