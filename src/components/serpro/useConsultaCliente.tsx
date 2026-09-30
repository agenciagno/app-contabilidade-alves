import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CUSTO_CONSULTA_LISTA, useConsultarCaixa } from '@/hooks/useSerproCaixaPostal';

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Consulta da lista de UM cliente (R$ 0,24, sem ciência) sempre disparada por clique.
 * Se o cliente foi consultado há pouco, pede confirmação antes de gastar de novo.
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
      toast.success(`${r.baixadas ?? 0} mensagens baixadas (${r.novas ?? 0} novas)${r.cobravel ? ` · ${reais(CUSTO_CONSULTA_LISTA)}` : ''}`);
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
            Consultar de novo gera uma nova cobrança de {reais(CUSTO_CONSULTA_LISTA)}. Só vale a pena se o cliente avisou de uma
            mensagem que ainda não apareceu aqui.
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

  return { executar, emAndamento, proximo, dialog };
}
