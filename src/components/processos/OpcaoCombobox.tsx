import { useState } from 'react';
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ProcessoOpcao, TipoOpcao, useCriarProcessoOpcao } from '@/hooks/useProcessos';

const NOME_TIPO: Record<TipoOpcao, string> = { status: 'status', servico: 'serviço', orgao: 'órgão' };

interface Props {
  tipo: TipoOpcao;
  opcoes: ProcessoOpcao[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  /** Mostra "Sem órgão" no topo da lista (campo opcional). */
  vazioLabel?: string;
}

/** Lista com busca de Status, Serviço ou Órgão; o que não existe a equipe cria ali mesmo ("+ Criar") e já fica selecionado. */
export function OpcaoCombobox({ tipo, opcoes, value, onChange, placeholder, vazioLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const criar = useCriarProcessoOpcao();
  const selecionada = opcoes.find((o) => o.id === value);
  const nomeNovo = busca.trim();
  const jaExiste = opcoes.some((o) => o.nome.trim().toLowerCase() === nomeNovo.toLowerCase());

  // A busca só é limpa ao abrir: limpar ao fechar faz a lista inteira reaparecer durante a animação de saída.
  const escolher = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  const handleCriar = async () => {
    if (nomeNovo.length < 2) return;
    try {
      const nova = await criar.mutateAsync({ tipo, nome: nomeNovo });
      toast.success(`"${nova.nome}" criado e salvo na lista.`);
      escolher(nova.id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao criar o item.');
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (o) setBusca(''); setOpen(o); }}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-10 w-full items-center justify-between rounded-sm border border-line bg-paper px-3 text-left text-ui">
          <span className={cn('truncate', selecionada ? 'text-ink' : 'text-muted-ink-2')}>{selecionada?.nome ?? placeholder}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-ink-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ou criar ${NOME_TIPO[tipo]}...`} className="h-9" value={busca} onValueChange={setBusca} />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            <CommandGroup>
              {vazioLabel && (
                <CommandItem value={`__vazio__ ${vazioLabel}`} onSelect={() => escolher(null)}>
                  <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-muted-ink">{vazioLabel}</span>
                </CommandItem>
              )}
              {opcoes.map((o) => (
                <CommandItem key={o.id} value={o.nome} onSelect={() => escolher(o.id)}>
                  <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{o.nome}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {nomeNovo.length >= 2 && !jaExiste && (
            <div className="border-t p-1">
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start gap-2 text-action" onClick={handleCriar} disabled={criar.isPending}>
                {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Criar "{nomeNovo}"
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
