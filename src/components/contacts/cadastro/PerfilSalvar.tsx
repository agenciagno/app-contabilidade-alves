import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type Salvar = () => Promise<unknown> | void;
interface Registro { registrar: (aba: string, salvar: Salvar | null) => void }

const Contexto = createContext<Registro | null>(null);
export const PerfilSalvarProvider = Contexto.Provider;

/**
 * Botão Salvar único do Super Perfil (17/10/2026), no rodapé fixo do box. Cada sub-aba com formulário registra aqui o que salvar
 * (`useRegistrarSalvar`); o botão chama o registro da sub-aba aberta. Sub-aba sem registro (Societário, Acessos, Financeiro, Logs...
 * salvam item a item, em diálogo) não mostra o botão.
 */
export function usePerfilSalvar(abaAtiva: string) {
  const registros = useRef<Record<string, Salvar>>({});
  const [abasComSalvar, setAbasComSalvar] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const registrar = useCallback((aba: string, salvar: Salvar | null) => {
    if (salvar) registros.current[aba] = salvar;
    else delete registros.current[aba];
    // Só renderiza de novo quando a sub-aba entra ou sai da lista (o registro em si é atualizado a cada render, sem estado).
    setAbasComSalvar(prev => {
      const tinha = prev.includes(aba);
      if (!!salvar === tinha) return prev;
      return salvar ? [...prev, aba] : prev.filter(a => a !== aba);
    });
  }, []);

  /** Salva a sub-aba aberta. Devolve se deu certo (sub-aba sem nada para salvar conta como certo): o assistente de cadastro só avança assim. */
  const salvar = useCallback(async (): Promise<boolean> => {
    const fn = registros.current[abaAtiva];
    if (!fn) return true;
    setSalvando(true);
    try {
      await fn();
      return true;
    } catch {
      // Quem salva já avisa o erro (toast); aqui só garante que o botão volte ao normal.
      return false;
    } finally {
      setSalvando(false);
    }
  }, [abaAtiva]);

  const provider = useMemo<Registro>(() => ({ registrar }), [registrar]);
  return { provider, podeSalvar: abasComSalvar.includes(abaAtiva), salvando, salvar };
}

/** Registra o que o botão Salvar do rodapé faz na sub-aba `aba`. `null` = sub-aba sem nada para salvar agora (ex.: ainda carregando). */
export function useRegistrarSalvar(aba: string, salvar: Salvar | null) {
  const ctx = useContext(Contexto);
  // A cada render: o que salvar enxerga o formulário atual.
  useEffect(() => {
    ctx?.registrar(aba, salvar);
  });
  useEffect(() => () => ctx?.registrar(aba, null), [ctx, aba]);
}
