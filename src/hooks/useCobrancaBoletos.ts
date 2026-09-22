import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getContactLegalName } from '@/lib/contact-display';

export interface CobrancaBoleto {
  id: string;
  contact_id: string;
  valor: number;
  data_vencimento: string;
  dias_atraso: number;
  multa_pct: number | null;
  juros_pct_dia: number | null;
  juros_valor: number;
  multa_valor: number;
  valor_atualizado: number;
  linha_digitavel: string | null;
  url_qrcode: string | null; // payload PIX copia-e-cola (EMV) do boleto
  // false quando o Sicoob não trouxe multa/juros nesse boleto específico — nesse caso
  // valor_atualizado = valor (não inventamos taxa) e a UI avisa que está sem encargos.
  encargos_disponiveis: boolean;
}

export interface CobrancaContact {
  contact_id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  email_cobranca: string | null;
  whatsapp_cobranca: string | null;
  boletos: CobrancaBoleto[];
}

// Mesma leitura de tipoJurosMora usada em Boletos.tsx (EncargosSection): "1" = taxa direta
// em %/dia, "2" = taxa mensal que o Sicoob converte sozinho pro dia — aqui fazemos a mesma
// conversão pra calcular o valor atualizado localmente, sem chamar o Sicoob de novo.
function calcEncargos(
  valor: number,
  dataVencimento: string,
  sicoobResponse: any,
  hoje: Date,
): Pick<CobrancaBoleto, 'dias_atraso' | 'multa_pct' | 'juros_pct_dia' | 'juros_valor' | 'multa_valor' | 'valor_atualizado' | 'encargos_disponiveis'> {
  const diasAtraso = Math.max(0, differenceInCalendarDays(startOfDay(hoje), startOfDay(parseISO(dataVencimento))));
  const r = sicoobResponse;
  const temEncargos = !!r && (r.valorMulta != null || r.valorJurosMora != null);

  if (diasAtraso === 0 || !temEncargos) {
    return {
      dias_atraso: diasAtraso,
      multa_pct: null,
      juros_pct_dia: null,
      juros_valor: 0,
      multa_valor: 0,
      valor_atualizado: valor,
      encargos_disponiveis: temEncargos,
    };
  }

  const multaPct = Number(r.valorMulta ?? 0);
  const jurosPct = Number(r.valorJurosMora ?? 0);
  const jurosMensal = String(r.tipoJurosMora) === '2';
  const jurosPctDia = jurosMensal ? jurosPct / 30 : jurosPct;

  const multaValor = valor * (multaPct / 100);
  const jurosValor = valor * (jurosPctDia / 100) * diasAtraso;

  return {
    dias_atraso: diasAtraso,
    multa_pct: multaPct,
    juros_pct_dia: jurosPctDia,
    juros_valor: jurosValor,
    multa_valor: multaValor,
    valor_atualizado: valor + jurosValor + multaValor,
    encargos_disponiveis: true,
  };
}

/** Clientes com boleto vencido (PENDENTE + vencimento no passado) e seus boletos, agrupados
 * pra alimentar a busca multi-seleção e o cálculo de encargos da aba Cobrança. Não tem filtro
 * de mês — cobrança olha pra tudo que está em atraso, não só o mês em exibição no Controle. */
export function useCobrancaBoletos() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cobranca-boletos-vencidos'],
    queryFn: async () => {
      const hoje = format(startOfDay(new Date()), 'yyyy-MM-dd');
      const { data, error } = await (supabase as any)
        .from('boleto_controls')
        .select(`
          id, contact_id, valor, data_vencimento, linha_digitavel, url_qrcode, sicoob_response,
          contacts:contact_id ( id, name, display_name, nome_fantasia, razao_social, document, email, phone, whatsapp, email_cobranca, whatsapp_cobranca )
        `)
        .eq('status', 'PENDENTE')
        .lt('data_vencimento', hoje)
        .not('data_vencimento', 'is', null)
        .order('data_vencimento', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 1000 * 30,
  });

  const contacts = useMemo<CobrancaContact[]>(() => {
    if (!data) return [];
    const agora = new Date();
    const byContact = new Map<string, CobrancaContact>();
    for (const bc of data) {
      const c = bc.contacts;
      if (!c) continue;
      const encargos = calcEncargos(Number(bc.valor ?? 0), bc.data_vencimento, bc.sicoob_response, agora);
      const boleto: CobrancaBoleto = {
        id: bc.id,
        contact_id: bc.contact_id,
        valor: Number(bc.valor ?? 0),
        data_vencimento: bc.data_vencimento,
        linha_digitavel: bc.linha_digitavel ?? null,
        url_qrcode: bc.url_qrcode ?? null,
        ...encargos,
      };
      let entry = byContact.get(bc.contact_id);
      if (!entry) {
        entry = {
          contact_id: bc.contact_id,
          name: getContactLegalName(c) || '—',
          document: c.document ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          whatsapp: c.whatsapp ?? null,
          email_cobranca: c.email_cobranca ?? null,
          whatsapp_cobranca: c.whatsapp_cobranca ?? null,
          boletos: [],
        };
        byContact.set(bc.contact_id, entry);
      }
      entry.boletos.push(boleto);
    }
    return Array.from(byContact.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [data]);

  return { contacts, isLoading, refetch };
}
