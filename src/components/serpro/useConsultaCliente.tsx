import { useState } from 'react';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConsultarCaixa } from '@/hooks/useSerproCaixaPostal';

/**
 * Consulta da lista de UM cliente (sem ciência) sempre disparada por clique.
 * Se o cliente foi consultado há pouco, pede confirmação antes de consultar de novo.
 * O valor do clique aparece no botão e na dica só para administrador e super administrador (`Preco`, `DicaBotao`); o total fica em Tech > Consumo Serpro.
 * Usado pela linha da tabela (botão Consultar) e pelo painel do cliente.
 */
export function useConsultaCliente() {
  const consultar = useConsultarCaixa();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);
  const [proximo, setProximo] = useState<Record<string, string | null>>({});

  const executar = async (contactId: string, force = false, ponteiro?: string | null) => {
    setEmAndamento(contactId);
    try {
      const r = await consultar.mutateAsync({ contactId, force, ponteiro });
      if (r.recente) { setAConfirmar(contactId); return; }
      if (r.semProcuracao) { toast.error('Este cliente não tem procuração para a Caixa Postal.'); return; }
      if (!r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return; }
      setProximo((p) => ({ ...p, [contactId]: r.ultima_pagina ? null : (r.ponteiro_proxima ?? null) }));
      toast.success(`${r.baixadas ?? 0} mensagens baixadas (${r.novas ?? 0} novas)`);
    } catch {
      toast.error('Falha na consulta. Tente novamente em instantes.');
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
            Só vale a pena consultar de novo se o cliente avisou de uma mensagem que ainda não apareceu aqui.
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

  return { executar, emAndamento, proximo, dialog };
}
