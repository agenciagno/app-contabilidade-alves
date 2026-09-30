import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportarTabela, type FormatoExport, type TabelaExport } from '@/lib/exportarTabela';

const OPCOES: { formato: FormatoExport; label: string }[] = [
  { formato: 'xlsx', label: 'Excel (.xlsx)' },
  { formato: 'pdf', label: 'PDF' },
  { formato: 'csv', label: 'CSV' },
];

/** Botão "Exportar" com Excel, PDF e CSV. `montar` é chamado só no clique, com o filtro que estiver na tela. */
export function ExportarMenu({ montar, disabled }: { montar: () => TabelaExport; disabled?: boolean }) {
  const [gerando, setGerando] = useState(false);

  const exportar = async (formato: FormatoExport) => {
    setGerando(true);
    try {
      await exportarTabela(formato, montar());
    } catch {
      toast.error('Não foi possível gerar o arquivo.');
    } finally {
      setGerando(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || gerando}>
          {gerando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          Exportar <ChevronDown className="ml-1.5 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPCOES.map((o) => (
          <DropdownMenuItem key={o.formato} onSelect={() => exportar(o.formato)}>{o.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
