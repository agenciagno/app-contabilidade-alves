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

/**
 * "Ver como cliente": dentro do modo externo, simula o plano de um tenant no
 * menu/busca (preview VISUAL — os dados continuam sendo os da CA; RLS impede
 * ver dado do cliente, e é assim que deve ser).
 */
export interface PreviewTenant {
  id: string;
  name: string;
  planModules: string[];
}

const STORAGE_KEY = 'ca-view-mode';

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  previewTenant: PreviewTenant | null;
  setPreviewTenant: (tenant: PreviewTenant | null) => void;
}

const ViewModeContext = createContext<ViewModeContextValue>({
  viewMode: 'internal',
  setViewMode: () => {},
  previewTenant: null,
  setPreviewTenant: () => {},
});

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    localStorage.getItem(STORAGE_KEY) === 'external' ? 'external' : 'internal',
  );
  // Preview não persiste: recarregou, voltou ao normal — menor chance de
  // esquecer um "modo fantasma" ligado.
  const [previewTenant, setPreviewTenant] = useState<PreviewTenant | null>(null);

  const setViewMode = (mode: ViewMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    setViewModeState(mode);
    // Trocar de sistema encerra o preview — ele só faz sentido no externo.
    setPreviewTenant(null);
  };

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, previewTenant, setPreviewTenant }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
