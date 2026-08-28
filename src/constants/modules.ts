/**
 * Fonte única dos módulos do sistema.
 *
 * Antes desta constante a lista de chaves de módulo vivia duplicada em 4 arquivos
 * (AppSidebar, ModuleGuard, UserFormDialog e UsersTab) e saía de sincronia a cada
 * rota nova. Qualquer módulo novo entra aqui e os quatro lugares acompanham.
 *
 * Chaves de permissão são gravadas em `companies.plan_modules` (o que o plano
 * contratou) e `profiles.allowed_modules` (o que o usuário pode ver). Nunca renomear
 * uma chave já gravada — adicionar em LEGACY_MODULE_ALIASES em vez disso.
 *
 * Vale igual para Colaborador (equipe interna CA) e Cliente Externo — mesma árvore,
 * mesmo gate. Cliente Externo nasce com `allowed_modules` vazio (ver UserFormDialog);
 * Colaborador admin/super_admin ganha tudo por padrão.
 */

export interface ModuleNode {
  key: string;
  label: string;
  children?: { key: string; label: string }[];
}

/** Árvore de permissões exibida no cadastro de usuário. */
export const MODULE_TREE: ModuleNode[] = [
  { key: 'home', label: 'Início' },
  {
    key: 'reforma_tributaria',
    label: 'Reforma Tributária',
    children: [
      { key: 'reforma_tributaria_painel', label: 'Painel RT' },
      { key: 'reforma_tributaria_calculadora', label: 'Calculadora RT' },
    ],
  },
  {
    key: 'gestao360',
    label: 'Gestão 360°',
    children: [
      { key: 'gestao360_portal', label: 'Portal 360°' },
      { key: 'gestao360_ausencias', label: 'CA · Ausências' },
      { key: 'gestao360_diagnosticos', label: 'CA · Diagnósticos' },
      { key: 'gestao360_indicadores', label: 'CA · Indicadores' },
    ],
  },
  {
    key: 'fiscal',
    label: 'Tarefas',
    children: [
      { key: 'fiscal_dashboard', label: 'Dashboard' },
      { key: 'fiscal_tarefas', label: 'Tarefas' },
      { key: 'fiscal_colaboradores', label: 'Colaboradores' },
      { key: 'fiscal_obrigacoes_declaracoes', label: 'Obrigações e Declarações' },
      { key: 'fiscal_calendario', label: 'Calendário Fiscal' },
      { key: 'fiscal_obrigacoes', label: 'Obrigações Fiscais' },
      { key: 'fiscal_agenda', label: 'Agenda' },
    ],
  },
  { key: 'mensagens', label: 'Mensagens' },
  { key: 'dashboard_federal', label: 'Dashboard Federal' },
  { key: 'parcelamentos', label: 'Parcelamentos' },
  { key: 'certidoes', label: 'Certidões' },
  { key: 'processos', label: 'Processos' },
  { key: 'score_fiscal', label: 'Score Fiscal' },
  { key: 'analise_fiscal', label: 'Análise Fiscal' },
  { key: 'simulador_tributario', label: 'Simulador Tributário' },
  { key: 'diagnostico_ca', label: 'Diagnóstico CA' },
  {
    key: 'financeiro',
    label: 'Financeiro',
    children: [
      { key: 'financeiro_dashboard', label: 'Dashboard' },
      { key: 'financeiro_lancamentos', label: 'Lançamentos' },
      { key: 'financeiro_pagar_receber', label: 'Pagar/Receber' },
      { key: 'financeiro_fluxo_caixa', label: 'Fluxo de Caixa' },
      { key: 'financeiro_boletos', label: 'Boletos' },
      { key: 'financeiro_conta_corrente', label: 'Conta Corrente' },
      { key: 'financeiro_conciliacao_sicoob', label: 'Sicoob' },
      { key: 'financeiro_eventos_contabeis', label: 'Eventos Contábeis' },
      { key: 'financeiro_dre', label: 'DRE' },
      { key: 'financeiro_clientes_fornecedores', label: 'Clientes & Fornecedores' },
      { key: 'financeiro_categorias', label: 'Categorias' },
      { key: 'financeiro_metas_orcamentos', label: 'Metas & Orçamentos' },
    ],
  },
  {
    key: 'cadastro',
    label: 'Cadastro',
    children: [
      { key: 'contatos', label: 'Empresas' },
      { key: 'cadastros_procuracoes', label: 'Procurações' },
      { key: 'cadastros_certificados', label: 'Certificados' },
      { key: 'cadastros_alvaras', label: 'Alvarás' },
      { key: 'acessos', label: 'Acessos' },
      { key: 'equipe', label: 'Equipe' },
    ],
  },
  {
    key: 'perfil_cliente',
    label: 'Perfil do Cliente',
    children: [
      { key: 'perfil_cliente_identificacao', label: 'Cadastro' },
      { key: 'perfil_cliente_fiscal', label: 'Dpto. Fiscal' },
      { key: 'perfil_cliente_pessoal', label: 'Dpto Pessoal' },
      { key: 'perfil_cliente_operacional', label: 'Operacional' },
      { key: 'perfil_cliente_operacional_excluir', label: 'Operacional · Excluir cliente' },
      { key: 'perfil_cliente_socios', label: 'Sócios' },
      { key: 'perfil_cliente_acessos', label: 'Acessos' },
      { key: 'perfil_cliente_financeiro', label: 'Financeiro' },
      { key: 'perfil_cliente_logs', label: 'Logs' },
    ],
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    children: [
      { key: 'configuracoes_empresa', label: 'Dados da Empresa' },
      { key: 'configuracoes_logs', label: 'Logs Globais' },
      { key: 'configuracoes_lixeira', label: 'Lixeira' },
      { key: 'configuracoes_backup', label: 'Backup' },
    ],
  },
  { key: 'suporte', label: 'Suporte' },
];

/**
 * Fronteira estrutural interno × externo, por módulo de topo.
 *
 * AUDIÊNCIA ≠ PLANO: `plan_modules` diz o que o tenant CONTRATOU (comercial,
 * muda por cliente); audiência diz o que é da operação interna da CA e não se
 * vende (estrutural, não aparece pra tenant nem se estiver no plano).
 *
 * - 'both'     → existe nos dois mundos (produto vendido + operação CA)
 * - 'internal' → só operação CA
 * - módulo ausente do mapa → tratado como 'internal' (padrão seguro: módulo
 *   novo não vaza pro produto até alguém declarar o contrário)
 *
 * Consumidores: useModuleAccess (menu/busca), ModuleGuard (rotas) e o seletor
 * Interno/Externo do super admin (useAudience).
 */
export type ModuleAudience = 'internal' | 'external' | 'both';

/**
 * Mapa definido por Gabriel (10/08/2026). Vale para módulo de topo E submódulo:
 * submódulo ausente herda do pai; módulo de topo ausente = 'internal'.
 */
export const MODULE_AUDIENCE: Record<string, ModuleAudience> = {
  home: 'both',
  suporte: 'both',

  // Financeiro: núcleo nos dois mundos; operação bancária/contábil da CA é interna;
  // C&F e Categorias são do produto (no menu externo, C&F aparece sob Cadastro).
  financeiro: 'both',
  financeiro_boletos: 'internal',
  financeiro_conciliacao_sicoob: 'internal',
  financeiro_dre: 'internal',
  financeiro_eventos_contabeis: 'internal',
  financeiro_clientes_fornecedores: 'external',
  financeiro_categorias: 'external',

  // Tech: o grupo existe nos dois mundos; cada item declara o seu lado.
  // (Clientes Externos, LGPD e Agente IA não têm chave de submódulo — a
  // audiência deles vive no item do menu e no guard da rota.)
  tech: 'both',
  tech_disparos: 'internal',

  // Cadastro: na visão externa só existem C&F (acima) e Equipe.
  cadastro: 'both',
  contatos: 'internal',
  cadastros_procuracoes: 'internal',
  cadastros_certificados: 'internal',
  cadastros_alvaras: 'internal',
  acessos: 'internal',
  equipe: 'both',

  reforma_tributaria: 'internal',
  gestao360: 'internal',
  fiscal: 'internal',
  mensagens: 'internal',
  dashboard_federal: 'internal',
  parcelamentos: 'internal',
  certidoes: 'internal',
  processos: 'internal',
  score_fiscal: 'internal',
  analise_fiscal: 'internal',
  simulador_tributario: 'internal',
  diagnostico_ca: 'internal',
  perfil_cliente: 'internal',
  configuracoes: 'internal',
};

/** Pai de cada submódulo — para herança de audiência. */
const PARENT_OF_SUBMODULE: Record<string, string> = MODULE_TREE.reduce((acc, m) => {
  m.children?.forEach((c) => {
    acc[c.key] = m.key;
  });
  return acc;
}, {} as Record<string, string>);

/**
 * A chave (módulo ou submódulo) existe para esta audiência?
 * Submódulo sem declaração herda do pai; topo sem declaração = 'internal'
 * (padrão seguro: módulo novo não vaza pro produto até alguém declarar).
 */
export function moduleAllowsAudience(key: string, audience: 'internal' | 'external'): boolean {
  const declared =
    MODULE_AUDIENCE[key] ??
    (PARENT_OF_SUBMODULE[key] ? MODULE_AUDIENCE[PARENT_OF_SUBMODULE[key]] : undefined) ??
    'internal';
  return declared === 'both' || declared === audience;
}

/** Toda chave válida (pais + filhos). */
export const ALL_MODULE_KEYS: string[] = MODULE_TREE.flatMap((m) => [
  m.key,
  ...(m.children?.map((c) => c.key) ?? []),
]);

/** Rótulo de qualquer chave, pai ou filha. */
export const MODULE_LABELS: Record<string, string> = MODULE_TREE.reduce((acc, m) => {
  acc[m.key] = m.label;
  m.children?.forEach((c) => {
    acc[c.key] = c.label;
  });
  return acc;
}, {} as Record<string, string>);

/**
 * Árvore de módulos como o cliente externo realmente vê no menu (`AppSidebar`)
 * — fonte única de todo seletor que deixa marcar/desmarcar módulo de produto
 * (cadastro de cliente, aba Módulos, controle por usuário). Existe separada de
 * `MODULE_TREE` porque a posição de alguns itens no menu do produto não é a
 * mesma da árvore interna: `financeiro_clientes_fornecedores` é filho de
 * `financeiro` em `MODULE_TREE`, mas no menu do cliente mora dentro de
 * "Cadastro" — sem isso, o seletor mostrava uma organização diferente da que
 * o cliente via de verdade. As chaves são as mesmas de `MODULE_TREE` (não
 * muda gating), só o agrupamento visual é outro.
 */
export interface ExternalModuleGroup {
  key: string;
  children?: string[];
}
export const EXTERNAL_MODULE_GROUPS: ExternalModuleGroup[] = [
  { key: 'home' },
  {
    key: 'financeiro',
    children: [
      'financeiro_dashboard', 'financeiro_lancamentos', 'financeiro_pagar_receber',
      'financeiro_fluxo_caixa', 'financeiro_conta_corrente', 'financeiro_categorias',
      'financeiro_metas_orcamentos',
    ],
  },
  { key: 'cadastro', children: ['equipe', 'financeiro_clientes_fornecedores'] },
  { key: 'suporte' },
];

/** Todas as chaves (pai + filhos) do pacote padrão de produto. */
export const EXTERNAL_MODULE_ALL_KEYS: string[] = EXTERNAL_MODULE_GROUPS.flatMap(
  (g) => [g.key, ...(g.children ?? [])],
);

/** Submódulos por módulo pai — usado nos dois gates (menu e guard). */
export const SUB_MODULES_BY_PARENT: Record<string, string[]> = MODULE_TREE.reduce((acc, m) => {
  if (m.children?.length) acc[m.key] = m.children.map((c) => c.key);
  return acc;
}, {} as Record<string, string[]>);

/**
 * Chaves antigas que continuam valendo. `contatos` nasceu como `clientes`;
 * `tech_disparos` nasceu como `clientes_disparos`.
 */
export const LEGACY_MODULE_ALIASES: Record<string, string[]> = {
  contatos: ['clientes'],
};
export const LEGACY_SUBMODULE_ALIASES: Record<string, string[]> = {
  tech_disparos: ['clientes_disparos'],
  contatos: ['clientes'],
};

/** Fallback de plano quando a empresa não tem `plan_modules` preenchido. */
export const DEFAULT_PLAN_MODULES: string[] = [
  'home',
  'fiscal',
  'financeiro',
  'cadastro',
  'perfil_cliente',
  'configuracoes',
  'suporte',
];

/** Para onde mandar quem cai numa rota sem permissão. */
export const MODULE_ROUTE_MAP: Record<string, string> = {
  home: '/',
  tech: '/disparos',
  financeiro: '/painel-financeiro',
  fiscal: '/fiscal/tarefas',
  cadastro: '/contatos',
  contatos: '/contatos',
  acessos: '/acessos',
  equipe: '/cadastros/equipe',
  configuracoes: '/configuracoes',
  suporte: '/suporte',
};

export const MODULE_PRIORITY = [
  'home',
  'financeiro',
  'fiscal',
  'cadastro',
  'tech',
  'configuracoes',
  'suporte',
];

/**
 * Módulos que já existem no menu mas ainda não têm tela.
 * Alimentam o componente <EmBreve /> — quando a tela real nascer, some daqui.
 * `fase` só aparece quando o roadmap tem a fase mapeada; sem chute.
 */
export interface EmBreveInfo {
  titulo: string;
  descricao: string;
  fase?: string;
}

export const EM_BREVE: Record<string, EmBreveInfo> = {
  reforma_tributaria: {
    titulo: 'Reforma Tributária',
    descricao:
      'Prontidão CBS/IBS da carteira, apoio à decisão de setembro do Simples e radar de CNAE.',
    fase: 'F5 · Gestor RT IBS/CBS',
  },
  gestao360_portal: {
    titulo: 'Portal 360°',
    descricao: 'Visão única do cliente reunindo o que hoje está espalhado entre os módulos.',
  },
  gestao360_ausencias: {
    titulo: 'CA · Ausências',
    descricao:
      'Férias, folgas e cobertura entre colaboradores. A base de dados já existe (collaborator_coverage) e hoje só é lida pelo agente de pré-atendimento.',
  },
  gestao360_diagnosticos: {
    titulo: 'CA · Diagnósticos',
    descricao: 'Diagnósticos internos da operação da CA por setor.',
  },
  gestao360_indicadores: {
    titulo: 'CA · Indicadores',
    descricao: 'Indicadores da operação, começando pela métrica-mãe: processos manuais eliminados.',
  },
  fiscal_obrigacoes: {
    titulo: 'Obrigações Fiscais',
    descricao: 'Controle de obrigações por cliente, separado do gestor de tarefas.',
  },
  fiscal_agenda: {
    titulo: 'Agenda',
    descricao: 'Agenda de compromissos da equipe.',
  },
  mensagens: {
    titulo: 'Mensagens',
    descricao: 'Atendimento de WhatsApp dentro do sistema, sobre a base do Chatwoot.',
    fase: 'F3 · Chatwoot + Agente IA',
  },
  dashboard_federal: {
    titulo: 'Dashboard Federal',
    descricao: 'Situação de cada cliente na Receita: Caixa Postal, pendências e malha.',
    fase: 'F4 · Serpro / Integra Contador',
  },
  parcelamentos: {
    titulo: 'Parcelamentos',
    descricao: 'Parcelamentos federais por cliente, com parcelas e situação.',
    fase: 'F4 · Serpro / Integra Contador',
  },
  certidoes: {
    titulo: 'Certidões',
    descricao:
      'Emissão e validade de certidões negativas. Só a federal (RFB/PGFN) é coberta pelo Serpro — estadual, municipal e trabalhista dependem de fonte própria.',
    fase: 'F8 · Certidões CND',
  },
  processos: {
    titulo: 'Processos',
    descricao: 'Acompanhamento de processos e situação fiscal (e-Processo, SITFIS).',
    fase: 'F4 · Serpro / Integra Contador',
  },
  score_fiscal: {
    titulo: 'Score Fiscal',
    descricao: 'Nota de saúde fiscal por cliente, para priorizar quem precisa de atenção.',
  },
  analise_fiscal: {
    titulo: 'Análise Fiscal',
    descricao: 'Análise da situação fiscal do cliente a partir dos dados já coletados.',
  },
  simulador_tributario: {
    titulo: 'Simulador Tributário',
    descricao: 'Comparação entre regimes para apoiar a escolha do cliente.',
  },
  diagnostico_ca: {
    titulo: 'Diagnóstico CA',
    descricao: 'Diagnóstico que a CA entrega ao cliente, montado sobre os módulos de análise.',
  },
  cadastros_procuracoes: {
    titulo: 'Procurações',
    descricao: 'Procurações eletrônicas por cliente, com validade e renovação.',
    fase: 'F4 · Serpro / Integra Contador',
  },
  cadastros_certificados: {
    titulo: 'Certificados',
    descricao: 'Certificados digitais A1/A3 dos clientes, com controle de vencimento.',
  },
  cadastros_alvaras: {
    titulo: 'Alvarás',
    descricao: 'Alvarás e licenças por cliente, com controle de vencimento.',
  },
};
