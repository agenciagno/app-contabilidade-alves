import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Building2, Copy, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DsBadge } from '@/components/ds';
import { Contact, TAX_REGIME_LABELS } from '@/hooks/useContacts';
import { useToast } from '@/hooks/use-toast';
import { getContactDisplayName, getContactStatusTone } from '@/lib/contact-display';
import { getDocumentType, maskPhone } from '@/lib/utils';

const dataBR = (iso?: string | null) => (iso ? format(parseISO(iso.slice(0, 10)), 'dd/MM/yyyy') : '');

/** Texto que aparece e que vai para a área de transferência ao clicar. Vazio = dado não preenchido (mostra "—" e não copia). */
function useCopiar() {
  const { toast } = useToast();
  return async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: `${rotulo} copiado!`, duration: 2000 });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };
}

/** Dado do cliente: rótulo + valor. Com valor, o clique copia (o ícone de copiar aparece ao passar o mouse). */
function Dado({ rotulo, texto, copiar, children }: {
  rotulo: string;
  texto: string;
  copiar: (texto: string, rotulo: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[13px] font-semibold text-muted-ink">{rotulo}</dt>
      <dd>
        {texto ? (
          <button
            type="button"
            onClick={() => copiar(texto, rotulo)}
            title="Clique para copiar"
            className="group flex max-w-full items-center gap-1.5 text-left text-[15px] font-medium text-ink transition-colors hover:text-action"
          >
            {children ?? <span className="min-w-0 [overflow-wrap:anywhere]">{texto}</span>}
            <Copy className="h-3 w-3 shrink-0 text-muted-ink opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <span className="text-[15px] font-medium text-muted-ink-2">—</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Coluna da esquerda do Super Perfil (17/10/2026, no molde do Makro): quem é o cliente em oito dados, todos clicáveis (copiam para
 * a área de transferência). Ocupa a altura da tela e fica parada enquanto o conteúdo da direita rola por dentro; em tela estreita vira
 * um bloco acima das abas. A barra azul no rodapé separa o box do fundo da tela.
 */
/** Cadastro feito pelo assistente com etapas ainda não concluídas (puladas ou pendentes). */
export interface CadastroPendente { concluidas: number; total: number; onContinuar: () => void }

export function PerfilResumoCard({ contact, inadimplente, onVoltar, cadastroPendente }: {
  contact: Contact;
  inadimplente: boolean;
  onVoltar: () => void;
  cadastroPendente?: CadastroPendente;
}) {
  const copiar = useCopiar();
  const nome = getContactDisplayName(contact);
  const tipoDocumento = getDocumentType(contact.document) === 'CPF' ? 'CPF' : 'CNPJ';
  const regime = contact.tax_regime ? TAX_REGIME_LABELS[contact.tax_regime] ?? contact.tax_regime : '';
  const status = contact.status_cliente || 'Sem status';

  return (
    <aside className="space-y-5 rounded-lg border border-b-[3px] border-line border-b-action bg-paper p-4 shadow-sm lg:h-full lg:overflow-y-auto">
      <button
        type="button"
        onClick={onVoltar}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-ink transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Contatos
      </button>

      <div className="space-y-3 text-center">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-md ${
            inadimplente ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok'
          }`}
          title={inadimplente ? 'Com cobrança vencida' : 'Em dia'}
        >
          <Building2 className="h-5 w-5" strokeWidth={1.75} />
        </div>
        {/* Largura da coluna é fixa em qualquer sub-aba (a página não rola), então o nome quebra sempre do mesmo jeito. */}
        <h1 className="text-balance break-words text-[18px] font-bold leading-snug tracking-tight text-ink">
          <button
            type="button"
            onClick={() => copiar(nome, 'Nome')}
            title="Clique para copiar"
            className="font-bold transition-colors hover:text-action"
          >
            {nome}
          </button>
        </h1>
        {contact.tipo_cliente === 'Em processo de abertura' && (
          <DsBadge tone="warn">Abertura de empresa</DsBadge>
        )}
        {contact.document && (
          <p className="text-[14px] text-muted-ink">
            {tipoDocumento}:{' '}
            <button
              type="button"
              onClick={() => copiar(contact.document!, tipoDocumento)}
              title="Clique para copiar"
              className="font-mono text-[14px] text-ink transition-colors hover:text-action"
            >
              {contact.document}
            </button>
          </p>
        )}
      </div>

      {cadastroPendente && (
        <div className="space-y-2 rounded-md border border-line bg-bg p-3">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="font-semibold text-ink">Cadastro em andamento</span>
            <span className="tabular-nums text-muted-ink">{cadastroPendente.concluidas} de {cadastroPendente.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
            <div className="h-full rounded-full bg-action" style={{ width: `${(cadastroPendente.concluidas / cadastroPendente.total) * 100}%` }} />
          </div>
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={cadastroPendente.onContinuar}>
            <ListChecks className="h-4 w-4" /> Continuar cadastro
          </Button>
        </div>
      )}

      <dl className="space-y-4 border-t border-line pt-5">
        <Dado rotulo="Telefone" texto={contact.phone ? maskPhone(contact.phone) : ''} copiar={copiar} />
        <Dado rotulo="E-mail" texto={contact.email || ''} copiar={copiar} />
        <Dado rotulo="Regime Tributário" texto={regime} copiar={copiar} />
        <Dado rotulo="Abertura - Receita Federal" texto={dataBR(contact.data_abertura_receita)} copiar={copiar} />
        <Dado rotulo="Início do contrato" texto={dataBR(contact.data_inicio_contrato)} copiar={copiar} />
        <Dado rotulo="Status" texto={status} copiar={copiar}>
          <DsBadge tone={getContactStatusTone(contact.status_cliente)}>{status}</DsBadge>
        </Dado>
      </dl>
    </aside>
  );
}
