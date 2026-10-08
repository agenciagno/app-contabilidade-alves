import { INTERNAL_PICKER_TREE, type PickerNode } from '@/constants/modules';
import { pickerState, togglePickerNode } from '@/lib/modulePicker';

/**
 * Seletor de módulos do usuário interno (equipe da CA). Desenha
 * INTERNAL_PICKER_TREE na ordem do menu lateral; a lógica de marcar/desmarcar
 * (chaves de apoio, módulo pai) vive em `lib/modulePicker.ts`.
 */
export function ModulosPickerInterno({
  selecionados, onChange,
}: {
  selecionados: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selecionados);

  const renderNode = (node: PickerNode, ancestors: PickerNode[], nested: boolean) => {
    const state = pickerState(set, node);
    const hasChildren = !!node.children?.length;
    return (
      <div
        key={node.key ?? node.label}
        className={hasChildren && nested ? 'col-span-2 space-y-1.5' : hasChildren ? 'space-y-1.5' : undefined}
      >
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state === 'on'}
            ref={(el) => {
              if (el) el.indeterminate = state === 'partial';
            }}
            onChange={() => onChange(togglePickerNode(selecionados, node, ancestors))}
            className="rounded border-border"
          />
          <span className={nested ? 'text-sm text-muted-foreground' : 'text-sm font-medium'}>
            {node.label}
          </span>
        </label>
        {hasChildren && (
          <div className="ml-6 grid grid-cols-2 gap-1.5">
            {node.children!.map((c) => renderNode(c, [...ancestors, node], true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {INTERNAL_PICKER_TREE.map((node) => renderNode(node, [], false))}
    </>
  );
}
