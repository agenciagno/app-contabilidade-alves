import { Checkbox } from '@/components/ui/checkbox';
import { EXTERNAL_MODULE_GROUPS, MODULE_LABELS } from '@/constants/modules';

/**
 * Seletor de módulos de produto — mesmo componente em todo lugar que deixa
 * marcar/desmarcar módulo (cadastro de cliente, aba Módulos, controle por
 * usuário), pra nunca divergir a lista nem o agrupamento entre telas.
 */
export function ModulosPickerTree({
  selecionados, onToggle, planModules,
}: {
  selecionados: string[];
  onToggle: (key: string, checked: boolean, filhos?: string[]) => void;
  /**
   * Só passar quando o picker precisa ficar restrito ao que o plano do
   * cliente já contratou (controle por usuário, em Usuários). Omitido = o
   * próprio plano está sendo definido — todo o pacote padrão fica disponível.
   */
  planModules?: string[];
}) {
  const grupos = planModules
    ? EXTERNAL_MODULE_GROUPS.filter((g) => planModules.includes(g.key))
    : EXTERNAL_MODULE_GROUPS;

  if (grupos.length === 0) {
    return <p className="text-sm text-muted-foreground">O plano deste cliente ainda não tem módulo contratado.</p>;
  }

  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {grupos.map((g) => {
        const filhosVisiveis = (g.children ?? []).filter((c) => !planModules || planModules.includes(c));
        const marcado = selecionados.includes(g.key);
        return (
          <div key={g.key} className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={marcado} onCheckedChange={(v) => onToggle(g.key, v === true, filhosVisiveis)} />
              <span className="text-sm font-medium">{MODULE_LABELS[g.key]}</span>
            </label>
            {marcado && filhosVisiveis.length > 0 && (
              <div className="ml-6 space-y-1.5 border-l border-border pl-3">
                {filhosVisiveis.map((filho) => (
                  <label key={filho} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selecionados.includes(filho)}
                      onCheckedChange={(v) => onToggle(filho, v === true)}
                    />
                    <span className="text-xs text-muted-foreground">{MODULE_LABELS[filho]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Toggle padrão: marca/desmarca a chave e, ao desmarcar o pai, os filhos junto. */
export function toggleModuloKey(
  setSelecionados: (updater: (prev: string[]) => string[]) => void,
) {
  return (key: string, checked: boolean, filhos: string[] = []) => {
    setSelecionados((prev) => {
      const set = new Set(prev);
      if (checked) {
        set.add(key);
      } else {
        set.delete(key);
        filhos.forEach((f) => set.delete(f));
      }
      return Array.from(set);
    });
  };
}
