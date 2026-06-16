import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { FileText, Table2, Download, Image, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Bank } from '@/hooks/useBanks';
import { useCategories } from '@/hooks/useCategories';
import { useBankTransactions } from '@/hooks/useBankTransactions';
import { useCompany } from '@/hooks/useCompany';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BankReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banks: Bank[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDateBR(dateStr: string) {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

export function BankReportModal({ open, onOpenChange, banks }: BankReportModalProps) {
  const { categories } = useCategories();
  const { company } = useCompany();
  const summaryRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const firstOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstOfYear);
  const [endDate, setEndDate] = useState(todayStr);
  const [categoryId, setCategoryId] = useState('all');
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);

  const banksList = banks.map(b => ({ id: b.id, initial_balance: b.initial_balance, is_active: b.is_active }));

  const effectiveBankId = selectedBankIds.length === 1 ? selectedBankIds[0] : 'all';

  const { rows, openingBalance, totalIncome, totalExpense, closingBalance, isLoading } = useBankTransactions(
    {
      bankId: effectiveBankId,
      startDate: startDate || null,
      endDate: endDate || null,
      contactId: null,
      categoryId: categoryId === 'all' ? null : categoryId,
    },
    banksList
  );

  const filteredRows = selectedBankIds.length > 1
    ? rows.filter(r => r.bank_id && selectedBankIds.includes(r.bank_id))
    : rows;

  const toggleBank = (id: string) => {
    setSelectedBankIds(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const periodLabel = `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;

  // ─── Resumo por Evento Contábil ──────────────────────────────────
  const eventSummary = (() => {
    const map = new Map<string, { name: string; qty: number; entradas: number; saidas: number }>();
    for (const r of filteredRows) {
      const name = r.category_name || 'Sem evento';
      const key = name;
      const cur = map.get(key) || { name, qty: 0, entradas: 0, saidas: 0 };
      cur.qty += 1;
      if (r.type === 'receita') cur.entradas += r.amount;
      else cur.saidas += r.amount;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map(g => ({ ...g, saldo: g.entradas - g.saidas }))
      .sort((a, b) => (Math.abs(b.entradas) + Math.abs(b.saidas)) - (Math.abs(a.entradas) + Math.abs(a.saidas)));
  })();

  const eventTotals = eventSummary.reduce(
    (acc, g) => ({
      qty: acc.qty + g.qty,
      entradas: acc.entradas + g.entradas,
      saidas: acc.saidas + g.saidas,
      saldo: acc.saldo + g.saldo,
    }),
    { qty: 0, entradas: 0, saidas: 0, saldo: 0 }
  );

  const accountsLabel = selectedBankIds.length > 0
    ? banks.filter(b => selectedBankIds.includes(b.id)).map(b => b.name).join(', ')
    : 'Todas';

  const categoryLabel = categoryId !== 'all'
    ? categories.find(c => c.id === categoryId)?.name || 'Todos'
    : 'Todos';

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
    doc.text('Extrato Bancário', 14, 34);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${periodLabel}`, 14, 40);
    doc.text(`Contas: ${accountsLabel}`, 14, 45);
    doc.text(`Evento Contábil: ${categoryLabel}`, 14, 50);

    // ─── Cards compactos 4 colunas ───
    const cardW = 43;
    const cardH = 14;
    const cardY = 56;
    const gap = 2;
    const col1X = 14;
    const col2X = col1X + cardW + gap;
    const col3X = col2X + cardW + gap;
    const col4X = col3X + cardW + gap;
    const labelOffsetY = 6;
    const valueOffsetY = 12;
    const padX = 3;

    // Saldo Inicial (cinza)
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(col1X, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Saldo Inicial', col1X + padX, cardY + labelOffsetY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(formatCurrency(openingBalance), col1X + padX, cardY + valueOffsetY);

    // Entradas (verde)
    doc.setFillColor(240, 255, 244);
    doc.roundedRect(col2X, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(21, 128, 61);
    doc.text('Entradas', col2X + padX, cardY + labelOffsetY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`+${formatCurrency(totalIncome)}`, col2X + padX, cardY + valueOffsetY);

    // Saídas (vermelho)
    doc.setFillColor(255, 245, 245);
    doc.roundedRect(col3X, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 38, 38);
    doc.text('Saídas', col3X + padX, cardY + labelOffsetY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`-${formatCurrency(totalExpense)}`, col3X + padX, cardY + valueOffsetY);

    // Saldo Final (azul)
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(col4X, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(29, 78, 216);
    doc.text('Saldo Final', col4X + padX, cardY + labelOffsetY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(closingBalance), col4X + padX, cardY + valueOffsetY);

    // Separador e rodapé do resumo
    const sepY = cardY + cardH + 4;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(14, sepY, 192, sepY);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`${filteredRows.length} lançamentos • Gerado em ${pad2(today.getDate())}/${pad2(today.getMonth() + 1)}/${today.getFullYear()}`, 14, sepY + 5);

    doc.setTextColor(0);

    autoTable(doc, {
      startY: sepY + 10,
      head: [['Data', 'Banco', 'Cliente/Fornecedor', 'Evento', 'Entrada', 'Saída', 'Saldo']],
      body: filteredRows.map(r => [
        r.date,
        r.bank_name || '—',
        r.contact_name || '—',
        r.category_name || '—',
        r.type === 'receita' ? formatCurrency(r.amount) : '',
        r.type === 'despesa' ? formatCurrency(r.amount) : '',
        formatCurrency(r.running_balance),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: {
        4: { halign: 'right', textColor: [22, 163, 74] },
        5: { halign: 'right', textColor: [239, 68, 68] },
        6: { halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(emittedAt, 14, pageHeight - 8);
        doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, pageHeight - 8, { align: 'right' });
        doc.setTextColor(0);
      },
    });

    // ─── Resumo por Evento Contábil ───────────────────────────────
    if (eventSummary.length > 0) {
      const startY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('Resumo por Evento Contábil', 14, startY);

      autoTable(doc, {
        startY: startY + 3,
        head: [['Evento', 'Qtd', 'Entradas', 'Saídas', 'Saldo']],
        body: eventSummary.map(g => [
          g.name,
          String(g.qty),
          formatCurrency(g.entradas),
          formatCurrency(g.saidas),
          formatCurrency(g.saldo),
        ]),
        foot: [[
          'TOTAL',
          String(eventTotals.qty),
          formatCurrency(eventTotals.entradas),
          formatCurrency(eventTotals.saidas),
          formatCurrency(eventTotals.saldo),
        ]],
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: {
          0: { cellWidth: 78, halign: 'left' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 28, halign: 'right', textColor: [22, 163, 74] },
          3: { cellWidth: 28, halign: 'right', textColor: [239, 68, 68] },
          4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
        },
        didDrawPage: (data) => {
          const pageCount = (doc as any).internal.getNumberOfPages();
          const pageHeight = doc.internal.pageSize.height;
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(emittedAt, 14, pageHeight - 8);
          doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, pageHeight - 8, { align: 'right' });
          doc.setTextColor(0);
        },
      });
    }

    doc.save(`extrato-bancario-${startDate}-${endDate}.pdf`);
  };

  // ─── XLS Export ───────────────────────────────────────────────────
  const exportXLS = () => {
    const headers = ['Data', 'Banco', 'Histórico', 'Cliente/Fornecedor', 'Evento Contábil', 'Valor Entrada', 'Valor Saída', 'Saldo'];
    const tableRows = filteredRows.map(r => [
      r.date,
      r.bank_name || '',
      r.description,
      r.contact_name || '',
      r.category_name || '',
      r.type === 'receita' ? r.amount.toFixed(2).replace('.', ',') : '',
      r.type === 'despesa' ? r.amount.toFixed(2).replace('.', ',') : '',
      r.running_balance.toFixed(2).replace('.', ','),
    ]);

    const headerRows = `
      <tr><td colspan="8"><b>${company?.name || 'Empresa'}</b></td></tr>
      <tr><td colspan="8">Período: ${periodLabel}</td></tr>
      <tr><td colspan="8">Contas: ${accountsLabel}</td></tr>
      <tr><td colspan="8">Evento Contábil: ${categoryLabel}</td></tr>
      <tr><td colspan="8"></td></tr>
    `;

    const eventHeaders = ['Evento', 'Qtd', 'Entradas', 'Saídas', 'Saldo'];
    const eventRows = eventSummary.map(g => [
      g.name,
      String(g.qty),
      g.entradas.toFixed(2).replace('.', ','),
      g.saidas.toFixed(2).replace('.', ','),
      g.saldo.toFixed(2).replace('.', ','),
    ]);
    const eventTotalRow = [
      '<b>TOTAL</b>',
      `<b>${eventTotals.qty}</b>`,
      `<b>${eventTotals.entradas.toFixed(2).replace('.', ',')}</b>`,
      `<b>${eventTotals.saidas.toFixed(2).replace('.', ',')}</b>`,
      `<b>${eventTotals.saldo.toFixed(2).replace('.', ',')}</b>`,
    ];

    const eventBlock = eventSummary.length > 0
      ? `<tr><td colspan="8"></td></tr>
         <tr><td colspan="8"><b>Resumo por Evento Contábil</b></td></tr>
         <tr>${eventHeaders.map(h => `<th>${h}</th>`).join('')}</tr>
         ${eventRows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
         <tr>${eventTotalRow.map(cell => `<td>${cell}</td>`).join('')}</tr>`
      : '';

    const table = `<table>${headerRows}<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${tableRows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}${eventBlock}</table>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>${table}</body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-bancario-${startDate}-${endDate}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── CSV Export ───────────────────────────────────────────────────
  const exportCSV = () => {
    const metaLines = [
      company?.name || 'Empresa',
      `Período: ${periodLabel}`,
      `Contas: ${accountsLabel}`,
      `Evento Contábil: ${categoryLabel}`,
      '',
    ];

    const headers = ['Data', 'Banco', 'Histórico', 'Cliente/Fornecedor', 'Evento Contábil', 'Valor Entrada', 'Valor Saída', 'Saldo'];
    const dataLines = filteredRows.map(r => [
      r.date,
      r.bank_name || '',
      `"${(r.description || '').replace(/"/g, '""')}"`,
      `"${(r.contact_name || '').replace(/"/g, '""')}"`,
      r.category_name || '',
      r.type === 'receita' ? r.amount.toFixed(2).replace('.', ',') : '',
      r.type === 'despesa' ? r.amount.toFixed(2).replace('.', ',') : '',
      r.running_balance.toFixed(2).replace('.', ','),
    ].join(';'));

    const eventCsvLines: string[] = [];
    if (eventSummary.length > 0) {
      eventCsvLines.push('');
      eventCsvLines.push('Resumo por Evento Contábil');
      eventCsvLines.push(['Evento', 'Qtd', 'Entradas', 'Saídas', 'Saldo'].join(';'));
      for (const g of eventSummary) {
        eventCsvLines.push([
          `"${g.name.replace(/"/g, '""')}"`,
          String(g.qty),
          g.entradas.toFixed(2).replace('.', ','),
          g.saidas.toFixed(2).replace('.', ','),
          g.saldo.toFixed(2).replace('.', ','),
        ].join(';'));
      }
      eventCsvLines.push([
        'TOTAL',
        String(eventTotals.qty),
        eventTotals.entradas.toFixed(2).replace('.', ','),
        eventTotals.saidas.toFixed(2).replace('.', ','),
        eventTotals.saldo.toFixed(2).replace('.', ','),
      ].join(';'));
    }

    const csv = [...metaLines, headers.join(';'), ...dataLines, ...eventCsvLines].join('\r\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-bancario-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── OFX Export ───────────────────────────────────────────────────
  const exportOFX = () => {
    const dtStart = startDate.replace(/-/g, '');
    const dtEnd = endDate.replace(/-/g, '');
    const dtNow = `${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}`;

    const transactions = filteredRows
      .map(r => {
        const dtPosted = r.date.split('/').reverse().join('');
        const trnType = r.type === 'receita' ? 'CREDIT' : 'DEBIT';
        const amount = r.type === 'receita' ? r.amount.toFixed(2) : `-${r.amount.toFixed(2)}`;
        const memo = `${r.description}${r.contact_name ? ` - ${r.contact_name}` : ''}`;
        return `        <STMTTRN>
          <TRNTYPE>${trnType}</TRNTYPE>
          <DTPOSTED>${dtPosted}</DTPOSTED>
          <TRNAMT>${amount}</TRNAMT>
          <FITID>${r.id}</FITID>
          <MEMO>${memo.replace(/[<>&]/g, ' ')}</MEMO>
        </STMTTRN>`;
      })
      .join('\n');

    const ofx = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER:100 DATA:OFXSGML VERSION:151 SECURITY:NONE ENCODING:UTF-8 CHARSET:1252 COMPRESSION:NONE OLDFILEUID:NONE NEWFILEUID:NONE?>
<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <DTSERVER>${dtNow}</DTSERVER>
      <LANGUAGE>POR</LANGUAGE>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>1</TRNUID>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <STMTRS>
        <CURDEF>BRL</CURDEF>
        <BANKACCTFROM>
          <BANKID>000</BANKID>
          <ACCTID>EXTRATO</ACCTID>
          <ACCTTYPE>CHECKING</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>${dtStart}</DTSTART>
          <DTEND>${dtEnd}</DTEND>
${transactions}
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>${closingBalance.toFixed(2)}</BALAMT>
          <DTASOF>${dtEnd}</DTASOF>
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

    const blob = new Blob([ofx], { type: 'application/x-ofx' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-bancario-${startDate}-${endDate}.ofx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── JPEG Export ──────────────────────────────────────────────────
  const exportImage = async () => {
    if (!summaryRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const url = canvas.toDataURL('image/jpeg', 0.92);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resumo-extrato-${startDate}-${endDate}.jpg`;
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
            Gerar Relatório de Extrato
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Period */}
          <div>
            <Label className="text-sm font-semibold mb-1 block">Período</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data Início</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min="1900-01-01" max="9999-12-31" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data Fim</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min="1900-01-01" max="9999-12-31" />
              </div>
            </div>
          </div>

          {/* Bank + Category side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-semibold mb-1 block">Contas Bancárias</Label>
              <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto">
                {banks.map(bank => (
                  <div
                    key={bank.id}
                    className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-colors ${
                      selectedBankIds.includes(bank.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border/50 hover:border-border'
                    }`}
                    onClick={() => toggleBank(bank.id)}
                  >
                    <Checkbox
                      checked={selectedBankIds.includes(bank.id)}
                      onCheckedChange={() => toggleBank(bank.id)}
                      className="pointer-events-none h-3.5 w-3.5"
                    />
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: bank.color }} />
                    <span className="text-xs truncate">{bank.name}</span>
                  </div>
                ))}
                {banks.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma conta</p>
                )}
              </div>
              {selectedBankIds.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Nenhuma = todas</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold mb-1 block">Evento Contábil</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Preview Summary */}
          <div>
            <Label className="text-xs font-semibold mb-1 block">Preview do Resumo</Label>
            {isLoading ? (
              <div className="h-20 bg-muted/50 rounded-lg animate-pulse" />
            ) : (
              <div
                ref={summaryRef}
                className="bg-white rounded-lg border border-gray-200 p-3 space-y-2"
                style={{ fontFamily: 'sans-serif' }}
              >
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{company?.name || 'Extrato Bancário'}</h3>
                  <p className="text-[10px] text-gray-500">Período: {periodLabel} • Contas: {accountsLabel} • Evento: {categoryLabel}</p>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="bg-gray-50 rounded p-1.5">
                    <p className="text-[9px] text-gray-500">Saldo Inicial</p>
                    <p className="font-bold text-gray-900 text-[11px]">{formatCurrency(openingBalance)}</p>
                  </div>
                  <div className="bg-green-50 rounded p-1.5">
                    <p className="text-[9px] text-green-700">Entradas</p>
                    <p className="font-bold text-green-700 text-[11px]">+{formatCurrency(totalIncome)}</p>
                  </div>
                  <div className="bg-red-50 rounded p-1.5">
                    <p className="text-[9px] text-red-700">Saídas</p>
                    <p className="font-bold text-red-700 text-[11px]">-{formatCurrency(totalExpense)}</p>
                  </div>
                  <div className="bg-blue-50 rounded p-1.5">
                    <p className="text-[9px] text-blue-700">Saldo Final</p>
                    <p className="font-bold text-blue-700 text-[11px]">{formatCurrency(closingBalance)}</p>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-1.5">
                  <p className="text-[10px] text-gray-400">
                    {filteredRows.length} lançamentos • Gerado em {pad2(today.getDate())}/{pad2(today.getMonth() + 1)}/{today.getFullYear()}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator className="my-2" />

          {/* Export buttons */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Exportar</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportPDF} disabled={isLoading}>
                <FileText className="w-3.5 h-3.5 text-red-500" />
                PDF
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportXLS} disabled={isLoading}>
                <Table2 className="w-3.5 h-3.5 text-green-600" />
                XLS
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportCSV} disabled={isLoading}>
                <Table2 className="w-3.5 h-3.5 text-green-600" />
                CSV
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportOFX} disabled={isLoading}>
                <Download className="w-3.5 h-3.5 text-blue-500" />
                OFX
              </Button>
              <Button variant="outline" className="flex items-center gap-1.5 h-8 text-xs" onClick={exportImage} disabled={isLoading}>
                <Image className="w-3.5 h-3.5 text-purple-500" />
                Imagem
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
