/**
 * Dados do Relatório Completo de UM cliente (R3, 10/10/2026): junta o que já está salvo (carteira, PGDAS-D, DCTFWeb/MIT do ano,
 * pagamentos, situação fiscal, parcelamentos, e-Processo, certificado) e monta o relatório. Só leitura: não chama a Receita.
 * As matrizes são as mesmas das telas (o React Query reaproveita o cache); só DCTFWeb/MIT do ano e pagamentos são por cliente.
 */
import { useMemo } from 'react';
import { certificadoPorCliente, useCertificates } from '@/hooks/useCertificates';
import { useRelatorioConfig } from '@/hooks/useRelatoriosCliente';
import { useMatrizDctfwebMit } from '@/hooks/useSerproDctfweb';
import { useMatrizEProcesso } from '@/hooks/useSerproExtras';
import { useDctfwebAnoCliente, useGuiasDctfwebCliente, useMitAnoCliente } from '@/hooks/useSerproFichaPresumido';
import { competenciaPadrao, usePagamentosCliente } from '@/hooks/useSerproPagamentos';
import { useMatrizParcelamentos } from '@/hooks/useSerproParcelamentos';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { useMatrizSitfis } from '@/hooks/useSerproSitfis';
import { useCadastroMonitor, useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';
import { carregarLogo, gerarPdfCompleto, type Assinatura } from '@/lib/pdfRelatorios';
import { montarRelatorioCompleto, type RelatorioCompleto } from '@/lib/relatorioCompleto';
import { montarRelatorioFaturamento, ultimaLeituraFaturamento } from '@/lib/relatoriosCliente';
import { hojeBR } from '@/lib/prazosFederais';

export function useRelatorioCompleto(contactId: string) {
  // Ano corrente até o mês anterior (decisão de Gabriel): a competência em aberto é a do mês passado.
  const competencia = competenciaPadrao();
  const ano = anoDe(competencia);
  const hoje = hojeBR();

  const carteira = useSituacaoCarteira();
  const cadastro = useCadastroMonitor();
  const pgdas = useMatrizPgdasd(ano);
  const dctfMatriz = useMatrizDctfwebMit(competencia);
  const dctfAno = useDctfwebAnoCliente(contactId, ano);
  const mitAno = useMitAnoCliente(contactId, ano);
  const guias = useGuiasDctfwebCliente(contactId, ano);
  const pagamentos = usePagamentosCliente(contactId);
  const sitfis = useMatrizSitfis();
  const parcelamentos = useMatrizParcelamentos();
  const eprocesso = useMatrizEProcesso();
  const certificados = useCertificates();
  const config = useRelatorioConfig();

  const fontes = [pgdas, dctfMatriz, dctfAno, mitAno, guias, pagamentos, sitfis, parcelamentos, eprocesso, certificados, config];
  const carregando = carteira.carregando || cadastro.carregando || fontes.some((f) => f.isLoading);
  const erro = carteira.erro ?? fontes.find((f) => f.error)?.error ?? null;

  const linha = carteira.linhas.find((l) => l.contact_id === contactId) ?? null;

  const relatorio = useMemo<RelatorioCompleto | null>(() => {
    if (carregando || !linha) return null;
    const regimeLpLr = linha.regime === 'lucro_presumido' || linha.regime === 'lucro_real';
    return montarRelatorioCompleto({
      linha, competencia, hoje,
      abertura: cadastro.aberturas.get(contactId) ?? null,
      pgdas: (pgdas.data ?? []).find((x) => x.contact_id === contactId) ?? null,
      dctf: regimeLpLr ? {
        base: (dctfMatriz.data ?? []).find((x) => x.contact_id === contactId) ?? null,
        ano: dctfAno.data ?? [], mit: mitAno.data ?? null, guias: guias.data ?? [],
      } : null,
      pagamentos: pagamentos.data ?? [],
      sitfis: (sitfis.data ?? []).find((x) => x.contact_id === contactId)?.ultimo ?? null,
      faturamento: montarRelatorioFaturamento(linha, ultimaLeituraFaturamento(carteira.faturamento, contactId)),
      parcelamentos: (parcelamentos.data ?? []).find((x) => x.contact_id === contactId) ?? null,
      eprocesso: (eprocesso.data ?? []).find((x) => x.contact_id === contactId) ?? null,
      certificado: certificadoPorCliente(certificados.data ?? []).get(contactId) ?? null,
    });
  }, [carregando, linha, competencia, hoje, cadastro.aberturas, contactId, pgdas.data, dctfMatriz.data, dctfAno.data, mitAno.data, guias.data,
    pagamentos.data, sitfis.data, carteira.faturamento, parcelamentos.data, eprocesso.data, certificados.data]);

  // A assinatura do contador só entra com o modelo validado em Tech > Rotinas (mesma validação do Relatório de Faturamento).
  const c = config.data;
  const assinatura: Assinatura | null = c?.faturamento_validado && c.contador_nome && c.contador_crc && c.contador_cpf
    ? { nome: c.contador_nome, crc: c.contador_crc, cpf: c.contador_cpf } : null;

  const gerarPdf = async (): Promise<ArrayBuffer> => {
    if (!relatorio) throw new Error('Os dados do cliente ainda não carregaram.');
    return gerarPdfCompleto(relatorio, assinatura, hojeBR(), await carregarLogo());
  };

  return { carregando, erro, foraDaCarteira: !carregando && !linha, relatorio, assinatura, gerarPdf };
}

/** Nome do arquivo do PDF: relatorio-completo-<razao-social>-<data>.pdf */
export function arquivoRelatorioCompleto(nome: string): string {
  const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `relatorio-completo-${slug}-${hojeBR()}.pdf`;
}
