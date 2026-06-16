import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Contact {
  id: string;
  name: string;
  type: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  tax_regime?: string | null;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: string;
  date: string;
  due_date?: string | null;
  is_paid: boolean;
}

interface DocumentCount {
  category: string;
  count: number;
}

interface FinancialSummary {
  totalPago: number;
  totalPendente: number;
}

const taxRegimeLabels: Record<string, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  nao_aplica: 'Pessoa Física',
};

const categoryLabels: Record<string, string> = {
  atos_constitutivos: 'Atos Constitutivos',
  impostos_guias: 'Impostos e Guias',
  fiscal: 'Fiscal',
  dp_rh: 'DP/RH',
  certidoes: 'Certidões',
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export function generateContactReport(
  contact: Contact,
  transactions: Transaction[],
  documentCounts: DocumentCount[],
  financialSummary: FinancialSummary
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DO CLIENTE', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 15;

  // Client Info
  doc.setFontSize(14);
  doc.text(contact.name, 20, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  if (contact.document) {
    const docType = contact.document.length > 14 ? 'CNPJ' : 'CPF';
    doc.text(`${docType}: ${contact.document}`, 20, yPosition);
    yPosition += 6;
  }

  const typeLabel = contact.type === 'cliente' ? 'Cliente' : contact.type === 'fornecedor' ? 'Fornecedor' : 'Cliente/Fornecedor';
  const regimeLabel = contact.tax_regime ? taxRegimeLabels[contact.tax_regime] || contact.tax_regime : '-';
  doc.text(`Tipo: ${typeLabel} | Regime: ${regimeLabel}`, 20, yPosition);
  yPosition += 6;

  doc.setTextColor(100);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 20, yPosition);
  doc.setTextColor(0);
  yPosition += 15;

  // Financial Summary
  doc.setFillColor(240, 240, 240);
  doc.rect(20, yPosition, pageWidth - 40, 25, 'F');
  yPosition += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO FINANCEIRO', 25, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Pago: ${formatCurrency(financialSummary.totalPago)}`, 25, yPosition);
  doc.text(`Total Pendente: ${formatCurrency(financialSummary.totalPendente)}`, 110, yPosition);
  yPosition += 20;

  // Transactions Table
  if (transactions.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('HISTÓRICO DE TRANSAÇÕES', 20, yPosition);
    yPosition += 5;

    const transactionRows = transactions.slice(0, 20).map(t => [
      format(new Date(t.date), 'dd/MM/yyyy'),
      t.description.length > 30 ? t.description.substring(0, 30) + '...' : t.description,
      formatCurrency(t.amount),
      t.due_date ? format(new Date(t.due_date), 'dd/MM/yyyy') : '-',
      t.is_paid ? 'Pago' : 'Pendente',
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Data', 'Descrição', 'Valor', 'Vencimento', 'Status']],
      body: transactionRows,
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9 },
      margin: { left: 20, right: 20 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPosition > 240) {
    doc.addPage();
    yPosition = 20;
  }

  // Documents Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DOCUMENTOS ARQUIVADOS', 20, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  if (documentCounts.length > 0) {
    documentCounts.forEach(({ category, count }) => {
      const label = categoryLabels[category] || category;
      doc.text(`• ${label}: ${count} arquivo${count !== 1 ? 's' : ''}`, 25, yPosition);
      yPosition += 6;
    });
  } else {
    doc.text('• Nenhum documento arquivado', 25, yPosition);
    yPosition += 6;
  }

  yPosition += 10;

  // Check if we need a new page
  if (yPosition > 250) {
    doc.addPage();
    yPosition = 20;
  }

  // Contact Data
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS CADASTRAIS', 20, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  if (contact.email) {
    doc.text(`E-mail: ${contact.email}`, 25, yPosition);
    yPosition += 6;
  }
  if (contact.phone) {
    doc.text(`Telefone: ${contact.phone}`, 25, yPosition);
    yPosition += 6;
  }
  if (contact.address || contact.city || contact.state) {
    const addressParts = [contact.address, contact.city, contact.state].filter(Boolean);
    doc.text(`Endereço: ${addressParts.join(' - ')}`, 25, yPosition);
    yPosition += 6;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save
  const fileName = `Relatorio_${contact.name.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
}
