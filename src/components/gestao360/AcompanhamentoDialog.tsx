import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  SITUACOES_ACOMP, useSalvarAcompanhamento, type Acompanhamento, type SituacaoAcomp,
} from '@/hooks/useAcompanhamentoAusencia';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import { rotuloAusencia, type Ausencia, type LinhaCarteira } from '@/lib/situacaoCarteira';

const MESMO_DO_CLIENTE = '__cliente__';
const SEM_RESPONSAVEL = '__nenhum__';

interface Props {
  linha: LinhaCarteira;
  ausencia: Ausencia;
  atual?: Acompanhamento;
  onClose: () => void;
}

/** Acompanhamento de uma declaração em falta: situação, responsável e nota. Só anotação: não muda a contagem de "em falta". */
export function AcompanhamentoDialog({ linha, ausencia, atual, onClose }: Props) {
  const [situacao, setSituacao] = useState<SituacaoAcomp>(atual?.situacao ?? 'a_tratar');
  const [responsavel, setResponsavel] = useState<string>(atual ? (atual.responsavel_id ?? SEM_RESPONSAVEL) : MESMO_DO_CLIENTE);
  const [nota, setNota] = useState(atual?.nota ?? '');
  const equipe = useTeamProfiles();
  const salvar = useSalvarAcompanhamento();

  const quemAtualizou = atual?.atualizado_por ? (equipe.data ?? []).find((p) => p.id === atual.atualizado_por)?.full_name : null;

  const gravar = async () => {
    try {
      await salvar.mutateAsync({
        contactId: linha.contact_id, obrigacao: ausencia.obrigacao, competencia: ausencia.competencia, situacao, nota,
        responsavelId: responsavel === MESMO_DO_CLIENTE ? linha.responsavel?.id ?? null : responsavel === SEM_RESPONSAVEL ? null : responsavel,
      });
      toast.success('Acompanhamento salvo.');
      onClose();
    } catch (e) {
      toast.error((e as Error)?.message || 'Não foi possível salvar.');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px] p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">Acompanhamento</DialogTitle>
          <p className="text-meta text-muted-ink">{linha.nome} · {rotuloAusencia(ausencia)}</p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-ink">Situação</Label>
            <Select value={situacao} onValueChange={(v) => setSituacao(v as SituacaoAcomp)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SITUACOES_ACOMP.map((s) => <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Responsável por esta pendência</Label>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MESMO_DO_CLIENTE}>{linha.responsavel ? `Mesmo do cliente (${linha.responsavel.nome})` : 'Mesmo do cliente (sem responsável)'}</SelectItem>
                {(equipe.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? 'Sem nome'}</SelectItem>)}
                <SelectItem value={SEM_RESPONSAVEL}>Ninguém</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Nota</Label>
            <Textarea rows={4} value={nota} maxLength={1000} onChange={(e) => setNota(e.target.value)} className="text-[13px]" placeholder="Ex.: cliente disse que manda as notas na sexta" />
            <p className="text-meta text-muted-ink-2">
              {atual ? `Atualizado em ${format(new Date(atual.atualizado_em), 'dd/MM/yyyy HH:mm')}${quemAtualizou ? ` por ${quemAtualizou}` : ''}. ` : ''}
              É só anotação: a pendência continua na lista até a declaração aparecer na próxima leitura da Receita.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={gravar} disabled={salvar.isPending}>{salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
