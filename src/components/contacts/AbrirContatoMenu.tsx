import type { ReactElement } from 'react';
import { ExternalLink, ArrowUpRight } from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from '@/hooks/use-toast';

const urlDoPerfil = (id: string) => `/crm/cliente/${id}`;

/** Abre numa aba nova como um clique em link comum (vários seguidos passam melhor pelo bloqueador de pop-up do que window.open). */
function abrirEmNovaAba(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function abrirPerfisEmNovasAbas(ids: string[]) {
  ids.forEach((id) => abrirEmNovaAba(urlDoPerfil(id)));
  if (ids.length > 1) {
    toast({ title: `Abrindo ${ids.length} abas`, description: 'Se só abrir uma, permita pop-ups deste site no navegador.', duration: 5000 });
  }
}

interface Props {
  contactId: string;
  /** Ids marcados na lista. Com 2 ou mais e este contato entre eles, o menu oferece abrir todos. */
  selectedIds: string[];
  onAbrir: () => void;
  /** Um único elemento (linha da tabela ou um div que envolve o card). */
  children: ReactElement;
}

/**
 * Botão direito no contato: Abrir, Abrir em nova aba e, com vários marcados, Abrir todos em novas abas.
 * Ctrl/Cmd+clique e clique do meio também abrem em aba nova, como num link.
 */
export function AbrirContatoMenu({ contactId, selectedIds, onAbrir, children }: Props) {
  const emLote = selectedIds.length > 1 && selectedIds.includes(contactId);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onClickCapture={(e: React.MouseEvent) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            abrirEmNovaAba(urlDoPerfil(contactId));
          }
        }}
        onAuxClick={(e: React.MouseEvent) => {
          if (e.button === 1) {
            e.preventDefault();
            abrirEmNovaAba(urlDoPerfil(contactId));
          }
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-72">
        <ContextMenuItem onSelect={onAbrir}>
          <ArrowUpRight className="mr-2 h-4 w-4" />
          Abrir
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => abrirEmNovaAba(urlDoPerfil(contactId))}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Abrir em nova aba
        </ContextMenuItem>
        {emLote && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => abrirPerfisEmNovasAbas(selectedIds)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir todos ({selectedIds.length}) em novas abas
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
