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
