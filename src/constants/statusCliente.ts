/**
 * Status do Cliente é a ÚNICA fonte do ativo/inativo (06/10/2026). `contacts.is_active` é calculado no banco a partir dele
 * (trigger `trg_contacts_unifica_ativo`); aqui só fica a lista e a regra para a tela mostrar o mesmo que o banco decide.
 * Desde 12/10/2026 só "Ativo" gera tarefa e entra no Serpro (função `status_cliente_gera_tarefa` no banco);
 * Suspensa e Inapta seguem ativas no sistema apenas para boletos.
 */
export const STATUS_CLIENTE = [
  'Ativo', 'Suspensa - Contabilidade', 'Suspensa - Receita Federal', 'Inapta - Receita Federal',
  'Cancelada - Receita Federal', 'Baixada', 'Ex-cliente', 'Ex-Colaborador',
] as const;

/** Inativos: nunca entram em tarefas, boletos, avisos nem Serpro. */
export const STATUS_INATIVOS: readonly string[] = ['Cancelada - Receita Federal', 'Baixada', 'Ex-cliente', 'Ex-Colaborador'];

export const statusEhInativo = (s: string | null | undefined) => !!s && STATUS_INATIVOS.includes(s);

/** Ativo no sistema mas fora do "Ativo" (Suspensa, Inapta): só boletos. Não recebe tarefa automática nem Serpro; lançar à mão pede confirmação. */
export const statusPedeAviso = (s: string | null | undefined) => !!s && s !== 'Ativo' && !statusEhInativo(s);

export const STATUS_AJUDA =
  'Só "Ativo" recebe tarefas e é consultado no Serpro. Suspensa e Inapta ficam só nos boletos, com aviso. Baixada, Cancelada, Ex-cliente e Ex-Colaborador ficam inativos: não entram em tarefas, boletos, avisos nem Serpro.';
