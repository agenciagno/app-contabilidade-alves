import { format, parseISO } from 'date-fns';
import { CheckCircle2, Info, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAtualizarCardCliente, useCardCliente } from '@/hooks/useFiscalCardCliente';

const fmt = (s: string | null) => (s ? format(parseISO(s), 'dd/MM') : '—');

/**
 * Estado do card de tarefas do cliente no box "Tarefas" do Super Perfil: o que falta lançar (cliente novo ou esquecido),
 * o que sobra (obrigação tirada) e datas desatualizadas. Um botão atualiza o card. Segue as obrigações JÁ SALVAS no cadastro.
 */
export function ClienteTarefasStatus({ contactId }: { contactId: string }) {
  const { data: plano, isLoading } = useCardCliente(contactId);
  const atualizar = useAtualizarCardCliente();

  if (isLoading || !plano) return null;

  if (!plano.mes_aprovado) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-md border border-line bg-paper px-3 py-2.5 text-meta text-muted-ink">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>O mês ainda não foi aprovado no Calendário Fiscal. Este cliente entra no lançamento do mês quando você aprovar.</span>
      </div>
    );
  }

  const lancaveis = plano.criar.filter((c) => !c.sem_responsavel);
  const semResp = plano.criar.filter((c) => c.sem_responsavel);
  const remover = plano.remover.filter((r) => r.intocada);
  const preservadas = plano.remover.filter((r) => !r.intocada);
  const nada = lancaveis.length === 0 && remover.length === 0 && plano.datas.length === 0;
  const podeAtualizar = !nada && plano.ativo;

  return (
    <div className="mt-3 space-y-2 rounded-md border border-line bg-paper px-3 py-3 text-meta">
      {nada && semResp.length === 0 && preservadas.length === 0 ? (
        <p className="flex items-center gap-2 text-ok"><CheckCircle2 className="h-4 w-4" /> Card em dia: as tarefas do mês seguem as obrigações salvas.</p>
      ) : (
        <>
          {lancaveis.length > 0 && (
            <p className="text-ink">
              <strong>Falta lançar:</strong> {lancaveis.map((c) => `${c.obrigacao} (${fmt(c.vencimento)})`).join(', ')}.
            </p>
          )}
          {semResp.length > 0 && (
            <p className="flex items-start gap-2 text-warn">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Sem responsável no setor: {semResp.map((c) => c.obrigacao).join(', ')}. Defina o responsável acima e salve.</span>
            </p>
          )}
          {remover.length > 0 && (
            <p className="text-ink"><strong>Sobra (obrigação tirada, card intocado):</strong> {remover.map((r) => r.obrigacao).join(', ')} serão removidas.</p>
          )}
          {preservadas.length > 0 && (
            <p className="text-muted-ink">Já mexidas pela equipe, ficam: {preservadas.map((r) => `${r.obrigacao} (${r.status.replace('_', ' ')})`).join(', ')}.</p>
          )}
          {plano.datas.length > 0 && (
            <p className="text-ink"><strong>Datas desatualizadas:</strong> {plano.datas.map((d) => `${d.obrigacao} ${fmt(d.de)} → ${fmt(d.para)}`).join(', ')}.</p>
          )}
        </>
      )}
      {podeAtualizar && (
        <Button size="sm" onClick={() => atualizar.mutate(contactId)} disabled={atualizar.isPending}>
          {atualizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar card do cliente
        </Button>
      )}
      {!plano.ativo && <p className="text-muted-ink">Cliente inativo: o card não é lançado.</p>}
    </div>
  );
}
