import { useState } from 'react';
import { toast } from 'sonner';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useGerarSitfis, useLinkSitfis, type ResultadoSitfis } from '@/hooks/useSerproSitfis';

const msg = (e: unknown, padrao: string) => (e as Error)?.message || padrao;

/** Erros comuns das respostas do servidor. Devolve true se já tratou (mostrou o aviso). */
function avisarFalha(r: ResultadoSitfis, id?: string | number): boolean {
  if (r.foraDoMonitoramento || r.filial) { toast.error(r.error ?? 'Cliente fora do monitoramento.', { id }); return true; }
  if (r.semProcuracao) { toast.error('Este cliente não tem procuração para a Situação Fiscal.', { id }); return true; }
  if (r.aguarde && !r.ok) { toast.warning(r.error ?? `Espere ${r.aguarde} segundos e clique de novo.`, { id }); return true; }
  if (!r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.', { id }); return true; }
  return false;
}

/**
 * Gera o relatório de UM cliente, sempre por clique, sem lote. A Receita leva alguns segundos para preparar (o servidor espera o tempo
 * que ela informa), então o aviso de "gerando" fica na tela até acabar. Se o cliente teve relatório há pouco, pede confirmação.
 */
export function useGerarRelatorioSitfis() {
  const gerar = useGerarSitfis();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  const executar = async (contactId: string, force = false) => {
    setEmAndamento(contactId);
    const aviso = toast.loading('Pedindo o relatório à Receita... leva alguns segundos.');
    try {
      const r = await gerar.mutateAsync({ contactId, force });
      if (r.recente) { toast.dismiss(aviso); setAConfirmar(contactId); return; }
      if (avisarFalha(r, aviso)) return;
      if (r.processando) { toast.info(`A Receita ainda está preparando o relatório. Clique de novo em ${r.aguarde ?? 10} segundos.`, { id: aviso }); return; }
      if (r.resultado === 'sem_pendencias' && r.confiavel) toast.success('Relatório gerado: sem pendências.', { id: aviso });
      else if (r.resultado === 'com_pendencias' && r.confiavel) toast.warning('Relatório gerado: há pendências. Abra o PDF para ver.', { id: aviso });
      else toast.warning(`Relatório gerado, mas não consegui ler com segurança${r.avisos?.[0] ? ` (${r.avisos[0]})` : ''}. Abra o PDF para conferir.`, { id: aviso });
    } catch (e) {
      toast.error(msg(e, 'Falha na consulta. Tente novamente em instantes.'), { id: aviso });
    } finally {
      setEmAndamento(null);
    }
  };

  const dialog = (
    <AlertDialog open={!!aConfirmar} onOpenChange={(o) => !o && setAConfirmar(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Este cliente teve relatório há pouco</AlertDialogTitle>
          <AlertDialogDescription>
            Só vale a pena gerar de novo se algo mudou na Receita depois do último relatório. Cada relatório emitido é cobrado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem gerar.">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo="Emitir" texto="Pede à Receita um relatório novo, mesmo já tendo gerado há pouco.">
            <AlertDialogAction onClick={() => { const id = aConfirmar!; setAConfirmar(null); executar(id, true); }}>
              Gerar de novo<Preco tipo="Emitir" />
            </AlertDialogAction>
          </DicaBotao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { executar, emAndamento, dialog };
}

/** Abre o PDF de um relatório já guardado (sem chamada à Receita). */
export function useAbrirRelatorioSitfis() {
  const link = useLinkSitfis();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const abrir = async (id: string) => {
    setOcupado(id);
    try {
      const l = await link.mutateAsync({ id });
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
