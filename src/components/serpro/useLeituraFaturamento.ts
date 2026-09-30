import { useState } from 'react';
import { toast } from 'sonner';
import { useLerFaturamento, type ResultadoFaturamento } from '@/hooks/useSerproFaturamento';

/** Avisos comuns das respostas do servidor. Devolve true se já tratou (mostrou o aviso). */
export function avisarFalhaFaturamento(r: ResultadoFaturamento): boolean {
  if (r.foraDoMonitoramento || r.filial) { toast.error(r.error ?? 'Cliente fora do monitoramento.'); return true; }
  if (r.semProcuracao) { toast.error('Este cliente não tem procuração para o PGDAS-D.'); return true; }
  if (!r.ok) { toast.error(r.error ?? 'Não foi possível ler a declaração.'); return true; }
  return false;
}

/**
 * Lê o PDF da declaração de UM cliente e grava o faturamento. Se o PDF já está guardado, a leitura não custa nada;
 * se não, baixa antes (uma consulta ao Serpro, por clique, como o botão "Declaração (PDF)" da tela PGDAS).
 */
export function useLeituraFaturamento() {
  const ler = useLerFaturamento();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);

  const executar = async (contactId: string, periodo: string) => {
    setEmAndamento(contactId);
    try {
      const r = await ler.mutateAsync({ contactId, periodo });
      if (avisarFalhaFaturamento(r)) return;
      if (r.confiavel) toast.success('Declaração lida.');
      else toast.warning(`Li o PDF, mas há pontos a conferir${r.avisos?.length ? `: ${r.avisos[0]}` : ''}. O número não será usado nos alertas.`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Não foi possível ler a declaração. Tente novamente em instantes.');
    } finally {
      setEmAndamento(null);
    }
  };
  return { executar, emAndamento };
}
