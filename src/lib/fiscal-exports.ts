import * as XLSX from 'xlsx';

export interface ExportTask {
  id: string;
  status: string;
  due_date: string | null;
  fiscal_due_date: string | null;
  responsible_id: string | null;
  contact_id: string | null;
  title: string | null;
  obligation_name?: string | null;
}
export interface ExportContact { id: string; name: string; document?: string | null }
export interface ExportProfile { id: string; full_name: string | null; email?: string | null }

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};
const isLate = (t: ExportTask, today: string) =>
  t.status !== 'concluido' && !!t.due_date && t.due_date < today;

const statusLabel = (s: string) => ({
  a_fazer: 'A Fazer',
  em_progresso: 'Em Progresso',
  aguardando_cliente: 'Aguardando Cliente',
  concluido: 'Concluído',
} as Record<string, string>)[s] ?? s;

function saveBook(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName);
}

export function exportProductivity(tasks: ExportTask[], profiles: ExportProfile[], year: number, month: number) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = profiles.map((p) => {
    const own = tasks.filter((t) => t.responsible_id === p.id);
    const total = own.length;
    const concluidas = own.filter((t) => t.status === 'concluido').length;
    const atrasadas = own.filter((t) => isLate(t, today)).length;
    const pendentes = total - concluidas;
    const noPrazo = total > 0 ? Math.round(((total - atrasadas) / total) * 100) : 0;
    const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    return {
      Colaborador: p.full_name || p.email || '—',
      'Total de Tarefas': total,
      Concluídas: concluidas,
      Pendentes: pendentes,
      Atrasadas: atrasadas,
      '% Concluído': `${pct}%`,
      '% No Prazo': `${noPrazo}%`,
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Produtividade');
  saveBook(wb, `relatorio-produtividade-${String(month).padStart(2, '0')}${year}.xlsx`);
}

export function exportCompliance(
  tasks: ExportTask[],
  contacts: ExportContact[],
  profiles: ExportProfile[],
  year: number,
  month: number,
) {
  const cmap = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const pmap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const rows = tasks.map((t) => {
    const c = t.contact_id ? cmap[t.contact_id] : undefined;
    const r = t.responsible_id ? pmap[t.responsible_id] : undefined;
    return {
      Cliente: c?.name ?? '—',
      'CNPJ/CPF': c?.document ?? '',
      Obrigação: t.obligation_name ?? t.title ?? '—',
      'Vencimento Fiscal': fmtDate(t.fiscal_due_date),
      'Entrega Interna': fmtDate(t.due_date),
      Responsável: r?.full_name || r?.email || '—',
      Status: statusLabel(t.status),
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Compliance');
  saveBook(wb, `relatorio-compliance-${String(month).padStart(2, '0')}${year}.xlsx`);
}

export function exportCriticalDueDates(
  tasks: ExportTask[],
  contacts: ExportContact[],
  profiles: ExportProfile[],
  year: number,
  month: number,
) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const max = new Date(); max.setDate(max.getDate() + 15);
  const maxIso = max.toISOString().slice(0, 10);
  const cmap = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const pmap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const filtered = tasks
    .filter((t) => t.status !== 'concluido' && t.due_date && t.due_date >= todayIso && t.due_date <= maxIso)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const rows = filtered.map((t) => {
    const c = t.contact_id ? cmap[t.contact_id] : undefined;
    const r = t.responsible_id ? pmap[t.responsible_id] : undefined;
    const days = Math.ceil((new Date(t.due_date!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return {
      Cliente: c?.name ?? '—',
      Obrigação: t.obligation_name ?? t.title ?? '—',
      'Entrega Interna': fmtDate(t.due_date),
      'Vencimento Fiscal': fmtDate(t.fiscal_due_date),
      Responsável: r?.full_name || r?.email || '—',
      Status: statusLabel(t.status),
      'Dias p/ Vencer': days,
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vencimentos Críticos');
  saveBook(wb, `relatorio-vencimentos-criticos-${String(month).padStart(2, '0')}${year}.xlsx`);
}

export function exportExecutive(
  tasks: ExportTask[],
  contacts: ExportContact[],
  profiles: ExportProfile[],
  year: number,
  month: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  const total = tasks.length;
  const concluidas = tasks.filter((t) => t.status === 'concluido').length;
  const atrasadas = tasks.filter((t) => isLate(t, today)).length;
  const clientes = new Set(tasks.map((t) => t.contact_id).filter(Boolean)).size;
  const pctC = total ? Math.round((concluidas / total) * 100) : 0;
  const pctA = total ? Math.round((atrasadas / total) * 100) : 0;

  const counts = new Map<string, { total: number; atrasadas: number }>();
  tasks.forEach((t) => {
    const k = t.responsible_id ?? '__none__';
    const e = counts.get(k) ?? { total: 0, atrasadas: 0 };
    e.total += 1;
    if (isLate(t, today)) e.atrasadas += 1;
    counts.set(k, e);
  });
  const pmap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const nameOf = (id: string) => (id === '__none__' ? 'Sem responsável' : pmap[id]?.full_name || pmap[id]?.email || '—');
  let topTasksId = ''; let topTasksN = -1;
  let topLateId = ''; let topLateN = -1;
  counts.forEach((v, k) => {
    if (v.total > topTasksN) { topTasksN = v.total; topTasksId = k; }
    if (v.atrasadas > topLateN) { topLateN = v.atrasadas; topLateId = k; }
  });

  const resumo = [
    { Indicador: 'Total de Clientes', Valor: clientes },
    { Indicador: 'Total de Tarefas', Valor: total },
    { Indicador: '% Concluído', Valor: `${pctC}%` },
    { Indicador: '% Atrasado', Valor: `${pctA}%` },
    { Indicador: 'Colaborador com mais tarefas', Valor: topTasksId ? `${nameOf(topTasksId)} (${topTasksN})` : '—' },
    { Indicador: 'Colaborador com mais atrasos', Valor: topLateId ? `${nameOf(topLateId)} (${topLateN})` : '—' },
  ];
  const cmap = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const detail = tasks.map((t) => {
    const c = t.contact_id ? cmap[t.contact_id] : undefined;
    const r = t.responsible_id ? pmap[t.responsible_id] : undefined;
    return {
      Cliente: c?.name ?? '—',
      'CNPJ/CPF': c?.document ?? '',
      Obrigação: t.obligation_name ?? t.title ?? '—',
      'Vencimento Fiscal': fmtDate(t.fiscal_due_date),
      'Entrega Interna': fmtDate(t.due_date),
      Responsável: r?.full_name || r?.email || '—',
      Status: statusLabel(t.status),
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Detalhamento');
  saveBook(wb, `relatorio-executivo-${String(month).padStart(2, '0')}${year}.xlsx`);
}
