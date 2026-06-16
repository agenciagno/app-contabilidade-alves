import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RtStatus = 'nao_iniciado' | 'em_analise' | 'adequado' | 'acao_necessaria';

interface RtItems {
  cnae_compat: boolean;
  cadastro_ok: boolean;
  simulacao: boolean;
  informado: boolean;
  regime_revisado: boolean;
}

interface RtState {
  status: RtStatus;
  items: RtItems;
  updated_at: string;
}

const STATUS_META: Record<RtStatus, { label: string; className: string }> = {
  nao_iniciado: { label: 'Não iniciado', className: 'bg-muted text-muted-foreground border-border' },
  em_analise: { label: 'Em análise', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40' },
  adequado: {
    label: 'Adequado',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
  },
  acao_necessaria: { label: 'Ação necessária', className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40' },
};

const CHECKLIST_ITEMS: { key: keyof RtItems; label: string }[] = [
  { key: 'cnae_compat', label: 'CNAE compatível com alíquotas IBS/CBS' },
  { key: 'cadastro_ok', label: 'Cadastro atualizado no sistema' },
  { key: 'simulacao', label: 'Simulação de impacto tributário realizada' },
  { key: 'informado', label: 'Cliente informado sobre mudanças' },
  { key: 'regime_revisado', label: 'Regime tributário revisado pós-RT' },
];

const emptyItems = (): RtItems => ({
  cnae_compat: false,
  cadastro_ok: false,
  simulacao: false,
  informado: false,
  regime_revisado: false,
});

const keyFor = (companyId: string, contactId: string) => `rt-checklist:${companyId}:${contactId}`;

function loadState(companyId: string, contactId: string): RtState {
  try {
    const raw = localStorage.getItem(keyFor(companyId, contactId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        status: parsed.status ?? 'nao_iniciado',
        items: { ...emptyItems(), ...(parsed.items ?? {}) },
        updated_at: parsed.updated_at ?? new Date().toISOString(),
      };
    }
  } catch {}
  return { status: 'nao_iniciado', items: emptyItems(), updated_at: new Date().toISOString() };
}

function saveState(companyId: string, contactId: string, state: RtState) {
  try {
    localStorage.setItem(keyFor(companyId, contactId), JSON.stringify(state));
  } catch {}
}

interface ContactRow {
  id: string;
  name: string;
  tax_regime: string | null;
  cnae_principal: string | null;
}

export function RtChecklistDialog({ open, onOpenChange }: Props) {
  const { company, isLoading: companyLoading } = useCompany();
  const companyId = company?.id ?? '';
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, RtState>>({});

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line no-console
      console.log('RtChecklistDialog companyId:', companyId, 'companyLoading:', companyLoading);
    }
  }, [open, companyId, companyLoading]);

  const { data: contacts = [], isLoading } = useQuery<ContactRow[]>({
    queryKey: ['rt-checklist-contacts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, tax_regime, cnae_principal')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
    enabled: !!companyId && open,
  });

  useEffect(() => {
    if (!open || !companyId) return;
    const next: Record<string, RtState> = {};
    contacts.forEach((c) => {
      next[c.id] = loadState(companyId, c.id);
    });
    setStates(next);
  }, [open, companyId, contacts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.cnae_principal ?? '').toLowerCase().includes(term) ||
        (c.tax_regime ?? '').toLowerCase().includes(term),
    );
  }, [contacts, search]);

  const verifiedCount = Object.values(states).filter((s) => s.status !== 'nao_iniciado').length;
  const totalCount = contacts.length;
  const pct = totalCount > 0 ? (verifiedCount / totalCount) * 100 : 0;

  const updateState = (contactId: string, patch: Partial<RtState>) => {
    setStates((prev) => {
      const current = prev[contactId] ?? loadState(companyId, contactId);
      const merged: RtState = {
        status: patch.status ?? current.status,
        items: patch.items ?? current.items,
        updated_at: new Date().toISOString(),
      };
      // Auto-promote to 'adequado' when all items are true
      const allDone = Object.values(merged.items).every(Boolean);
      if (allDone) merged.status = 'adequado';
      saveState(companyId, contactId, merged);
      return { ...prev, [contactId]: merged };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>Checklist de Adequação à Reforma Tributária</DialogTitle>
          <DialogDescription>
            Acompanhe a adequação de cada cliente aos requisitos do IBS/CBS. Os dados são salvos localmente neste
            navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Input
              placeholder="Buscar cliente, regime, CNAE…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="text-sm">
              <strong>{verifiedCount}</strong> de <strong>{totalCount}</strong> clientes verificados
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="px-6 pb-6 overflow-y-auto space-y-1.5">
          {companyLoading || !companyId ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando empresa...</p>
          ) : isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente encontrado.</p>
          ) : (
            filtered.map((c) => {
              const s = states[c.id] ?? loadState(companyId, c.id);
              const meta = STATUS_META[s.status];
              const isOpen = expanded === c.id;
              const doneCount = Object.values(s.items).filter(Boolean).length;

              return (
                <div key={c.id} className="border rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 text-left transition-colors"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <span className="text-xs text-muted-foreground truncate">{c.tax_regime ?? '—'}</span>
                      <span className="text-xs text-muted-foreground truncate">CNAE {c.cnae_principal ?? '—'}</span>
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-muted-foreground">
                          {doneCount}/{CHECKLIST_ITEMS.length}
                        </span>
                        <Badge variant="outline" className={cn('text-[10px]', meta.className)}>
                          {meta.label}
                        </Badge>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t bg-muted/20 space-y-3">
                      <div className="flex items-center gap-2 pt-2">
                        <span className="text-xs text-muted-foreground">Status manual:</span>
                        <Select
                          value={s.status}
                          onValueChange={(v) => updateState(c.id, { status: v as RtStatus })}
                        >
                          <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_META) as RtStatus[]).map((k) => (
                              <SelectItem key={k} value={k}>
                                {STATUS_META[k].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <ul className="space-y-1.5">
                        {CHECKLIST_ITEMS.map((item) => {
                          const checked = s.items[item.key];
                          return (
                            <li key={item.key} className="flex items-center gap-2">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  updateState(c.id, {
                                    items: { ...s.items, [item.key]: !!v },
                                  })
                                }
                              />
                              <span className={cn('text-sm', checked && 'text-muted-foreground')}>
                                {checked ? (
                                  <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 text-emerald-600" />
                                ) : (
                                  <Circle className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                )}
                                {item.label}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
