import type { CellHookData, UserOptions } from 'jspdf-autotable';

/** Cinza claro do destaque — mesmo tom que o `alternateRowStyles` usava antes. */
const CINZA_DESTAQUE: [number, number, number] = [245, 247, 250];
const BRANCO: [number, number, number] = [255, 255, 255];

/**
 * Zebra por DATA em vez de linha sim/linha não.
 *
 * O `alternateRowStyles` do jspdf-autotable alterna a cada linha, o que embaralha
 * visualmente lançamentos do mesmo dia. Aqui o destaque muda quando a data muda: todas as
 * linhas de 29/07 saem em cinza, todas as de 30/07 em branco, as de 31/07 em cinza de novo.
 * Isso só faz sentido com a tabela ordenada por data — ordenar antes de montar o body.
 *
 * Uso:
 *   autoTable(doc, { head, body, theme: 'grid', ...zebraPorData(datasNaMesmaOrdemDoBody) })
 *
 * @param chavesPorLinha uma chave por linha do body, na mesma ordem (normalmente a data
 *   formatada). Linhas com a mesma chave consecutiva formam um grupo.
 * @param extra hooks/estilos adicionais a preservar (o didParseTable é encadeado).
 */
export function zebraPorData(
  chavesPorLinha: string[],
  extra?: { didParseCell?: (data: CellHookData) => void }
): Pick<UserOptions, 'didParseCell'> {
  const destaque: boolean[] = [];
  let grupo = -1;
  let anterior: string | null = null;

  for (const chave of chavesPorLinha) {
    if (chave !== anterior) {
      grupo += 1;
      anterior = chave;
    }
    destaque.push(grupo % 2 === 0); // primeiro grupo destacado
  }

  return {
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body') {
        data.cell.styles.fillColor = destaque[data.row.index] ? CINZA_DESTAQUE : BRANCO;
      }
      extra?.didParseCell?.(data);
    },
  };
}
