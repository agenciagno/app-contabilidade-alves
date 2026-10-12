/**
 * Rotinas automáticas ligadas ao Serpro (agendador do banco) e o que cada uma custa. Fonte da tela Tech > SERPRO.
 * Quando uma rotina nova for agendada, entra aqui na mesma hora (com o tipo de chamada que ela faz): o custo fixo por mês da tela é calculado desta lista.
 * `chamadasPorMes` conta só as chamadas ao Serpro; rotinas que leem o que já está salvo no sistema têm 0.
 * `nome` e `quando` aparecem na tabela: curtos, sem explicar o fluxo (a explicação fica nos cartões da aba Rotinas / Automações).
 */
export type TipoRotina = 'Monitorar' | 'Consultar' | 'Emitir' | 'sem_chamada';

/** Rotinas que cobram e têm interruptor próprio em Tech (colunas de serpro_config). */
export type InterruptorRotina = 'auto_rotina_pgdas' | 'auto_lote_pagamentos_simples' | 'auto_lote_pagamentos_presumido_real' | 'auto_leitura_faturamento' | 'auto_rotina_defis' | 'auto_rotina_sitfis' | 'auto_rotina_dctfweb';

export interface RotinaSerpro {
  id: string;
  nome: string;
  quando: string;
  tipo: TipoRotina;
  chamadasPorMes: number;
  /** Com interruptor, a rotina só entra no custo fixo enquanto estiver ligada. */
  interruptor?: InterruptorRotina;
  /** Estado de fábrica enquanto a configuração ainda não carregou (igual ao padrão da coluna no banco). */
  padraoLigado?: boolean;
}

/** Só `Consultar` e `Emitir` são cobrados. Monitorar (eventos e indicador) e Apoiar são gratuitos. */
export const cobra = (r: Pick<RotinaSerpro, 'tipo'>) => r.tipo === 'Consultar' || r.tipo === 'Emitir';

export const ROTINAS: RotinaSerpro[] = [
  { id: 'caixa-postal', nome: 'Caixa Postal: mensagem nova', quando: 'Todo dia, 07:30', tipo: 'Monitorar', chamadasPorMes: 60 },
  { id: 'pagamentos', nome: 'Pagamentos: pagamento novo', quando: 'Todo dia, 07:35', tipo: 'Monitorar', chamadasPorMes: 60 },
  { id: 'dctfweb', nome: 'DCTFWeb: movimento novo', quando: 'Todo dia, 07:40', tipo: 'Monitorar', chamadasPorMes: 60 },
  // 146 clientes do Simples no dia 16 + até 30 no dia seguinte ao prazo.
  {
    id: 'pgdas-consulta', nome: 'PGDAS-D: quem transmitiu', quando: 'Dia 16 (todos) e dia seguinte ao prazo (só quem falta), 07:45', tipo: 'Consultar', chamadasPorMes: 146 + 30,
    interruptor: 'auto_rotina_pgdas', padraoLigado: true,
  },
  // 116 dos 146 clientes consultáveis do Simples (quem pagou no mês).
  {
    id: 'lote-simples', nome: 'Pagamentos do Simples: detalhes de quem pagou', quando: 'Dia 30 (fev.: último dia), 18:00', tipo: 'Consultar', chamadasPorMes: 116,
    interruptor: 'auto_lote_pagamentos_simples', padraoLigado: false,
  },
  // 35 clientes consultáveis do Presumido e do Real (matriz).
  {
    id: 'lote-presumido-real', nome: 'Pagamentos do Presumido e do Real: todos', quando: 'Dia 30 (fev.: último dia), 18:10', tipo: 'Consultar', chamadasPorMes: 35,
    interruptor: 'auto_lote_pagamentos_presumido_real', padraoLigado: false,
  },
  // 144 clientes do Simples por rodada, uma rodada por mês.
  {
    id: 'leitura-faturamento', nome: 'Faturamento do Simples: ler a declaração', quando: 'Dia 30 (fev.: último dia), 18:20', tipo: 'Consultar', chamadasPorMes: 144,
    interruptor: 'auto_leitura_faturamento', padraoLigado: true,
  },
  // Cerca de 190 consultas por ano (15/03 e dia seguinte ao prazo), uns 16 por mês na média.
  {
    id: 'defis-anual', nome: 'DEFIS: quem entregou', quando: '15 de março (todos) e dia seguinte ao prazo (só quem falta), 08:20', tipo: 'Consultar', chamadasPorMes: 16,
    interruptor: 'auto_rotina_defis', padraoLigado: true,
  },
  // 197 clientes ativos (matriz) por rodada, uma emissão por cliente, uma rodada por mês.
  {
    id: 'sitfis-mensal', nome: 'Situação fiscal: relatório de todos', quando: 'Dia 30 (fev.: último dia), 19:00', tipo: 'Emitir', chamadasPorMes: 197,
    interruptor: 'auto_rotina_sitfis', padraoLigado: true,
  },
  // No máximo 35 clientes com movimento, 2 consultas por cliente (recibo da DCTFWeb e apurações da MIT).
  {
    id: 'dctfweb-mensal', nome: 'DCTFWeb e MIT: quem teve movimento', quando: 'Dia 30 (fev.: último dia), 20:00', tipo: 'Consultar', chamadasPorMes: 70,
    interruptor: 'auto_rotina_dctfweb', padraoLigado: true,
  },
  { id: 'procuracoes', nome: 'Procurações: aviso de vencimento', quando: 'Toda segunda, 08:00', tipo: 'sem_chamada', chamadasPorMes: 0 },
  { id: 'tarefas', nome: 'Tarefas fiscais: criar sozinho', quando: 'Todo dia, 08:00', tipo: 'sem_chamada', chamadasPorMes: 0 },
  { id: 'das', nome: 'DAS: aviso do vencimento', quando: 'Dia 20 (fim de semana: segunda), 08:05', tipo: 'sem_chamada', chamadasPorMes: 0 },
  { id: 'pgdas', nome: 'PGDAS-D: aviso do prazo', quando: 'Dia seguinte ao prazo, 08:10', tipo: 'sem_chamada', chamadasPorMes: 0 },
];
