import { useState } from 'react';
import { toast } from 'sonner';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConsultarDctfwebMit, useLinkReciboDctfweb, type ResultadoDctfweb } from '@/hooks/useSerproDctfweb';

const msg = (e: unknown, padrao: string) => (e as Error)?.message || padrao;

/** Erros comuns das respostas do servidor. Devolve true se já tratou (mostrou o aviso). */
function avisarFalha(r: ResultadoDctfweb): boolean {
  if (r.foraDoMonitoramento || r.filial) { toast.error(r.error ?? 'Cliente fora do monitoramento.'); return true; }
  if (r.semProcuracao) { toast.error(r.error ?? 'Este cliente não tem procuração para a DCTFWeb.'); return true; }
  if (!r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return true; }
  return false;
}

/**
 * Consulta de UM cliente e UMA competência (recibo da DCTFWeb do mês + as apurações da MIT do ano), sempre por clique, sem lote.
 * São duas consultas por clique. Se o cliente foi consultado há pouco, pede confirmação antes de consultar de novo.
 */
export function useConsultaDctfwebMit(competencia: string) {
  const consultar = useConsultarDctfwebMit();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  const executar = async (contactId: string, force = false) => {
    setEmAndamento(contactId);
    try {
      const r = await consultar.mutateAsync({ contactId, competencia, force });
      if (r.recente) { setAConfirmar(contactId); return; }
      if (avisarFalha(r)) return;
      const erros = [r.dctfweb?.erro && `DCTFWeb: ${r.dctfweb.erro}`, r.mit?.erro && `MIT: ${r.mit.erro}`].filter(Boolean) as string[];
      const resumo = `DCTFWeb ${r.dctfweb?.status === 'transmitida' ? 'com recibo' : r.dctfweb?.status === 'sem_declaracao' ? 'sem declaração' : 'não consultada'} · MIT com ${r.mit?.apuracoes ?? 0} apuração(ões) no ano`;
      if (erros.length) toast.warning(`${resumo}. ${erros.join(' · ')}`);
      else toast.success(resumo);
    } catch (e) {
      toast.error(msg(e, 'Falha na consulta. Tente novamente em instantes.'));
    } finally {
      setEmAndamento(null);
    }
  };

  const dialog = (
    <AlertDialog open={!!aConfirmar} onOpenChange={(o) => !o && setAConfirmar(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Este cliente foi consultado há pouco</AlertDialogTitle>
          <AlertDialogDescription>
            Só vale a pena consultar de novo se o cliente acabou de transmitir a DCTFWeb ou encerrar a MIT e a mudança ainda não apareceu aqui.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem consultar.">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo="Consultar" vezes={2} texto="Consulta a Receita de novo (DCTFWeb e MIT), mesmo já tendo consultado há pouco.">
            <AlertDialogAction onClick={() => { const id = aConfirmar!; setAConfirmar(null); executar(id, true); }}>
              Consultar de novo<Preco tipo="Consultar" vezes={2} />
            </AlertDialogAction>
          </DicaBotao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { executar, emAndamento, dialog };
}

/** Abre o recibo da DCTFWeb já guardado (sem chamada à Receita). */
export function useAbrirRecibo() {
  const link = useLinkReciboDctfweb();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const abrir = async (id: string) => {
    setOcupado(id);
    try {
      const l = await link.mutateAsync({ id });
      if (!l.ok || !l.url) { toast.error(l.error ?? 'Não foi possível abrir o recibo.'); return; }
      const a = document.createElement('a');
      a.href = l.url;
      a.click();
    } catch (e) {
      toast.error(msg(e, 'Não foi possível abrir o recibo.'));
    } finally {
      setOcupado(null);
    }
  };
  return { ocupado, abrir };
}
