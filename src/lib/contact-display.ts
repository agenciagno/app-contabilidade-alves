import type { BadgeTone } from '@/components/ds';

// Cor do badge de status_cliente — usado no card da listagem e no header do Super Perfil.
const CONTACT_STATUS_TONE: Record<string, BadgeTone> = {
  Ativo: 'ok',
  'Suspensa - Contabilidade': 'warn',
  'Suspensa - Receita Federal': 'warn',
  'Inapta - Receita Federal': 'danger',
  'Cancelada - Receita Federal': 'danger',
  Baixada: 'neutral',
  'Ex-cliente': 'neutral',
  'Ex-Colaborador': 'neutral',
};

export function getContactStatusTone(status?: string | null): BadgeTone {
  return (status && CONTACT_STATUS_TONE[status]) || 'neutral';
}

// Helper para obter o nome de exibição de um contato, com fallback.
export function getContactDisplayName(c: {
  display_name?: string | null;
  nome_fantasia?: string | null;
  razao_social?: string | null;
  name?: string | null;
} | null | undefined): string {
  if (!c) return '';
  return (
    (c.display_name && c.display_name.trim()) ||
    (c.nome_fantasia && c.nome_fantasia.trim()) ||
    (c.razao_social && c.razao_social.trim()) ||
    (c.name && c.name.trim()) ||
    ''
  );
}

// Mesma ideia, mas pro Financeiro: prioriza o nome legal (Razão Social) sobre o
// de exibição — Lançamentos, Pagar/Receber, Boletos, extratos e exports.
export function getContactLegalName(c: {
  display_name?: string | null;
  nome_fantasia?: string | null;
  razao_social?: string | null;
  name?: string | null;
} | null | undefined): string {
  if (!c) return '';
  return (
    (c.razao_social && c.razao_social.trim()) ||
    (c.nome_fantasia && c.nome_fantasia.trim()) ||
    (c.display_name && c.display_name.trim()) ||
    (c.name && c.name.trim()) ||
    ''
  );
}
