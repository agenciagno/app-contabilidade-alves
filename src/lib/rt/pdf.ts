import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { REGIME_LABEL, SETOR_LABEL } from './tabelas';
import type { Diagnostico } from './types';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`;
/** O diagnostico fala em valor mensal; o anual entra como referencia ao lado. */
const mes = (v: number) => brl(v / 12);

/** Azul da marca (#101923) — mesmo tom usado no app. */
const MARCA: [number, number, number] = [16, 25, 35];
const CINZA: [number, number, number] = [110, 118, 128];

export function gerarPdfDiagnostico(d: Diagnostico, nomeEmpresa: string, cnpj?: string | null) {
  const doc = new jsPDF();
  const largura = doc.internal.pageSize.getWidth();
  const margem = 14;
  let y = 18;

  const quebra = (altura = 40) => {
    if (y + altura > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 18;
    }
  };

  const paragrafo = (texto: string, tamanho = 9, cor = CINZA) => {
    doc.setFontSize(tamanho);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...cor);
    const linhas = doc.splitTextToSize(texto, largura - margem * 2);
    quebra(linhas.length * (tamanho * 0.45) + 6);
    doc.text(linhas, margem, y);
    y += linhas.length * (tamanho * 0.45) + 5;
  };

  const titulo = (texto: string) => {
    quebra(18);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MARCA);
    doc.text(texto, margem, y);
    y += 7;
  };

  // Cabeçalho
  doc.setFillColor(...MARCA);
  doc.rect(0, 0, largura, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Diagnóstico da Reforma Tributária', margem, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${nomeEmpresa}${cnpj ? ` · CNPJ ${cnpj}` : ''} · ${SETOR_LABEL[d.input.setor]} · ${REGIME_LABEL[d.input.regimeAtual]}${d.atual.anexo ? ` (Anexo ${d.atual.anexo})` : ''}`,
    margem,
    19
  );
  doc.text(
    `Gerado em ${format(new Date(d.geradoEm), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`,
    margem,
    24.5
  );
  y = 38;

  // Resultado principal
  const subiu = d.variacaoValor > 0;
  const noUnificado = d.simplesFicaNoUnificado;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MARCA);
  doc.text(
    noUnificado
      ? 'Ficando no DAS unificado, a conta nao muda'
      : subiu
        ? 'Com a reforma, a carga sobre consumo tende a SUBIR'
        : 'Com a reforma, a carga sobre consumo tende a CAIR',
    margem,
    y
  );
  y += 7;
  doc.setFontSize(18);
  if (noUnificado) {
    doc.setTextColor(...MARCA);
    doc.text(`${mes(d.atual.cargaConsumo)} por mes, como hoje`, margem, y);
  } else {
    doc.setTextColor(subiu ? 190 : 20, subiu ? 40 : 130, 40);
    doc.text(`${subiu ? '+' : '-'} ${mes(Math.abs(d.variacaoValor))} por mes`, margem, y);
  }
  y += 9;

  paragrafo(d.explicacao);

  // De / Para
  titulo('De / Para');
  autoTable(doc, {
    startY: y,
    head: [['Cenário', 'Por mês', 'No ano', '% do faturamento']],
    body: [
      [
        `Hoje — ${REGIME_LABEL[d.input.regimeAtual]}`,
        mes(d.atual.cargaConsumo),
        brl(d.atual.cargaConsumo),
        pct(d.atual.aliquotaEfetivaConsumo),
      ],
      [
        noUnificado ? 'Se optar pelo regime regular — CBS + IBS' : 'Com a reforma — CBS + IBS',
        mes(d.posReforma.liquido),
        brl(d.posReforma.liquido),
        pct(d.posReforma.aliquotaEfetiva),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: MARCA, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: margem, right: margem },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Composição de hoje
  titulo('Como se compõe a carga de hoje');
  autoTable(doc, {
    startY: y,
    head: [['Tributo', 'Por mês', 'No ano', 'Substituído pela reforma?']],
    body: d.atual.linhas.map((l) => [l.tributo, mes(l.valor), brl(l.valor), l.consumo ? 'Sim' : 'Não']),
    theme: 'grid',
    headStyles: { fillColor: MARCA, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: margem, right: margem },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Comparativo de regimes
  titulo('A empresa está no regime certo?');
  autoTable(doc, {
    startY: y,
    head: [['Regime', 'Por mês', 'No ano', 'Alíquota efetiva', 'Situação']],
    body: d.comparativo.map((r) => [
      r.label + (r.anexo ? ` (Anexo ${r.anexo})` : ''),
      r.indisponivel && r.totalAnual === 0 ? '—' : mes(r.totalAnual),
      r.indisponivel && r.totalAnual === 0 ? '—' : brl(r.totalAnual),
      r.indisponivel && r.totalAnual === 0 ? '—' : pct(r.aliquotaEfetiva),
      r.regime === d.input.regimeAtual
        ? 'Regime atual'
        : d.melhorRegime?.regime === r.regime
          ? 'Mais barato'
          : '',
    ]),
    theme: 'grid',
    headStyles: { fillColor: MARCA, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: margem, right: margem },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (d.economiaMigracao > 0 && d.melhorRegime) {
    paragrafo(
      `Migrar para ${d.melhorRegime.label} economizaria cerca de ${mes(d.economiaMigracao)} por mes (${brl(d.economiaMigracao)} no ano). Vale confirmar com analise individual antes de mudar.`,
      9,
      MARCA
    );
  }

  // Decisão do Simples
  if (d.hibrido) {
    titulo('A decisão de setembro: DAS unificado ou IBS/CBS por fora');
    autoTable(doc, {
      startY: y,
      head: [['Cenário', 'Custo por mês', 'Custo no ano', 'Crédito repassado (mês)']],
      body: [
        [
          'Continuar no DAS unificado',
          mes(d.hibrido.unificadoTotal),
          brl(d.hibrido.unificadoTotal),
          mes(d.hibrido.creditoRepassadoUnificado),
        ],
        [
          'Regime regular de IBS/CBS',
          mes(d.hibrido.hibridoTotal),
          brl(d.hibrido.hibridoTotal),
          mes(d.hibrido.creditoRepassadoHibrido),
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: MARCA, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: margem, right: margem },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    paragrafo(d.hibrido.justificativa, 9, MARCA);
  }

  // Alertas
  titulo('O que observar');
  d.alertas.forEach((a) => paragrafo(`• ${a}`, 8.5));

  // Rodapé de responsabilidade em todas as páginas
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...CINZA);
    const rodape = doc.splitTextToSize(
      'Estimativa para orientar a decisão; não substitui análise individual. As alíquotas de CBS e IBS ainda dependem de Resolução do Senado. Contabilidade Alves.',
      largura - margem * 2
    );
    doc.text(rodape, margem, doc.internal.pageSize.getHeight() - 12);
    doc.text(
      `${i}/${paginas}`,
      largura - margem,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'right' }
    );
  }

  const nomeArquivo = `diagnostico-reforma-${nomeEmpresa
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(nomeArquivo);
}
