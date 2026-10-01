import { Link } from 'react-router-dom';

import { DsBadge } from '@/components/ds';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { digitos, ORDEM_NIVEL, ROTULO_NIVEL, type LinhaCarteira, type NivelRisco } from '@/lib/situacaoCarteira';

export const TOM_NIVEL: Record<NivelRisco, 'danger' | 'warn' | 'neutral' | 'ok'> = { critico: 'danger', atencao: 'warn', sem_cobertura: 'neutral', em_dia: 'ok' };

export interface ListaAberta {
  titulo: string;
  descricao?: string;
  linhas: LinhaCarteira[];
  detalhe: (l: LinhaCarteira) => string;
  /** Tela do assunto: o "Ver" abre já filtrada no CNPJ. Sem tela, abre o Super Perfil do cliente. */
  to?: string;
}

/** Lista de clientes por trás de um cartão (mesmo desenho do modal "Empresa · Regime · Detalhe · Ver" da VERI). */
export function ListaClientesSheet({ lista, onClose }: { lista: ListaAberta | null; onClose: () => void }) {
  if (!lista) return null;
  const ordenadas = [...lista.linhas].sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] || a.nome.localeCompare(b.nome, 'pt-BR'));
  const destino = (l: LinhaCarteira) => (lista.to ? `${lista.to}?q=${digitos(l.documento)}` : `/crm/cliente/${l.contact_id}`);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[820px]">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="text-[20px]">{lista.titulo}</SheetTitle>
          <SheetDescription>
            {ordenadas.length} {ordenadas.length === 1 ? 'cliente' : 'clientes'}{lista.descricao ? ` · ${lista.descricao}` : ''}
          </SheetDescription>
        </SheetHeader>

        {ordenadas.length === 0 ? (
          <p className="mt-8 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</p>
        ) : (
          <Table className="mt-6">
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenadas.map((l) => (
                <TableRow key={l.contact_id}>
                  <TableCell>
                    <p className="text-ui-strong text-ink">{l.nome}</p>
                    <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">{l.regimeRotulo}</TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="flex flex-col items-start gap-1">
                      <DsBadge tone={TOM_NIVEL[l.nivel]}>{ROTULO_NIVEL[l.nivel]}</DsBadge>
                      <span className="whitespace-normal break-words text-meta text-muted-ink">{lista.detalhe(l)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to={destino(l)} className="text-ui-strong text-action hover:underline">Ver</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SheetContent>
    </Sheet>
  );
}
