import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FileText, Table2, Image } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useDREData, DRESectionRow, DRECalculatedRow } from '@/hooks/useDREData';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DREReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
function formatPerc(value: number) { return `${value.toFixed(1)}%`; }
function formatDateBR(d: string) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}
function pad2(n: number) { return String(n).padStart(2, '0'); }

export function DREReportModal({ open, onOpenChange, startDate, endDate }: DREReportModalProps) {
  const { company } = useCompany();
  const { dreRows, summary } = useDREData(startDate, endDate);
  const summaryRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const periodLabel = `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;

  // Build flat rows for export, applying visibility rule: macros always shown; zero subevents hidden
  type FlatRow = {
    isCalc: boolean;
    isMacro: boolean;
    label: string;
    previsto: number;
    realizado: number;
    rxp: number;
    percPrevisto: number;
    percRealizado: number;
  };

  const flatRows: FlatRow[] = [];
  for (const row of dreRows) {
    if (row.type === 'section') {
      const r = row as DRESectionRow;
      flatRows.push({
        isCalc: false,
        isMacro: true,
        label: r.macroName,
        previsto: r.previsto,
        realizado: r.realizado,
        rxp: r.rxp,
        percPrevisto: r.percPrevisto,
        percRealizado: r.percRealizado,
      });
      for (const child of r.children) {
        if (child.previsto === 0 && child.realizado === 0) continue;
        flatRows.push({
          isCalc: false,
          isMacro: false,
          label: `    • ${child.name}`,
          previsto: child.previsto,
          realizado: child.realizado,
          rxp: child.rxp,
          percPrevisto: child.percPrevisto,
          percRealizado: child.percRealizado,
        });
      }
    } else {
      const r = row as DRECalculatedRow;
      flatRows.push({
        isCalc: true,
        isMacro: false,
        label: r.label,
        previsto: r.previsto,
        realizado: r.realizado,
        rxp: r.rxp,
        percPrevisto: r.percPrevisto,
        percRealizado: r.percRealizado,
      });
    }
  }

  // ─── PDF Export ───────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const emittedAt = `Emitido em ${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()} às ${pad2(today.getHours())}:${pad2(today.getMinutes())}`;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(company?.name || 'Empresa', 14, 18);

    if (company?.cnpj) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`CNPJ: ${company.cnpj}`, 14, 24);
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DRE - Demonstração do Resultado do Exercício', 14, 34);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${periodLabel}`, 14, 40);

    // KPI cards (5)
    const cardW = 35.6;
    const cardH = 16;
    const cardY = 46;
    const gap = 1.5;
    const padX = 2.5;
    const labelOffsetY = 5;
    const previstoOffsetY = 9.5;
    const realizadoOffsetY = 13.5;
    const x0 = 14;

    const cards = [
      { label: 'Receita Líquida', prev: summary.receitaLiquida.previsto, real: summary.receitaLiquida.realizado, fill: [240, 255, 244] as [number, number, number], color: [21, 128, 61] as [number, number, number] },
      { label: 'Custo c/ Pessoal', prev: summary.custoPessoal.previsto, real: summary.custoPessoal.realizado, fill: [239, 246, 255] as [number, number, number], color: [29, 78, 216] as [number, number, number] },
      { label: 'Desp. Operacionais', prev: summary.despesasOperacionais.previsto, real: summary.despesasOperacionais.realizado, fill: [255, 247, 237] as [number, number, number], color: [194, 65, 12] as [number, number, number] },
      { label: 'Lucro/Prejuízo', prev: summary.lucroPrejuizoLiquido.previsto, real: summary.lucroPrejuizoLiquido.realizado, fill: [245, 245, 245] as [number, number, number], color: [60, 60, 60] as [number, number, number] },
      { label: 'Fluxo de Caixa', prev: summary.fluxoCaixa, real: summary.fluxoCaixa, fill: [245, 243, 255] as [number, number, number], color: [109, 40, 217] as [number, number, number] },
    ];

    cards.forEach((c, i) => {
      const x = x0 + i * (cardW + gap);
      doc.setFillColor(c.fill[0], c.fill[1], c.fill[2]);
      doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'F');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(c.color[0], c.color[1], c.color[2]);
      doc.text(c.label, x + padX, cardY + labelOffsetY);
      doc.setFontSize(6.5);
      doc.setTextColor(110, 110, 110);
      doc.text(`Prev: ${formatCurrency(c.prev)}`, x + padX, cardY + previstoOffsetY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(`Real: ${formatCurrency(c.real)}`, x + padX, cardY + realizadoOffsetY);
    });

    const sepY = cardY + cardH + 4;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(14, sepY, 196, sepY);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`Gerado em ${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()}`, 14, sepY + 5);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: sepY + 10,
      head: [['Evento Contábil', 'Previsto', 'Realizado', 'RXP', '% Prev.', '% Real.']],
      body: flatRows.map(r => [
        r.label,
        formatCurrency(r.previsto),
        formatCurrency(r.realizado),
        formatCurrency(r.rxp),
        formatPerc(r.percPrevisto),
        formatPerc(r.percRealizado),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: {
        0: { cellWidth: 60, halign: 'left' },
        1: { cellWidth: 26, halign: 'right' },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 19, halign: 'right' },
        5: { cellWidth: 19, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const row = flatRows[data.row.index];
          if (!row) return;
          if (row.isMacro) {
            data.cell.styles.fillColor = [220, 252, 231];
            data.cell.styles.textColor = [21, 128, 61];
            // Bold only on the label column to avoid kerning issues on long currency strings
            if (data.column.index === 0) {
              data.cell.styles.fontStyle = 'bold';
            }
          } else if (row.isCalc) {
            data.cell.styles.fillColor = [229, 231, 235];
            data.cell.styles.textColor = [17, 24, 39];
            if (data.column.index === 0) {
              data.cell.styles.fontStyle = 'bold';
            }
          } else {
            // Color RXP column for sub-events
            if (data.column.index === 3) {
              data.cell.styles.textColor = row.rxp > 0 ? [22, 163, 74] : row.rxp < 0 ? [239, 68, 68] : [120, 120, 120];
            }
          }
        }
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(emittedAt, 14, pageHeight - 8);
        doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, pageHeight - 8, { align: 'right' });
        doc.setTextColor(0);
      },
    });

    doc.save(`dre-${startDate}-${endDate}.pdf`);
  };

  // ─── XLS Export ───────────────────────────────────────────────────
  const exportXLS = () => {
    const headers = ['Evento Contábil', 'Previsto', 'Realizado', 'RXP', '% Prev.', '% Real.'];
    const tableRows = flatRows.map(r => [
      r.label,
      r.previsto.toFixed(2).replace('.', ','),
      r.realizado.toFixed(2).replace('.', ','),
      r.rxp.toFixed(2).replace('.', ','),
      r.percPrevisto.toFixed(1).replace('.', ',') + '%',
      r.percRealizado.toFixed(1).replace('.', ',') + '%',
    ]);

    const headerRows = `
      <tr><td colspan="6"><b>${company?.name || 'Empresa'}</b></td></tr>
      <tr><td colspan="6">DRE - Demonstração do Resultado do Exercício</td></tr>
      <tr><td colspan="6">Período: ${periodLabel}</td></tr>
      <tr><td colspan="6"></td></tr>
    `;

    const table = `<table>${headerRows}<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${tableRows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${table}</body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dre-${startDate}-${endDate}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── CSV Export ───────────────────────────────────────────────────
  const exportCSV = () => {
    const metaLines = [
      company?.name || 'Empresa',
      'DRE - Demonstração do Resultado do Exercício',
      `Período: ${periodLabel}`,
      '',
    ];
    const headers = ['Evento Contábil', 'Previsto', 'Realizado', 'RXP', '% Prev.', '% Real.'];
    const dataLines = flatRows.map(r => [
      `"${r.label.replace(/"/g, '""')}"`,
      r.previsto.toFixed(2).replace('.', ','),
      r.realizado.toFixed(2).replace('.', ','),
      r.rxp.toFixed(2).replace('.', ','),
      r.percPrevisto.toFixed(1).replace('.', ',') + '%',
      r.percRealizado.toFixed(1).replace('.', ',') + '%',
    ].join(';'));

    const csv = [...metaLines, headers.join(';'), ...dataLines].join('\r\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dre-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── JPEG Export ──────────────────────────────────────────────────
  const exportImage = async () => {
    if (!summaryRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(summaryRef.current, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true,
      });
      const url = canvas.toDataURL('image/jpeg', 0.92);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resumo-dre-${startDate}-${endDate}.jpg`;
      a.click();
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Gerar Relatório do DRE
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold mb-1 block">Período</Label>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </div>

          <Separator className="my-2" />

          {/* Preview Summary */}
          <div>
            <Label className="text-xs font-semibold mb-1 block">Preview do Resumo</Label>
            <div
              ref={summaryRef}
              className="bg-white rounded-lg border border-gray-200 p-3 space-y-2"
              style={{ fontFamily: 'sans-serif' }}
            >
              <div>
                <h3 className="font-bold text-gray-900 text-sm">{company?.name || 'DRE'}</h3>
                <p className="text-[10px] text-gray-500">DRE • Período: {periodLabel}</p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                <div className="bg-green-50 rounded p-1.5">
                  <p className="text-[9px] text-green-700">Receita Líquida</p>
                  <p className="font-bold text-green-700 text-[10px]">{formatCurrency(summary.receitaLiquida.realizado)}</p>
                </div>
                <div className="bg-blue-50 rounded p-1.5">
                  <p className="text-[9px] text-blue-700">Custo c/ Pessoal</p>
                  <p className="font-bold text-blue-700 text-[10px]">{formatCurrency(summary.custoPessoal.realizado)}</p>
                </div>
                <div className="bg-orange-50 rounded p-1.5">
                  <p className="text-[9px] text-orange-700">Desp. Oper.</p>
                  <p className="font-bold text-orange-700 text-[10px]">{formatCurrency(summary.despesasOperacionais.realizado)}</p>
                </div>
                <div className="bg-gray-50 rounded p-1.5">
                  <p className="text-[9px] text-gray-700">Lucro/Prej.</p>
                  <p className={`font-bold text-[10px] ${summary.lucroPrejuizoLiquido.realizado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(summary.lucroPrejuizoLiquido.realizado)}</p>
                </div>
                <div className="bg-violet-50 rounded p-1.5">
                  <p className="text-[9px] text-violet-700">Fluxo Caixa</p>
                  <p className="font-bold text-violet-700 text-[10px]">{formatCurrency(summary.fluxoCaixa)}</p>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-1.5">
                <p className="text-[10px] text-gray-400">
                  {flatRows.length} linhas • Gerado em {pad2(today.getDate())}/{pad2(today.getMonth() + 1)}/{today.getFullYear()}
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Export buttons */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Exportar</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportPDF}>
                <FileText className="w-3.5 h-3.5 text-red-500" /> PDF
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportXLS}>
                <Table2 className="w-3.5 h-3.5 text-green-600" /> XLS
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportCSV}>
                <Table2 className="w-3.5 h-3.5 text-green-600" /> CSV
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportImage}>
                <Image className="w-3.5 h-3.5 text-purple-500" /> Imagem
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
