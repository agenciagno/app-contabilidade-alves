import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getContactLegalName } from '@/lib/contact-display';
import { createGlobalLog } from '@/hooks/useGlobalLogs';

// Conta "Sicoob" em `banks` — mesma conta usada em 100% dos lançamentos de honorários já
// liquidados manualmente hoje (confirmado por amostragem real antes de automatizar, 15/09/2026).
const SICOOB_BANK_ID = '74422cd4-e2e3-4bf1-80dc-b2c1e1b0ed71';

export type BoletoStatus = 'PENDENTE' | 'PAGO' | 'FILA_IMPRESSAO' | 'IMPRESSO' | string;
export type CanalEntrega = 'whatsapp' | 'email' | 'impresso' | 'whatsapp_email' | null;

export interface BoletoControl {
  id: string;
  company_id: string;
  contact_id: string;
  reference_month: string;
  status: BoletoStatus;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
  // Campos novos (criados manualmente no Supabase)
  valor: number | null;
  valor_pago: number | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  canal_entrega: CanalEntrega;
  nosso_numero: string | null;
  seu_numero: string | null;
  linha_digitavel: string | null;
  codigo_barras: string | null;
  url_qrcode: string | null; // nome de coluna legado — na verdade é o payload PIX copia-e-cola (EMV), não uma URL de imagem
  origem_baixa: string | null;
  sicoob_response: any;
  pdf_url: string | null;
  // Liquidação semi-automática (15/09/2026): transaction_id aponta pro lançamento já liquidado
  // a partir deste boleto; liquidacao_habilitada é false pra todo boleto que já estava PAGO
  // antes desse fluxo existir (nunca fica elegível pro botão "Liquidar", mesmo sem vínculo).
  transaction_id: string | null;
  liquidacao_habilitada: boolean;
}

// Lançamento candidato a ser liquidado por um boleto pago (busca por cliente + vencimento).
export interface LancamentoCandidato {
  id: string;
  description: string;
  amount: number;
  due_date: string | null;
  category_name: string | null;
}

// Preview de geração (retorno da edge function sicoob-boletos, action=preview)
export interface PreviewItem {
  contact_id: string;
  name: string;
  document: string | null;
  valor: number | null;
  canal_entrega: CanalEntrega;
  data_vencimento: string | null;
  already_generated: boolean;
  missing_fields: string[];
}
export interface PreviewResponse {
  data_emissao: string;
  total: number;
  elegiveis: number;
  items: PreviewItem[];
}

// Resultado por item (action=generate)
export interface GenerateResult {
  contact_id: string;
  name: string | null;
  status: 'ok' | 'error' | 'skipped';
  message?: string;
  pdf?: boolean;
}

// Contato elegível pra sincronização (action=list_contacts)
export interface SyncContact {
  contact_id: string;
  name: string;
}

// Resultado por contato (action=find_orphans)
export interface OrphanSyncResult {
  contact_id: string;
  name: string | null;
  encontrados: number;
  orfaos: number;
  atualizados: number;
  status: 'ok' | 'error' | 'skipped';
  message?: string;
}
export interface OrphanSyncSummary {
  contactsScanned: number;
  totalEncontrados: number;
  totalOrfaos: number;
  totalAtualizados: number;
  errors: number;
  details: OrphanSyncResult[];
}

export interface BoletoWithContact extends BoletoControl {
  contact_name: string;
  contact_type: string;
  contact_document: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
}

// Geração processada em lotes para não estourar o tempo de execução da edge function.
const GENERATE_CHUNK_SIZE = 15;

function addMonthISO(monthStart: string): string {
  const [ano, mes] = monthStart.split('-').map(Number);
  const proximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  return proximo;
}

// vencimentoMonth: 'YYYY-MM-01' — mês de vencimento exibido na tabela (não o mês de emissão/geração).
export function useBoletoControls(vencimentoMonth: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 1. Busca boleto_controls com vencimento dentro do mês selecionado, com join em contacts
  const { data: boletoList = [], isLoading, refetch } = useQuery({
    queryKey: ['boleto-controls-v2', vencimentoMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('boleto_controls')
        .select(`
          id, contact_id, company_id, reference_month, status, generated_at,
          created_at, updated_at,
          valor, valor_pago, data_vencimento, data_pagamento, canal_entrega,
          nosso_numero, seu_numero, linha_digitavel, codigo_barras, url_qrcode,
          origem_baixa, sicoob_response, pdf_url, transaction_id, liquidacao_habilitada,
          contacts:contact_id ( id, name, type, document, email, phone, whatsapp, display_name, nome_fantasia, razao_social )
        `)
        .gte('data_vencimento', vencimentoMonth)
        .lt('data_vencimento', addMonthISO(vencimentoMonth))
        .order('data_vencimento', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []).map((bc: any): BoletoWithContact => ({
        ...bc,
        contact_name: bc.contacts ? (getContactLegalName(bc.contacts) || '—') : '—',
        contact_type: bc.contacts?.type ?? 'cliente',
        contact_document: bc.contacts?.document ?? null,
        contact_email: bc.contacts?.email ?? null,
        contact_phone: bc.contacts?.phone ?? null,
        contact_whatsapp: bc.contacts?.whatsapp ?? null,
      }));
    },
    staleTime: 1000 * 30,
  });

  // 2. Marcar como impresso (status FILA_IMPRESSAO -> IMPRESSO)
  const markAsPrinted = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('boleto_controls')
        .update({ status: 'IMPRESSO' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boleto-controls-v2', vencimentoMonth] });
      toast({ title: 'Marcado como impresso' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' });
    },
  });

  // 4. Preview: lista quem receberia boleto se gerado agora (independe do mês em exibição).
  const fetchPreview = async (): Promise<PreviewResponse> => {
    const { data, error } = await supabase.functions.invoke('sicoob-boletos', {
      body: { action: 'preview' },
    });
    if (error) throw new Error(error.message || 'Falha ao carregar o preview');
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as PreviewResponse;
  };

  // 5. Geração: processa os contact_ids selecionados em lotes, agregando resultados.
  const generateBoletos = async (
    contactIds: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<GenerateResult[]> => {
    const all: GenerateResult[] = [];
    for (let i = 0; i < contactIds.length; i += GENERATE_CHUNK_SIZE) {
      const chunk = contactIds.slice(i, i + GENERATE_CHUNK_SIZE);
      const { data, error } = await supabase.functions.invoke('sicoob-boletos', {
        body: { action: 'generate', contact_ids: chunk },
      });
      if (error) throw new Error(error.message || 'Falha na geração');
      if ((data as any)?.error) throw new Error((data as any).error);
      all.push(...(((data as any)?.results ?? []) as GenerateResult[]));
      onProgress?.(Math.min(i + GENERATE_CHUNK_SIZE, contactIds.length), contactIds.length);
    }
    // Boletos gerados vencem no mês seguinte à emissão — pode não ser o mês em exibição agora.
    queryClient.invalidateQueries({ queryKey: ['boleto-controls-v2'] });
    return all;
  };

  // 5b. Boleto avulso: um cliente, valor e vencimento escolhidos na hora (fora do ciclo mensal).
  const generateSingleBoleto = async (
    contactId: string,
    valor: number,
    dataVencimento: string,
  ): Promise<{ ok: true; name: string | null; nosso_numero: number | null; pdf: boolean }> => {
    const { data, error } = await supabase.functions.invoke('sicoob-boletos', {
      body: { action: 'generate_single', contact_id: contactId, valor, data_vencimento: dataVencimento },
    });
    if (error) throw new Error(error.message || 'Falha ao gerar boleto');
    if ((data as any)?.error) throw new Error((data as any).error);
    queryClient.invalidateQueries({ queryKey: ['boleto-controls-v2'] });
    return data as any;
  };

  // 6. Sincronizar com o Sicoob: acha boletos registrados lá mas ausentes da tabela local.
  const listSyncContacts = async (): Promise<SyncContact[]> => {
    const { data, error } = await supabase.functions.invoke('sicoob-boletos', {
      body: { action: 'list_contacts' },
    });
    if (error) throw new Error(error.message || 'Falha ao listar contatos');
    if ((data as any)?.error) throw new Error((data as any).error);
    return ((data as any)?.items ?? []) as SyncContact[];
  };

  const findOrphanBoletos = async (
    contactIds: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<OrphanSyncSummary> => {
    const details: OrphanSyncResult[] = [];
    for (let i = 0; i < contactIds.length; i += GENERATE_CHUNK_SIZE) {
      const chunk = contactIds.slice(i, i + GENERATE_CHUNK_SIZE);
      const { data, error } = await supabase.functions.invoke('sicoob-boletos', {
        body: { action: 'find_orphans', contact_ids: chunk },
      });
      if (error) throw new Error(error.message || 'Falha na sincronização');
      if ((data as any)?.error) throw new Error((data as any).error);
      details.push(...(((data as any)?.details ?? []) as OrphanSyncResult[]));
      onProgress?.(Math.min(i + GENERATE_CHUNK_SIZE, contactIds.length), contactIds.length);
    }
    // Órfãos podem cair em qualquer mês — invalida a lista inteira, não só o mês atual.
    queryClient.invalidateQueries({ queryKey: ['boleto-controls-v2'] });
    return {
      contactsScanned: contactIds.length,
      totalEncontrados: details.reduce((s, r) => s + r.encontrados, 0),
      totalOrfaos: details.reduce((s, r) => s + r.orfaos, 0),
      totalAtualizados: details.reduce((s, r) => s + (r.atualizados || 0), 0),
      errors: details.filter((r) => r.status === 'error').length,
      details,
    };
  };

  // 8. Liquidar: acha lançamentos em aberto (Contas a Receber) do mesmo cliente pra oferecer
  // como candidato ao vincular um boleto PAGO. Busca por cliente + tipo — o vencimento decide
  // qual vem pré-selecionado no dialog (LiquidarBoletoDialog), não filtra aqui pra também cobrir
  // o caso de 0 match exato (usuário escolhe manualmente entre os lançamentos abertos do cliente).
  const fetchLancamentosAbertos = async (contactId: string): Promise<LancamentoCandidato[]> => {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, description, amount, due_date, category:categories(name)')
      .eq('contact_id', contactId)
      .eq('type', 'receita')
      .eq('is_paid', false)
      .is('deleted_at', null)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return (data || []).map((t: any) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      due_date: t.due_date,
      category_name: t.category?.name ?? null,
    }));
  };

  // Liquida o lançamento escolhido com os dados do boleto pago e grava o vínculo — um único
  // UPDATE em transactions (is_paid, paid_amount, date, bank_id) + o transaction_id no boleto.
  // `is_paid: false` no filtro do UPDATE garante que nunca sobrescreve um lançamento que alguém
  // já liquidou por fora entre a busca e a confirmação (a mesma trava que protege lançamentos
  // liquidados manualmente no passado — exigência do Gabriel, 15/09/2026).
  const liquidarBoleto = useMutation({
    mutationFn: async (params: { boleto: BoletoWithContact; transactionId: string; valorPago: number; dataPagamento: string }) => {
      const { boleto, transactionId, valorPago, dataPagamento } = params;
      const { data: updatedRows, error: txnErr } = await supabase
        .from('transactions')
        .update({ is_paid: true, paid_amount: valorPago, date: dataPagamento, bank_id: SICOOB_BANK_ID })
        .eq('id', transactionId)
        .eq('is_paid', false)
        .select('id');
      if (txnErr) throw txnErr;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Este lançamento já foi liquidado por outra via — atualize a tela e confira.');
      }

      const { error: boletoErr } = await (supabase as any)
        .from('boleto_controls')
        .update({ transaction_id: transactionId })
        .eq('id', boleto.id);
      if (boletoErr) throw boletoErr;

      await createGlobalLog({
        action: 'ALTERACAO',
        module: 'FINANCEIRO',
        entityId: transactionId,
        entityName: boleto.contact_name,
        details: `Liquidado via boleto Sicoob (nosso número ${boleto.nosso_numero ?? '—'}) — valor pago ${valorPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, pagamento em ${dataPagamento}.`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boleto-controls-v2'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['server-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['banks'] });
      queryClient.invalidateQueries({ queryKey: ['dre-previsto'] });
      queryClient.invalidateQueries({ queryKey: ['dre-realizado'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      toast({ title: 'Lançamento liquidado' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao liquidar', description: e.message, variant: 'destructive' });
    },
  });

  // 7. Baixar o PDF do boleto (signed URL do bucket privado).
  const downloadBoletoPdf = async (boleto: BoletoWithContact) => {
    if (!boleto.pdf_url) {
      toast({ title: 'PDF indisponível', description: 'Este boleto não tem PDF salvo.', variant: 'destructive' });
      return;
    }
    const { data, error } = await supabase.storage.from('boletos').createSignedUrl(boleto.pdf_url, 60);
    if (error || !data?.signedUrl) {
      toast({ title: 'Erro ao gerar link do PDF', description: error?.message, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return {
    boletoList,
    isLoading,
    refetch,
    markAsPrinted,
    fetchPreview,
    generateBoletos,
    generateSingleBoleto,
    listSyncContacts,
    findOrphanBoletos,
    downloadBoletoPdf,
    fetchLancamentosAbertos,
    liquidarBoleto,
  };
}
