import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Building2 } from 'lucide-react';
import { DsBadge } from '@/components/ds';
import { Contact } from '@/hooks/useContacts';
import { getContactDisplayName, getContactStatusTone } from '@/lib/contact-display';
import { getDocumentType, maskPhone } from '@/lib/utils';

const dataBR = (iso?: string | null) => (iso ? format(parseISO(iso.slice(0, 10)), 'dd/MM/yyyy') : '—');

function Dado({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-meta font-semibold text-muted-ink">{label}</dt>
      <dd className="text-ui text-ink">{children}</dd>
    </div>
  );
}

/**
 * Coluna fixa da esquerda do Super Perfil (17/10/2026, no molde do Makro): quem é o cliente em seis dados.
 * Fica parada enquanto as sub-abas da direita rolam; em tela estreita vira um bloco acima das abas.
 */
export function PerfilResumoCard({ contact, inadimplente, onVoltar }: { contact: Contact; inadimplente: boolean; onVoltar: () => void }) {
  const tipoDocumento = getDocumentType(contact.document) === 'CPF' ? 'CPF' : 'CNPJ';

  return (
    <aside className="space-y-5 rounded-lg border border-line bg-paper p-5 lg:sticky lg:top-4">
      <button
        type="button"
        onClick={onVoltar}
        className="flex items-center gap-1.5 text-link text-muted-ink transition-colors hover:text-ink"
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
        <h1 className="text-display break-words text-ink">{getContactDisplayName(contact)}</h1>
        {contact.document && (
          <p className="text-ui text-muted-ink">
            {tipoDocumento}: <span className="font-mono text-mono-sm text-ink">{contact.document}</span>
          </p>
        )}
      </div>

      <dl className="space-y-4 border-t border-line pt-5">
        <Dado label="Telefone">{contact.phone ? maskPhone(contact.phone) : '—'}</Dado>
        <Dado label="Abertura - Receita Federal">{dataBR(contact.data_abertura_receita)}</Dado>
        <Dado label="Início do contrato">{dataBR(contact.data_inicio_contrato)}</Dado>
        <Dado label="Status">
          <DsBadge tone={getContactStatusTone(contact.status_cliente)}>{contact.status_cliente || 'Sem status'}</DsBadge>
        </Dado>
      </dl>
    </aside>
  );
}
