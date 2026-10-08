import { INTERNAL_PICKER_TREE, type PickerNode } from '@/constants/modules';

/**
 * Lógica do seletor de módulos do usuário interno (INTERNAL_PICKER_TREE).
 *
 * O que o seletor grava são as chaves reais que o menu e as rotas já checam.
 * Marcar um item grava a chave dele + as chaves de apoio (`grants` e o módulo
 * pai); desmarcar remove a dele e limpa o apoio que ninguém mais usa. Chave
 * gravada que o seletor não desenha (ex.: reforma_tributaria) nunca é tocada.
 */

export type PickerState = 'on' | 'partial' | 'off';

const flatten = (nodes: PickerNode[]): PickerNode[] =>
  nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);

const subtree = (node: PickerNode): PickerNode[] => flatten([node]);

const ALL_NODES = flatten(INTERNAL_PICKER_TREE);

/** Estado do checkbox de um nó, a partir das chaves gravadas. */
export function pickerState(selected: Set<string>, node: PickerNode): PickerState {
  const selfOn = !!node.key && selected.has(node.key);
  if (!node.children?.length) return selfOn ? 'on' : 'off';

  const states = node.children.map((c) => pickerState(selected, c));
  const allOn = states.every((s) => s === 'on');
  const anyOn = states.some((s) => s !== 'off');
  if (node.standalone) {
    // Tela própria: marcada sozinha (sem nenhuma aba) também conta como "on" —
    // senão o clique seguinte marcaria tudo em vez de desmarcar.
    if (selfOn && (allOn || !anyOn)) return 'on';
    return selfOn || anyOn ? 'partial' : 'off';
  }
  if (allOn) return 'on';
  return anyOn ? 'partial' : 'off';
}

/** Chave de apoio (módulo pai ou `grants`) só fica enquanto algo selecionado depende dela. */
function isNeeded(selected: Set<string>, key: string): boolean {
  const grantedBySelected = ALL_NODES.some(
    (n) => n.key && selected.has(n.key) && n.grants?.includes(key),
  );
  if (grantedBySelected) return true;
  const container = ALL_NODES.find((n) => n.key === key && n.children?.length && !n.standalone);
  if (!container) return false;
  return subtree(container).some((n) => n !== container && n.key && selected.has(n.key));
}

/**
 * Marca (se não estiver todo marcado) ou desmarca o nó e tudo debaixo dele.
 * `ancestors` é o caminho do topo até o pai do nó.
 */
export function togglePickerNode(
  selected: string[],
  node: PickerNode,
  ancestors: PickerNode[],
): string[] {
  const set = new Set(selected);
  const nodes = subtree(node);

  if (pickerState(set, node) !== 'on') {
    nodes.forEach((n) => {
      if (n.key) set.add(n.key);
      n.grants?.forEach((g) => set.add(g));
    });
    ancestors.forEach((a) => {
      if (a.key) set.add(a.key);
    });
    return Array.from(set);
  }

  nodes.forEach((n) => {
    if (n.key) set.delete(n.key);
  });
  const candidates = new Set<string>();
  nodes.forEach((n) => n.grants?.forEach((g) => candidates.add(g)));
  ancestors.forEach((a) => {
    if (a.key && !a.standalone) candidates.add(a.key);
  });
  // Do pai mais próximo para o topo não importa: cada chave só olha o que sobrou selecionado.
  candidates.forEach((k) => {
    if (!isNeeded(set, k)) set.delete(k);
  });
  return Array.from(set);
}
