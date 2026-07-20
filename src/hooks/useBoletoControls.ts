import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  status: 'ok' | 'error' | 'skipped';
  message?: string;
}
export interface OrphanSyncSummary {
  contactsScanned: number;
  totalEncontrados: number;
  totalOrfaos: number;
  errors: number;
  details: OrphanSyncResult[];
}

export interface BoletoWithContact extends BoletoControl {
  contact_name: string;
  contact_type: string;
  contact_document: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

const N8N_REENVIO_URL = 'https://n8n.contabilidadealves.com.br/webhook/sicoob-reenvio';

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
          origem_baixa, sicoob_response, pdf_url,
          contacts:contact_id ( id, name, type, document, email, phone )
        `)
        .gte('data_vencimento', vencimentoMonth)
        .lt('data_vencimento', addMonthISO(vencimentoMonth))
        .order('data_vencimento', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []).map((bc: any): BoletoWithContact => ({
        ...bc,
        contact_name: bc.contacts?.name ?? '—',
        contact_type: bc.contacts?.type ?? 'cliente',
        contact_document: bc.contacts?.document ?? null,
        contact_email: bc.contacts?.email ?? null,
        contact_phone: bc.contacts?.phone ?? null,
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

  // 3. Reenviar cobrança via N8N
  const resendBilling = useMutation({
    mutationFn: async (boleto: BoletoWithContact) => {
      const res = await fetch(N8N_REENVIO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boleto_id: boleto.id,
          contact_id: boleto.contact_id,
          canal_entrega: boleto.canal_entrega,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast({ title: 'Cobrança reenviada com sucesso' });
    },
    onError: () => {
      toast({ title: 'Erro ao reenviar', variant: 'destructive' });
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
      errors: details.filter((r) => r.status === 'error').length,
      details,
    };
  };

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
    resendBilling,
    fetchPreview,
    generateBoletos,
    generateSingleBoleto,
    listSyncContacts,
    findOrphanBoletos,
    downloadBoletoPdf,
  };
}
