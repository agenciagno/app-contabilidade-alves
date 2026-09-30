import { format } from 'date-fns';

export type FormatoExport = 'csv' | 'xlsx' | 'pdf';

export interface TabelaExport {
  /** Nome-base do arquivo (a data entra no final). */
  arquivo: string;
  /** Título impresso no topo do PDF. */
  titulo: string;
  colunas: string[];
  linhas: string[][];
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV, Excel ou PDF a partir de uma grade de textos. Excel e PDF só carregam a biblioteca quando usados. */
export async function exportarTabela(formato: FormatoExport, t: TabelaExport): Promise<void> {
  const nome = `${t.arquivo}-${format(new Date(), 'yyyy-MM-dd')}`;

  if (formato === 'csv') {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = '﻿' + [t.colunas, ...t.linhas].map((l) => l.map(esc).join(';')).join('\r\n');
    baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${nome}.csv`);
    return;
  }

  if (formato === 'xlsx') {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([t.colunas, ...t.linhas]);
    ws['!cols'] = t.colunas.map((c, i) => ({
      wch: Math.min(60, Math.max(c.length, ...t.linhas.map((l) => (l[i] ?? '').length)) + 2),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${nome}.xlsx`);
    return;
  }

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text(t.titulo, 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')} · ${t.linhas.length} linhas`, 14, 19);
  autoTable(doc, {
    startY: 23,
    head: [t.colunas],
    body: t.linhas,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  doc.save(`${nome}.pdf`);
}
