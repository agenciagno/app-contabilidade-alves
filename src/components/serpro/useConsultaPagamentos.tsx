import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConsultarPagamentos } from '@/hooks/useSerproPagamentos';

/**
 * Consulta de pagamentos de UM cliente num mês, sempre por clique (sem lote).
 * Se o mês deste cliente foi consultado há pouco, pede confirmação antes de consultar de novo.
 * Custos não aparecem nas telas de operação: ficam só em Tech > Consumo Serpro.
 */
export function useConsultaPagamentos(competencia: string) {
  const consultar = useConsultarPagamentos();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  const executar = async (contactId: string, force = false) => {
    setEmAndamento(contactId);
    try {
      const r = await consultar.mutateAsync({ contactId, competencia, force });
      if (r.recente) { setAConfirmar(contactId); return; }
      if (r.foraDoMonitoramento) { toast.error(r.error ?? 'Cliente fora do monitoramento.'); return; }
      if (r.semProcuracao) { toast.error('Este cliente não tem procuração para consultar pagamentos.'); return; }
      if (!r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return; }
      toast.success(`${r.do_mes ?? 0} pagamentos no mês (${r.novos ?? 0} novos)`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha na consulta. Tente novamente em instantes.');
    } finally {
      setEmAndamento(null);
    }
  };

  const dialog = (
    <AlertDialog open={!!aConfirmar} onOpenChange={(o) => !o && setAConfirmar(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Este mês foi consultado há pouco</AlertDialogTitle>
          <AlertDialogDescription>
            Só vale a pena consultar de novo se o cliente avisou de um pagamento que ainda não apareceu aqui.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const id = aConfirmar!; setAConfirmar(null); executar(id, true); }}>
            Consultar de novo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { executar, emAndamento, dialog };
}
