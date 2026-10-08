/**
 * Exportação dos relatórios da aba Relatórios (CSV e PDF) a partir de uma tabela
 * simples: cabeçalho + linhas de texto. Cada relatório monta a sua tabela uma vez e
 * usa as duas saídas — o que vai pro arquivo é o mesmo que está na tela.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface LinhaExport {
  celulas: string[];
  /** Linha de total/agrupamento: negrito e fundo cinza no PDF. */
  destaque?: boolean;
}

export interface TabelaExport {
  titulo: string;
  /** Ex.: "Período: 01/10/2026 a 31/10/2026" ou "Posição em 07/10/2026". */
  subtitulo: string;
  empresa?: string | null;
  cabecalho: string[];
  linhas: LinhaExport[];
  /** Índices das colunas numéricas (alinhadas à direita). */
  colunasValor?: number[];
  arquivo: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const agora = () => {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function baixar(conteudo: Blob, nome: string) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportarCSV(t: TabelaExport) {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [
    [t.titulo], [t.empresa ?? ''], [t.subtitulo], [],
    t.cabecalho,
    // Valor sai sem "R$" para o Excel tratar como número (1.234,56) e deixar somar.
    ...t.linhas.map((l) => l.celulas.map((c) => c.replace(/R\$\s/g, ''))),
  ];
  // BOM para o Excel abrir acentos certo; ";" é o separador do Excel em pt-BR.
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\n');
  baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${t.arquivo}.csv`);
}

export function exportarPDF(t: TabelaExport) {
  const largo = t.cabecalho.length > 6;
  const doc = new jsPDF({ orientation: largo ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(t.titulo, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (t.empresa) doc.text(t.empresa, 14, 22);
  doc.text(t.subtitulo, 14, t.empresa ? 27 : 22);
  doc.setTextColor(150);
  doc.setFontSize(7);
  doc.text(`Emitido em ${agora()}`, larguraPagina - 14, 16, { align: 'right' });
  doc.setTextColor(0);

  const valores = new Set(t.colunasValor ?? []);
  const destaques = new Set(t.linhas.map((l, i) => (l.destaque ? i : -1)).filter((i) => i >= 0));
  const columnStyles: Record<number, { halign: 'right' }> = {};
  valores.forEach((i) => { columnStyles[i] = { halign: 'right' }; });

  autoTable(doc, {
    head: [t.cabecalho],
    body: t.linhas.map((l) => l.celulas),
    startY: t.empresa ? 32 : 27,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [225, 228, 232], lineWidth: 0.1 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'head' && valores.has(data.column.index)) data.cell.styles.halign = 'right';
      if (data.section === 'body' && destaques.has(data.row.index)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 243, 246];
      }
    },
  });

  doc.save(`${t.arquivo}.pdf`);
}
