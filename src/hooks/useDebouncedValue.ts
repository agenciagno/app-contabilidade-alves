import { useEffect, useState } from 'react';

// Debounce de 300ms (padrão já documentado em 04-design-system.md §7.2 pra
// busca) — o valor exibido no campo fica instantâneo, só o valor retornado
// aqui (usado pra disparar a query) atrasa.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
