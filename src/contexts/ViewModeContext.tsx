import { createContext, useContext, useState, ReactNode } from 'react';

/**
 * Modo de visualização do super admin: Sistema Interno (operação da CA) ou
 * Sistema Externo (o produto vendido a escritórios). É estado de UI — filtra o
 * que é renderizado (menu, rotas, busca) e NUNCA altera permissão real: os
 * guards continuam validando papel/plano/audiência de verdade por baixo.
 *
 * Para quem não é super admin o valor é irrelevante — a audiência efetiva
 * vem sempre da empresa (ver useAudience).
 */
export type ViewMode = 'internal' | 'external';

const STORAGE_KEY = 'ca-view-mode';

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextValue>({
  viewMode: 'internal',
  setViewMode: () => {},
});

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    localStorage.getItem(STORAGE_KEY) === 'external' ? 'external' : 'internal',
  );

  const setViewMode = (mode: ViewMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    setViewModeState(mode);
  };

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
