import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, type LucideIcon } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { menuEntries } from './AppSidebar';
import { useModuleAccess } from '@/hooks/useModuleAccess';

interface NavResult {
  title: string;
  url: string;
  icon: LucideIcon;
  group: string;
}

/**
 * Busca do header. Indexa o próprio menu (`menuEntries`) e aplica as mesmas
 * regras de permissão — não aparece rota que o usuário não pode abrir.
 */
export function HeaderSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isModuleVisible, isSubItemVisible, passesRoleGate } = useModuleAccess();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const results = useMemo(() => {
    const out: NavResult[] = [];
    let currentSection = 'Navegação';

    menuEntries.forEach((entry) => {
      if (entry.kind === 'section') {
        currentSection = entry.label;
        return;
      }
      if (!passesRoleGate(entry)) return;

      if (entry.kind === 'simple') {
        if (!isModuleVisible(entry.moduleKey)) return;
        out.push({ title: entry.title, url: entry.url, icon: entry.icon, group: currentSection });
        return;
      }

      if (entry.moduleKey && !isModuleVisible(entry.moduleKey)) return;
      entry.items.forEach((item) => {
        if (!passesRoleGate(item)) return;
        const allowed = item.moduleKey
          ? isModuleVisible(item.moduleKey)
          : isSubItemVisible(entry.moduleKey ?? '', item.subKey);
        if (!allowed) return;
        out.push({
          title: `${entry.title} · ${item.title}`,
          url: item.url,
          icon: item.icon,
          group: currentSection,
        });
      });
    });

    return out;
  }, [isModuleVisible, isSubItemVisible, passesRoleGate]);

  const grouped = useMemo(() => {
    const map = new Map<string, NavResult[]>();
    results.forEach((r) => {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    });
    return [...map.entries()];
  }, [results]);

  const go = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-[420px] items-center gap-2 rounded-sm border border-line bg-bg px-3 text-muted-ink-2 transition-colors hover:border-line hover:bg-bg-2 md:flex"
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate text-left text-ui">
          Buscar empresa, CNPJ, obrigação ou lançamento…
        </span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded-[4px] border border-line bg-paper px-1.5 py-0.5 text-meta lg:inline-flex">
          ⌘K
        </kbd>
      </button>

      {/* Botão só com ícone no mobile — o campo largo não cabe no header. */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Buscar"
      >
        <Search className="w-5 h-5" strokeWidth={1.75} />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar cliente, tarefa, lançamento..." />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {grouped.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.title} ${item.url}`}
                  onSelect={() => go(item.url)}
                  className="gap-2"
                >
                  <item.icon className="w-4 h-4 opacity-60" strokeWidth={1.75} />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
