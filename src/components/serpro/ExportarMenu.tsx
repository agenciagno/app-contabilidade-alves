import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportarTabela, type FormatoExport, type TabelaExport } from '@/lib/exportarTabela';

const OPCOES: { formato: FormatoExport; label: string }[] = [
  { formato: 'xlsx', label: 'Excel (.xlsx)' },
  { formato: 'pdf', label: 'PDF' },
  { formato: 'csv', label: 'CSV' },
];

function lerOcultas(chave: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
function gravarOcultas(chave: string, ocultas: string[]) {
  try { localStorage.setItem(chave, JSON.stringify(ocultas)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

/**
 * Botão "Exportar" com Excel, PDF e CSV. `montar` é chamado só no clique, com o filtro que estiver na tela.
 * Com `escolherColunas`, o menu ganha a lista de colunas (a escolha fica guardada neste navegador, por tabela).
 */
export function ExportarMenu({ montar, disabled, escolherColunas }: { montar: () => TabelaExport; disabled?: boolean; escolherColunas?: boolean }) {
  const [gerando, setGerando] = useState(false);
  // Só os nomes das colunas e o nome-base do arquivo, que não mudam com o filtro.
  const base = useMemo(() => { const t = montar(); return { colunas: t.colunas, chave: `exportar-colunas:${t.arquivo}` }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [ocultas, setOcultas] = useState<string[]>(() => (escolherColunas ? lerOcultas(base.chave) : []));

  const alternar = (coluna: string, visivel: boolean) => {
    const proximas = visivel ? ocultas.filter((c) => c !== coluna) : [...ocultas, coluna];
    if (proximas.length >= base.colunas.length) { toast.error('Deixe pelo menos uma coluna.'); return; }
    setOcultas(proximas);
    gravarOcultas(base.chave, proximas);
  };

  const exportar = async (formato: FormatoExport) => {
    setGerando(true);
    try {
      const t = montar();
      const manter = t.colunas.map((c, i) => (ocultas.includes(c) ? -1 : i)).filter((i) => i >= 0);
      await exportarTabela(formato, {
        ...t,
        colunas: manter.map((i) => t.colunas[i]),
        linhas: t.linhas.map((l) => manter.map((i) => l[i] ?? '')),
      });
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
        {escolherColunas && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-meta text-muted-ink-2">Colunas do arquivo</DropdownMenuLabel>
            {base.colunas.map((c) => (
              <DropdownMenuCheckboxItem
                key={c}
                checked={!ocultas.includes(c)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(v) => alternar(c, !!v)}
              >
                {c}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
