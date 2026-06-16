import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export interface SearchableOption {
  value: string;
  label: string;
}

interface Props {
  value: string; // 'all' or option value
  onChange: (v: string) => void;
  options: SearchableOption[];
  placeholder: string;
  allLabel?: string;
  width?: string; // tailwind width class
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  allLabel = 'Todos',
  width = 'w-[200px]',
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const label = value === 'all' ? placeholder : selected?.label ?? placeholder;
  const isActive = value !== 'all';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-9 justify-between gap-2 bg-background/50 border-border/50 font-normal',
            width,
            !isActive && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." className="h-9" />
          <CommandList>
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  onChange('all');
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')} />
                {allLabel}
              </CommandItem>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {isActive && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs gap-2"
                onClick={() => {
                  onChange('all');
                  setOpen(false);
                }}
              >
                <X className="h-3.5 w-3.5" /> Limpar
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
