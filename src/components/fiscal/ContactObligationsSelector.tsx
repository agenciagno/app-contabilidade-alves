import { useState } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ObligationOption {
  id: string;
  name: string;
  is_custom?: boolean | null;
}

interface Props {
  options: ObligationOption[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function ContactObligationsSelector({ options, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const remove = (id: string) => {
    const next = new Set(selectedIds);
    next.delete(id);
    onChange(next);
  };

  const selectedList = options.filter((o) => selectedIds.has(o.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', selectedIds.size === 0 && 'text-muted-foreground')}>
              {selectedIds.size === 0
                ? 'Selecionar obrigações...'
                : `${selectedIds.size} obrigação${selectedIds.size === 1 ? '' : 'ões'} selecionada${selectedIds.size === 1 ? '' : 's'}`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar obrigação..." className="h-9" />
            <CommandList>
              <CommandEmpty>Nenhuma obrigação.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const checked = selectedIds.has(opt.id);
                  return (
                    <CommandItem
                      key={opt.id}
                      value={opt.name}
                      onSelect={() => toggle(opt.id)}
                    >
                      <Check className={cn('mr-2 h-4 w-4', checked ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate flex-1">{opt.name}</span>
                      {opt.is_custom && (
                        <Badge variant="outline" className="ml-2 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0">
                          Personalizada
                        </Badge>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedList.map((o) => (
            <Badge key={o.id} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5">
              <span className="text-xs">{o.name}</span>
              <button
                type="button"
                onClick={() => remove(o.id)}
                className="rounded-full hover:bg-muted-foreground/10 p-0.5"
                aria-label={`Remover ${o.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
