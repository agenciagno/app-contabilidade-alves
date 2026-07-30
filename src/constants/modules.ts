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
    key: 'tech',
    label: 'Tech',
    children: [{ key: 'tech_disparos', label: 'Disparos' }],
  },
  { key: 'reforma_tributaria', label: 'Reforma Tributária' },
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
      { key: 'fiscal_calendario', label: 'Obrigações e Declarações / Calendário Fiscal' },
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
      { key: 'financeiro_conciliacao_sicoob', label: 'Conciliação Sicoob' },
      { key: 'financeiro_eventos_contabeis', label: 'Eventos Contábeis' },
      { key: 'financeiro_dre', label: 'DRE' },
      { key: 'financeiro_clientes_fornecedores', label: 'Clientes & Fornecedores' },
      { key: 'financeiro_metas_orcamentos', label: 'Metas & Orçamentos' },
      { key: 'financeiro_categorias', label: 'Categorias' },
    ],
  },
  // Cadastros é grupo visual no menu; as chaves seguem no topo para não invalidar
  // as permissões já gravadas de `contatos` e `acessos`.
  { key: 'contatos', label: 'Cadastros · Empresas' },
  { key: 'cadastros_procuracoes', label: 'Cadastros · Procurações' },
  { key: 'cadastros_certificados', label: 'Cadastros · Certificados' },
  { key: 'cadastros_alvaras', label: 'Cadastros · Alvarás' },
  { key: 'acessos', label: 'Cadastros · Acessos' },
  { key: 'equipe', label: 'Cadastros · Equipe' },
  { key: 'configuracoes', label: 'Configurações' },
];

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
};

/** Fallback de plano quando a empresa não tem `plan_modules` preenchido. */
export const DEFAULT_PLAN_MODULES: string[] = [
  'home',
  'fiscal',
  'financeiro',
  'contatos',
  'acessos',
  'configuracoes',
];

/** Para onde mandar quem cai numa rota sem permissão. */
export const MODULE_ROUTE_MAP: Record<string, string> = {
  home: '/',
  tech: '/disparos',
  financeiro: '/painel-financeiro',
  fiscal: '/fiscal/tarefas',
  contatos: '/contatos',
  acessos: '/acessos',
  equipe: '/cadastros/equipe',
  configuracoes: '/configuracoes',
};

export const MODULE_PRIORITY = [
  'home',
  'financeiro',
  'fiscal',
  'contatos',
  'tech',
  'acessos',
  'configuracoes',
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
  faturas: {
    titulo: 'Faturas',
    descricao: 'Suas faturas e o histórico de pagamento da assinatura do sistema.',
  },
};
