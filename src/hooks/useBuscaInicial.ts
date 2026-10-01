import { useSearchParams } from 'react-router-dom';

/** Texto inicial do campo de busca, vindo de `?q=` (um link com `?q=` abre a tela já filtrada no cliente). */
export function useBuscaInicial(): string {
  const [params] = useSearchParams();
  return params.get('q') ?? '';
}
