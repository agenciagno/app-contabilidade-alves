import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { filtrarPorResponsavel, type LinhaCarteira } from '@/lib/situacaoCarteira';

/**
 * Filtros do Portal 360° e de CA · Ausências, guardados na URL: `?cliente=<contact_id>` (um cliente) e `?resp=<id|sem>` (um responsável).
 * Um cliente escolhido vale sozinho; sem cliente, vale a carteira do responsável (ou a carteira inteira).
 */
export function useFiltroCarteira(linhas: LinhaCarteira[]) {
  const [params, setParams] = useSearchParams();
  const clienteId = params.get('cliente');
  const resp = params.get('resp');

  const escolhida = clienteId ? linhas.find((l) => l.contact_id === clienteId) ?? null : null;
  const doResponsavel = useMemo(() => filtrarPorResponsavel(linhas, resp), [linhas, resp]);
  const visiveis = useMemo(() => (escolhida ? [escolhida] : doResponsavel), [escolhida, doResponsavel]);

  const atualizar = (mudar: (p: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); mudar(n); return n; }, { replace: true });
  const escolherCliente = (id: string | null) => atualizar((n) => { if (id) n.set('cliente', id); else n.delete('cliente'); });
  const escolherResponsavel = (r: string | null) => atualizar((n) => { if (r) n.set('resp', r); else n.delete('resp'); });

  return { params, atualizar, escolhida, resp, doResponsavel, visiveis, escolherCliente, escolherResponsavel };
}
