/**
 * Nome da categoria nas listas de escolha/filtro, com o macro abaixo como detalhe
 * (só cliente externo: subevento aparece com o nome do macro para identificar).
 */
export function CategoryNameWithParent({ name, parentName }: { name: string; parentName?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{name}</span>
      {parentName && <span className="truncate text-[11px] leading-tight text-muted-ink">{parentName}</span>}
    </span>
  );
}
