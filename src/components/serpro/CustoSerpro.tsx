import { useCustoSerpro } from '@/hooks/useSerproConsumo';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Valor do clique, só para administrador e super administrador (para os demais não renderiza nada).
 * Vai dentro do botão, depois do texto: `Consultar<Preco tipo="Consultar" />` → "Consultar · R$ 0,24".
 */
export function Preco({ tipo }: { tipo: 'Consultar' | 'Emitir' }) {
  const { preco } = useCustoSerpro();
  const v = preco(tipo);
  return v === null ? null : <span className="ml-1.5 font-normal opacity-70">· {brl(v)}</span>;
}

/** Linha "Custo: R$ 0,24 por consulta" para dentro da dica do botão, só para administrador. */
export function LinhaCusto({ tipo }: { tipo: 'Consultar' | 'Emitir' }) {
  const { preco } = useCustoSerpro();
  const v = preco(tipo);
  return v === null ? null : <p className="mt-1 font-medium">Custo: {brl(v)} por {tipo === 'Emitir' ? 'emissão' : 'consulta'}.</p>;
}
