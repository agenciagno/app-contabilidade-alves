import { Check, ChevronLeft, ChevronRight, Loader2, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DsBadge } from '@/components/ds';
import { cn } from '@/lib/utils';
import type { EtapaCadastro, FluxoCadastro, StatusEtapa } from '@/hooks/useOnboardingCadastro';

interface Etapa { etapa: EtapaCadastro; rotulo: string; ajuda: string }

/** Dica extra da etapa, conforme o tipo de cliente. */
function dica(etapa: EtapaCadastro, fluxo: FluxoCadastro | null) {
  if (fluxo === 'abertura') {
    if (etapa === 'cadastro') return 'Empresa em abertura: deixe o CNPJ vazio e preencha quando a empresa sair.';
    if (etapa === 'fiscal') return 'Marque o regime pretendido, se já souber. Inscrições e CNAE entram depois da abertura.';
    if (etapa === 'operacional') return 'Preencha responsáveis e o início do contrato. Tarefas: deixe para quando sair o CNPJ.';
  }
  if (etapa === 'financeiro') return 'Para preencher, clique no lápis de "Configurações de Cobrança".';
  return null;
}

/**
 * Barra do assistente de cadastro (17/10/2026), em cima das sub-abas do Super Perfil: etapas clicáveis com o status de cada uma,
 * Voltar, Pular etapa e Salvar e continuar. Etapa pulada fica marcada para depois; nenhuma etapa é obrigatória.
 */
export function AssistenteCadastroBarra({
  etapas, atual, fluxo, statusDe, salvando, onIr, onVoltar, onPular, onProxima, onSair,
}: {
  etapas: Etapa[];
  atual: EtapaCadastro;
  fluxo: FluxoCadastro | null;
  statusDe: (etapa: string) => StatusEtapa | null;
  salvando: boolean;
  onIr: (etapa: EtapaCadastro) => void;
  onVoltar: () => void;
  onPular: () => void;
  onProxima: () => void;
  onSair: () => void;
}) {
  const indice = Math.max(0, etapas.findIndex(e => e.etapa === atual));
  const etapa = etapas[indice];
  const ultima = indice === etapas.length - 1;
  const textoDica = etapa ? dica(etapa.etapa, fluxo) : null;

  return (
    <section className="shrink-0 space-y-3 rounded-lg border border-line bg-paper p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Cadastro de novo cliente</h2>
          {fluxo && <DsBadge tone={fluxo === 'abertura' ? 'warn' : 'info'}>{fluxo === 'abertura' ? 'Abertura de empresa' : 'Com CNPJ'}</DsBadge>}
          <span className="text-meta text-muted-ink">Etapa {indice + 1} de {etapas.length}</span>
        </div>
        <button type="button" onClick={onSair} className="text-[13px] font-semibold text-muted-ink transition-colors hover:text-ink">
          Sair e continuar depois
        </button>
      </div>

      <ol className="flex flex-wrap gap-1.5">
        {etapas.map((e, i) => {
          const status = statusDe(e.etapa);
          const ativa = e.etapa === atual;
          return (
            <li key={e.etapa}>
              <button
                type="button"
                onClick={() => onIr(e.etapa)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium transition-colors',
                  ativa ? 'border-action bg-action text-on-action'
                    : status === 'concluido' ? 'border-line bg-ok-soft text-ink hover:border-action'
                    : status === 'pulado' ? 'border-line bg-warn-soft text-ink hover:border-action'
                    : 'border-line bg-paper text-muted-ink hover:border-action hover:text-ink',
                )}
                title={status === 'pulado' ? 'Pulada: ficou para depois' : status === 'concluido' ? 'Concluída' : 'Pendente'}
              >
                {status === 'concluido' && !ativa ? <Check className="h-3.5 w-3.5 text-ok" /> : <span className="tabular-nums">{i + 1}</span>}
                {e.rotulo}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="min-w-0 text-[13px]">
          <p className="text-ink">{etapa?.ajuda}</p>
          {textoDica && <p className="text-muted-ink">{textoDica}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {indice > 0 && (
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onVoltar} disabled={salvando}>
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onPular} disabled={salvando}>
            <SkipForward className="h-4 w-4" /> Pular etapa
          </Button>
          <Button type="button" size="sm" className="gap-1.5" onClick={onProxima} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : ultima ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {ultima ? 'Salvar e concluir' : 'Salvar e continuar'}
          </Button>
        </div>
      </div>
    </section>
  );
}
