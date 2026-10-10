import { Link, useLocation } from 'react-router-dom';

import { itemSimplesVisivel, itensDoMonitoramento } from '@/components/layout/AppSidebar';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useContadorCaixaNova } from '@/hooks/useSerproCaixaPostal';
import { cn } from '@/lib/utils';

/**
 * Menu do Monitoramento Fiscal no topo das telas (pedido de Gabriel, 09/10/2026, a partir do MonitorHub):
 * os mesmos itens do grupo "Monitoramento" da sidebar, em abas, fixas no topo da área de rolagem.
 * Aparece sozinho em toda rota que pertence ao grupo; fora dele não renderiza nada.
 * A lista e a permissão vêm da sidebar (`itensDoMonitoramento`, `itemSimplesVisivel`): mexeu lá, mexeu aqui.
 */
export function MenuMonitoramento() {
  const { pathname } = useLocation();
  const acesso = useModuleAccess();

  const itens = itensDoMonitoramento();
  const emBaixo = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const noGrupo = itens.some((i) => emBaixo(i.url));
  const visiveis = noGrupo ? itens.filter((i) => itemSimplesVisivel(i, acesso)) : [];
  const mensagensNovas = useContadorCaixaNova(noGrupo && acesso.isModuleVisible('mensagens'));

  if (visiveis.length < 2) return null;

  return (
    // top-16 no mobile: ali a página inteira rola e o cabeçalho (h-16) também é fixo; no desktop quem rola é a área de conteúdo.
    <nav
      aria-label="Monitoramento Fiscal"
      className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 shrink-0 border-b border-line bg-background px-3 sm:px-4 md:top-0 md:px-6 lg:px-8"
    >
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {visiveis.map((item) => {
          // Rota filha com item próprio (Situação Fiscal, Procurações) não acende o item pai.
          const ativo = emBaixo(item.url) && !(item.activeExcept ?? []).some(emBaixo);
          return (
            <li key={item.url} className="shrink-0">
              <Link
                to={item.url}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 transition-colors',
                  ativo ? 'border-ink text-ui-strong text-ink' : 'border-transparent text-nav text-muted-ink hover:text-ink',
                )}
              >
                {item.tituloTopo ?? item.title}
                {item.moduleKey === 'mensagens' && mensagensNovas > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-danger px-1.5 text-badge font-medium text-white">
                    {mensagensNovas}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
