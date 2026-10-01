// O banco (PostgREST) devolve no máximo 1.000 linhas por consulta, em silêncio, mesmo com .limit(5000).
// Leitura que precisa de TUDO (ex.: mapa de procurações, 1.500+ linhas) lê em páginas até acabar. Se uma página falhar, lança erro:
// melhor parar do que seguir com uma lista incompleta (que já fez a rotina tentar, e cobrar, cliente sem procuração).
export async function lerTodas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanho = 1000,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await pagina(de, de + tamanho - 1);
    if (error) throw new Error(`falha ao ler a página ${de / tamanho + 1}: ${error.message}`);
    const lote = data ?? [];
    todas.push(...lote);
    if (lote.length < tamanho) break;
  }
  return todas;
}
