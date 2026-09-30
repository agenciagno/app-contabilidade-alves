import { useCustoSerpro } from '@/hooks/useSerproConsumo';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Valor do clique, só para administrador e super administrador (para os demais não renderiza nada).
 * Vai dentro do botão, depois do texto: `Consultar<Preco tipo="Consultar" />` → "Consultar · R$ 0,24".
 * `vezes` = quantas chamadas o clique faz (ex.: 4 modalidades de parcelamento): mostra o total aproximado.
 */
export function Preco({ tipo, vezes = 1 }: { tipo: 'Consultar' | 'Emitir'; vezes?: number }) {
  const { preco } = useCustoSerpro();
  const v = preco(tipo);
  return v === null ? null : <span className="ml-1.5 font-normal opacity-70">· {vezes > 1 ? '~' : ''}{brl(v * vezes)}</span>;
}

/** Linha "Custo: R$ 0,24 por consulta" para dentro da dica do botão, só para administrador. */
export function LinhaCusto({ tipo, vezes = 1 }: { tipo: 'Consultar' | 'Emitir'; vezes?: number }) {
  const { preco } = useCustoSerpro();
  const v = preco(tipo);
  if (v === null) return null;
  const unidade = tipo === 'Emitir' ? 'emissão' : 'consulta';
  return vezes > 1
    ? <p className="mt-1 font-medium">Custo: cerca de {brl(v * vezes)} ({vezes} {unidade === 'emissão' ? 'emissões' : 'consultas'} de {brl(v)}).</p>
    : <p className="mt-1 font-medium">Custo: {brl(v)} por {unidade}.</p>;
}
