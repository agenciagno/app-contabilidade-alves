import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { digitos, type LinhaCarteira } from '@/lib/situacaoCarteira';

export const formatarCnpj = (d: string) => {
  const n = digitos(d);
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

interface Props {
  linhas: LinhaCarteira[];
  /** contact_id do cliente escolhido; null = carteira inteira. */
  valor: string | null;
  onChange: (contactId: string | null) => void;
}

/** Filtro de cliente do Portal 360° e de CA · Ausências: busca por nome ou CNPJ. O valor vive na URL (`?cliente=`). */
export function ClienteFiltro({ linhas, valor, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const escolhido = valor ? linhas.find((l) => l.contact_id === valor) ?? null : null;
  const ordenadas = [...linhas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <div className="flex items-center gap-2">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={aberto} className="w-[340px] justify-between font-normal">
            <span className="truncate">{escolhido ? escolhido.nome : 'Todos os clientes'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-ink-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar por nome ou CNPJ" />
            <CommandList>
              <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="todos os clientes" onSelect={() => { onChange(null); setAberto(false); }}>
                  <Check className={cn('mr-2 h-4 w-4', valor ? 'opacity-0' : 'opacity-100')} />
                  Todos os clientes
                </CommandItem>
                {ordenadas.map((l) => (
                  <CommandItem key={l.contact_id} value={`${l.nome} ${digitos(l.documento)}`} onSelect={() => { onChange(l.contact_id); setAberto(false); }}>
                    <Check className={cn('mr-2 h-4 w-4', valor === l.contact_id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{l.nome}</span>
                    <span className="ml-auto pl-3 font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {valor && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)} aria-label="Limpar filtro de cliente">
          <X className="mr-1 h-4 w-4" /> Limpar
        </Button>
      )}
    </div>
  );
}
