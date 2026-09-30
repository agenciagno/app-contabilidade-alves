import { useState } from 'react';
import { toast } from 'sonner';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConsultarDefis, useDocumentosDefis, useLinkDefis, type DefisRow, type ResultadoDefis } from '@/hooks/useSerproDefis';

/** Erros comuns das respostas do servidor. Devolve true se já tratou (mostrou o aviso). */
function avisarFalha(r: ResultadoDefis): boolean {
  if (r.foraDoMonitoramento || r.filial) { toast.error(r.error ?? 'Cliente fora do monitoramento.'); return true; }
  if (r.semProcuracao) { toast.error('Este cliente não tem procuração para a DEFIS.'); return true; }
  if (!r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return true; }
  return false;
}
const msg = (e: unknown, padrao: string) => (e as Error)?.message || padrao;

/**
 * Consulta de UM cliente (traz TODAS as DEFIS dele numa chamada), sempre por clique, sem lote.
 * Se o cliente foi consultado há pouco, pede confirmação antes de consultar de novo.
 */
export function useConsultaDefis() {
  const consultar = useConsultarDefis();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  const executar = async (contactId: string, force = false) => {
    setEmAndamento(contactId);
    try {
      const r = await consultar.mutateAsync({ contactId, force });
      if (r.recente) { setAConfirmar(contactId); return; }
      if (avisarFalha(r)) return;
      toast.success(r.sem_declaracao ? 'Nenhuma DEFIS transmitida por este cliente' : `${r.declaracoes ?? 0} DEFIS encontradas (${r.novas ?? 0} novas)`);
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
            Só vale a pena consultar de novo se o cliente acabou de transmitir a DEFIS e ela ainda não apareceu aqui.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem consultar.">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo="Consultar" texto="Consulta a Receita de novo, mesmo já tendo consultado há pouco.">
            <AlertDialogAction onClick={() => { const id = aConfirmar!; setAConfirmar(null); executar(id, true); }}>
              Consultar de novo<Preco tipo="Consultar" />
            </AlertDialogAction>
          </DicaBotao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { executar, emAndamento, dialog };
}

/**
 * Abre um PDF guardado. Se ainda não foi baixado da Receita, baixa uma vez (chamada individual ao Serpro) e depois abre.
 * `ocupado` = chave do botão em andamento, para o spinner.
 */
export function useAbrirDefis() {
  const documentos = useDocumentosDefis();
  const link = useLinkDefis();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const abrir = async (d: DefisRow, contactId: string, tipo: 'declaracao' | 'recibo') => {
    setOcupado(`${d.id}:${tipo}`);
    try {
      let l = await link.mutateAsync({ tipo, id: d.id });
      if (!l.ok || !l.url) {
        const b = await documentos.mutateAsync({ contactId, ano: d.ano_calendario });
        if (avisarFalha(b)) return;
        l = await link.mutateAsync({ tipo, id: d.id });
      }
      if (!l.ok || !l.url) { toast.error(l.error ?? 'Não foi possível abrir o arquivo.'); return; }
      const a = document.createElement('a');
      a.href = l.url;
      a.click();
    } catch (e) {
      toast.error(msg(e, 'Não foi possível abrir o arquivo.'));
    } finally {
      setOcupado(null);
    }
  };
  return { ocupado, abrir };
}
