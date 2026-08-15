export interface SegmentoOption {
  value: string;
  label: string;
}

export interface SetorOption {
  value: string;
  label: string;
  segmentos: SegmentoOption[];
}

export const SETORES_ATUACAO: SetorOption[] = [
  {
    value: 'comercio_varejista', label: 'Comércio Varejista', segmentos: [
      { value: 'vestuario_acessorios', label: 'Vestuário e Acessórios' },
      { value: 'calcados', label: 'Calçados' },
      { value: 'supermercado_mercearia', label: 'Supermercado / Mercearia' },
      { value: 'material_construcao', label: 'Material de Construção' },
      { value: 'moveis_colchoes', label: 'Móveis e Colchões' },
      { value: 'material_eletrico', label: 'Material Elétrico' },
      { value: 'pecas_acessorios_automotivos', label: 'Peças e Acessórios Automotivos' },
      { value: 'pet_shop', label: 'Pet Shop' },
      { value: 'farmacia_varejo', label: 'Farmácia' },
      { value: 'bebidas', label: 'Bebidas' },
      { value: 'gas_glp', label: 'Gás (GLP)' },
      { value: 'papelaria_livraria', label: 'Papelaria / Livraria' },
      { value: 'outros_varejo', label: 'Outros' },
    ],
  },
  {
    value: 'comercio_atacadista', label: 'Comércio Atacadista', segmentos: [
      { value: 'atacado_alimentos', label: 'Alimentos' },
      { value: 'atacado_vestuario', label: 'Vestuário' },
      { value: 'atacado_material_construcao', label: 'Material de Construção' },
      { value: 'atacado_nao_especializado', label: 'Não especializado' },
    ],
  },
  {
    value: 'distribuidora', label: 'Distribuidora', segmentos: [
      { value: 'distrib_alimentos_bebidas', label: 'Alimentos e Bebidas' },
      { value: 'distrib_produtos_limpeza', label: 'Produtos de Limpeza' },
      { value: 'distrib_material_eletrico_hidraulico', label: 'Material Elétrico/Hidráulico' },
      { value: 'distrib_autopecas', label: 'Autopeças' },
      { value: 'distrib_diversos', label: 'Diversos' },
    ],
  },
  {
    value: 'industria', label: 'Indústria', segmentos: [
      { value: 'industria_alimenticia', label: 'Alimentícia' },
      { value: 'industria_vestuario_textil', label: 'Vestuário e Têxtil' },
      { value: 'industria_metalurgica_serralheria', label: 'Metalúrgica / Serralheria' },
      { value: 'industria_moveis', label: 'Móveis' },
      { value: 'industria_grafica', label: 'Gráfica' },
      { value: 'industria_quimica_cosmeticos', label: 'Química / Cosméticos' },
      { value: 'industria_outros', label: 'Outros' },
    ],
  },
  {
    value: 'transportadora_logistica', label: 'Transportadora / Logística', segmentos: [
      { value: 'transporte_carga', label: 'Carga' },
      { value: 'transporte_passageiros_fretamento', label: 'Passageiros / Fretamento' },
      { value: 'transporte_mudancas', label: 'Mudanças' },
      { value: 'transporte_entregas', label: 'Entregas' },
      { value: 'transporte_armazenagem', label: 'Armazenagem' },
    ],
  },
  {
    value: 'alimentacao', label: 'Alimentação', segmentos: [
      { value: 'restaurante', label: 'Restaurante' },
      { value: 'padaria_confeitaria', label: 'Padaria / Confeitaria' },
      { value: 'lanchonete', label: 'Lanchonete' },
      { value: 'bar', label: 'Bar' },
      { value: 'delivery_marmitaria', label: 'Delivery / Marmitaria' },
      { value: 'acougue', label: 'Açougue' },
      { value: 'hortifruti', label: 'Hortifruti' },
      { value: 'cafeteria', label: 'Cafeteria' },
    ],
  },
  {
    value: 'construcao_civil', label: 'Construção Civil', segmentos: [
      { value: 'construtora_incorporadora', label: 'Construtora / Incorporadora' },
      { value: 'mao_de_obra_alvenaria', label: 'Mão de Obra / Alvenaria' },
      { value: 'instalacoes', label: 'Instalações (Elétrica, Hidráulica)' },
      { value: 'engenharia_arquitetura', label: 'Engenharia / Arquitetura' },
      { value: 'materiais_insumos_obra', label: 'Materiais e Insumos' },
    ],
  },
  {
    value: 'imobiliaria', label: 'Imobiliária', segmentos: [
      { value: 'corretagem_imoveis', label: 'Corretagem' },
      { value: 'incorporacao_imobiliaria', label: 'Incorporação' },
      { value: 'administracao_locacao', label: 'Administração / Locação' },
      { value: 'condominios', label: 'Condomínios' },
    ],
  },
  {
    value: 'automotivo', label: 'Automotivo', segmentos: [
      { value: 'oficina_mecanica', label: 'Oficina Mecânica' },
      { value: 'pecas_acessorios_veiculos', label: 'Peças e Acessórios' },
      { value: 'estacionamento', label: 'Estacionamento' },
      { value: 'estetica_automotiva', label: 'Estética Automotiva / Lavagem' },
      { value: 'reboque_guincho', label: 'Reboque / Guincho' },
      { value: 'concessionaria_revenda', label: 'Concessionária / Revenda de Veículos' },
    ],
  },
  {
    value: 'servicos_profissionais', label: 'Serviços Profissionais / Administrativos', segmentos: [
      { value: 'contabilidade', label: 'Contabilidade' },
      { value: 'advocacia', label: 'Advocacia' },
      { value: 'consultoria', label: 'Consultoria' },
      { value: 'escritorio_apoio_administrativo', label: 'Escritório / Apoio Administrativo' },
      { value: 'representacao_comercial', label: 'Representação Comercial' },
      { value: 'marketing_publicidade', label: 'Marketing / Publicidade' },
    ],
  },
  {
    value: 'saude', label: 'Saúde', segmentos: [
      { value: 'clinica_medica', label: 'Clínica Médica' },
      { value: 'odontologia', label: 'Odontologia' },
      { value: 'farmacia_saude', label: 'Farmácia' },
      { value: 'terapias_psicologia', label: 'Terapias / Psicologia' },
    ],
  },
  {
    value: 'beleza_estetica', label: 'Beleza e Estética', segmentos: [
      { value: 'salao_beleza', label: 'Salão de Beleza' },
      { value: 'barbearia', label: 'Barbearia' },
      { value: 'estetica_spa', label: 'Estética / Spa' },
      { value: 'nail_designer', label: 'Nail Designer' },
    ],
  },
  {
    value: 'academia_condicionamento_fisico', label: 'Academia / Condicionamento Físico', segmentos: [
      { value: 'academia', label: 'Academia' },
      { value: 'estudio_personal', label: 'Estúdio / Personal Trainer' },
      { value: 'crossfit_boxe_artes_marciais', label: 'Crossfit / Boxe / Artes Marciais' },
    ],
  },
  {
    value: 'educacao', label: 'Educação', segmentos: [
      { value: 'escola_ensino_regular', label: 'Escola / Ensino Regular' },
      { value: 'curso_livre_idiomas', label: 'Curso Livre / Idiomas' },
      { value: 'treinamento_corporativo', label: 'Treinamento Corporativo' },
      { value: 'creche', label: 'Creche' },
    ],
  },
  {
    value: 'agropecuaria', label: 'Agropecuária', segmentos: [
      { value: 'agricultura', label: 'Agricultura' },
      { value: 'pecuaria', label: 'Pecuária' },
      { value: 'insumos_agricolas', label: 'Insumos Agrícolas' },
      { value: 'agroindustria', label: 'Agroindústria' },
    ],
  },
  {
    value: 'tecnologia_ti', label: 'Tecnologia / TI', segmentos: [
      { value: 'desenvolvimento_software', label: 'Desenvolvimento de Software' },
      { value: 'suporte_infraestrutura_ti', label: 'Suporte / Infraestrutura' },
      { value: 'ecommerce', label: 'E-commerce' },
      { value: 'marketing_digital', label: 'Marketing Digital' },
    ],
  },
  {
    value: 'servicos_financeiros', label: 'Serviços Financeiros / Seguros', segmentos: [
      { value: 'corretora_seguros', label: 'Corretora de Seguros' },
      { value: 'consorcio', label: 'Consórcio' },
      { value: 'assessoria_investimentos', label: 'Assessoria de Investimentos' },
      { value: 'fintech', label: 'Fintech' },
    ],
  },
  {
    value: 'turismo_hospedagem', label: 'Turismo / Hospedagem', segmentos: [
      { value: 'hotel_pousada', label: 'Hotel / Pousada' },
      { value: 'agencia_viagens', label: 'Agência de Viagens' },
      { value: 'locacao_temporada', label: 'Locação de Temporada' },
    ],
  },
  {
    value: 'entretenimento_eventos', label: 'Entretenimento / Eventos', segmentos: [
      { value: 'buffet', label: 'Buffet' },
      { value: 'produtora_eventos', label: 'Produtora de Eventos' },
      { value: 'casa_noturna', label: 'Casa Noturna' },
      { value: 'locacao_equipamentos_eventos', label: 'Locação de Equipamentos' },
    ],
  },
  {
    value: 'terceiro_setor', label: 'Terceiro Setor', segmentos: [
      { value: 'organizacao_religiosa', label: 'Organização Religiosa' },
      { value: 'associacao_ong', label: 'Associação / ONG' },
    ],
  },
  {
    value: 'outros_setor', label: 'Outros', segmentos: [
      { value: 'outros_segmento', label: 'Outros' },
    ],
  },
];

export function getSegmentos(setorValue: string | null | undefined): SegmentoOption[] {
  return SETORES_ATUACAO.find(s => s.value === setorValue)?.segmentos ?? [];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Checadas em ordem — entradas mais específicas primeiro, senão "comércio varejista de X"
// bateria antes de casar o X específico (ex.: "restaurante" antes de cair em genérico).
const CNAE_INFERENCE_RULES: { keywords: string[]; setor: string; segmento: string }[] = [
  { keywords: ['restaurante'], setor: 'alimentacao', segmento: 'restaurante' },
  { keywords: ['padaria', 'confeitaria'], setor: 'alimentacao', segmento: 'padaria_confeitaria' },
  { keywords: ['lanchonete', 'casas de cha', 'sucos'], setor: 'alimentacao', segmento: 'lanchonete' },
  { keywords: ['cafeteria', 'casas de cha'], setor: 'alimentacao', segmento: 'cafeteria' },
  { keywords: ['bar e', 'bares e', 'boate'], setor: 'alimentacao', segmento: 'bar' },
  { keywords: ['acougue', 'carnes'], setor: 'alimentacao', segmento: 'acougue' },
  { keywords: ['hortifrutigranjeiro', 'hortifruti'], setor: 'alimentacao', segmento: 'hortifruti' },
  { keywords: ['servico movel de alimentacao', 'marmitaria', 'preparacao de refeicoes'], setor: 'alimentacao', segmento: 'delivery_marmitaria' },

  { keywords: ['transporte rodoviario de carga', 'transporte de carga', 'mudancas'], setor: 'transportadora_logistica', segmento: 'transporte_carga' },
  { keywords: ['transporte rodoviario coletivo de passageiros', 'fretamento', 'transporte escolar'], setor: 'transportadora_logistica', segmento: 'transporte_passageiros_fretamento' },
  { keywords: ['armazenamento', 'deposito de mercadorias'], setor: 'transportadora_logistica', segmento: 'transporte_armazenagem' },
  { keywords: ['entrega rapida', 'entregador'], setor: 'transportadora_logistica', segmento: 'transporte_entregas' },

  { keywords: ['comercio atacadista'], setor: 'comercio_atacadista', segmento: 'atacado_nao_especializado' },
  { keywords: ['representantes comerciais e agentes do comercio'], setor: 'servicos_profissionais', segmento: 'representacao_comercial' },

  { keywords: ['comercio varejista de artigos do vestuario', 'comercio varejista de artigos de vestuario'], setor: 'comercio_varejista', segmento: 'vestuario_acessorios' },
  { keywords: ['comercio varejista de calcados'], setor: 'comercio_varejista', segmento: 'calcados' },
  { keywords: ['minimercados', 'mercearias', 'comercio varejista de mercadorias em geral'], setor: 'comercio_varejista', segmento: 'supermercado_mercearia' },
  { keywords: ['comercio varejista de materiais de construcao'], setor: 'comercio_varejista', segmento: 'material_construcao' },
  { keywords: ['comercio varejista de moveis', 'colchoaria'], setor: 'comercio_varejista', segmento: 'moveis_colchoes' },
  { keywords: ['comercio varejista de material eletrico'], setor: 'comercio_varejista', segmento: 'material_eletrico' },
  { keywords: ['pecas e acessorios novos para veiculos', 'pecas e acessorios usados para veiculos'], setor: 'comercio_varejista', segmento: 'pecas_acessorios_automotivos' },
  { keywords: ['animais vivos', 'artigos e alimentos para animais de estimacao'], setor: 'comercio_varejista', segmento: 'pet_shop' },
  { keywords: ['comercio varejista de produtos farmaceuticos'], setor: 'comercio_varejista', segmento: 'farmacia_varejo' },
  { keywords: ['comercio varejista de bebidas'], setor: 'comercio_varejista', segmento: 'bebidas' },
  { keywords: ['gas liquefeito de petroleo', 'gas gpl'], setor: 'comercio_varejista', segmento: 'gas_glp' },
  { keywords: ['livros, jornais e outras publicacoes', 'papelaria'], setor: 'comercio_varejista', segmento: 'papelaria_livraria' },
  { keywords: ['comercio varejista'], setor: 'comercio_varejista', segmento: 'outros_varejo' },

  { keywords: ['obras de alvenaria'], setor: 'construcao_civil', segmento: 'mao_de_obra_alvenaria' },
  { keywords: ['incorporacao de empreendimentos imobiliarios'], setor: 'construcao_civil', segmento: 'construtora_incorporadora' },
  { keywords: ['instalacoes eletricas', 'instalacoes hidraulicas', 'instalacao e manutencao'], setor: 'construcao_civil', segmento: 'instalacoes' },
  { keywords: ['servicos de engenharia', 'servicos de arquitetura'], setor: 'construcao_civil', segmento: 'engenharia_arquitetura' },
  { keywords: ['construcao de edificios', 'servicos especializados para construcao'], setor: 'construcao_civil', segmento: 'mao_de_obra_alvenaria' },

  { keywords: ['corretagem na compra e venda e avaliacao de imoveis'], setor: 'imobiliaria', segmento: 'corretagem_imoveis' },
  { keywords: ['incorporacao de empreendimentos imobiliarios'], setor: 'imobiliaria', segmento: 'incorporacao_imobiliaria' },
  { keywords: ['administracao de imoveis'], setor: 'imobiliaria', segmento: 'administracao_locacao' },
  { keywords: ['gestao e administracao da propriedade imobiliaria', 'condominio'], setor: 'imobiliaria', segmento: 'condominios' },

  { keywords: ['manutencao e reparacao', 'reparacao mecanica de veiculos', 'usinagem, torneiria e solda'], setor: 'automotivo', segmento: 'oficina_mecanica' },
  { keywords: ['estacionamento de veiculos'], setor: 'automotivo', segmento: 'estacionamento' },
  { keywords: ['lavagem, lubrificacao e polimento de veiculos'], setor: 'automotivo', segmento: 'estetica_automotiva' },
  { keywords: ['reboque de veiculos'], setor: 'automotivo', segmento: 'reboque_guincho' },
  { keywords: ['comercio a varejo de automoveis', 'comercio de veiculos automotores'], setor: 'automotivo', segmento: 'concessionaria_revenda' },

  { keywords: ['atividades de contabilidade'], setor: 'servicos_profissionais', segmento: 'contabilidade' },
  { keywords: ['atividades juridicas', 'advocacia'], setor: 'servicos_profissionais', segmento: 'advocacia' },
  { keywords: ['consultoria em gestao empresarial', 'atividades de consultoria'], setor: 'servicos_profissionais', segmento: 'consultoria' },
  { keywords: ['servicos combinados de escritorio e apoio administrativo'], setor: 'servicos_profissionais', segmento: 'escritorio_apoio_administrativo' },
  { keywords: ['agencias de publicidade', 'promocao de vendas', 'marketing'], setor: 'servicos_profissionais', segmento: 'marketing_publicidade' },

  { keywords: ['atividades de atendimento hospitalar', 'clinicas medicas'], setor: 'saude', segmento: 'clinica_medica' },
  { keywords: ['atividade odontologica'], setor: 'saude', segmento: 'odontologia' },
  { keywords: ['atividades de psicologia e psicanalise', 'fisioterapia'], setor: 'saude', segmento: 'terapias_psicologia' },

  { keywords: ['cabeleireiros', 'salao de beleza'], setor: 'beleza_estetica', segmento: 'salao_beleza' },
  { keywords: ['barbearia'], setor: 'beleza_estetica', segmento: 'barbearia' },
  { keywords: ['atividades de estetica e outros servicos de cuidados com a beleza'], setor: 'beleza_estetica', segmento: 'estetica_spa' },

  { keywords: ['atividades de condicionamento fisico'], setor: 'academia_condicionamento_fisico', segmento: 'academia' },
  { keywords: ['lutas', 'artes marciais'], setor: 'academia_condicionamento_fisico', segmento: 'crossfit_boxe_artes_marciais' },

  { keywords: ['ensino de idiomas'], setor: 'educacao', segmento: 'curso_livre_idiomas' },
  { keywords: ['treinamento em desenvolvimento profissional e gerencial', 'treinamento em informatica'], setor: 'educacao', segmento: 'treinamento_corporativo' },
  { keywords: ['educacao infantil', 'creche'], setor: 'educacao', segmento: 'creche' },
  { keywords: ['ensino fundamental', 'ensino medio', 'estabelecimentos de ensino'], setor: 'educacao', segmento: 'escola_ensino_regular' },

  { keywords: ['cultivo', 'producao de lavouras', 'agricultura'], setor: 'agropecuaria', segmento: 'agricultura' },
  { keywords: ['criacao de', 'pecuaria'], setor: 'agropecuaria', segmento: 'pecuaria' },

  { keywords: ['desenvolvimento de programas de computador', 'programacao sob encomenda', 'desenvolvimento e licenciamento de software'], setor: 'tecnologia_ti', segmento: 'desenvolvimento_software' },
  { keywords: ['suporte tecnico', 'infraestrutura de tecnologia da informacao'], setor: 'tecnologia_ti', segmento: 'suporte_infraestrutura_ti' },
  { keywords: ['comercio varejista realizado atraves de internet'], setor: 'tecnologia_ti', segmento: 'ecommerce' },

  { keywords: ['corretores e agentes de seguros'], setor: 'servicos_financeiros', segmento: 'corretora_seguros' },
  { keywords: ['administracao de consorcios'], setor: 'servicos_financeiros', segmento: 'consorcio' },

  { keywords: ['hoteis', 'pousadas'], setor: 'turismo_hospedagem', segmento: 'hotel_pousada' },
  { keywords: ['agencias de viagens'], setor: 'turismo_hospedagem', segmento: 'agencia_viagens' },

  { keywords: ['casas de festas e eventos', 'buffet'], setor: 'entretenimento_eventos', segmento: 'buffet' },

  { keywords: ['atividades de organizacoes religiosas'], setor: 'terceiro_setor', segmento: 'organizacao_religiosa' },
  { keywords: ['atividades de associacoes'], setor: 'terceiro_setor', segmento: 'associacao_ong' },

  { keywords: ['fabricacao de artigos de serralheria', 'servicos de usinagem'], setor: 'industria', segmento: 'industria_metalurgica_serralheria' },
  { keywords: ['impressao de material'], setor: 'industria', segmento: 'industria_grafica' },
  { keywords: ['fabricacao de'], setor: 'industria', segmento: 'industria_outros' },

  { keywords: ['coleta de residuos'], setor: 'servicos_profissionais', segmento: 'escritorio_apoio_administrativo' },
];

/** Sugere setor/segmento a partir da descrição do CNAE — sempre editável manualmente depois. */
export function inferRamoFromCnaeDescricao(descricao: string | null | undefined): { setor: string; segmento: string } | null {
  if (!descricao) return null;
  const norm = normalize(descricao);
  for (const rule of CNAE_INFERENCE_RULES) {
    if (rule.keywords.some(k => norm.includes(normalize(k)))) {
      return { setor: rule.setor, segmento: rule.segmento };
    }
  }
  return null;
}
