import { useSearchParams } from 'react-router-dom';

/** Texto inicial do campo de busca, vindo de `?q=` (a Fila do dia abre cada tela já filtrada no cliente). */
export function useBuscaInicial(): string {
  const [params] = useSearchParams();
  return params.get('q') ?? '';
}
