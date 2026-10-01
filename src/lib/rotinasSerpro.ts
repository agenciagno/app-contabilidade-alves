/**
 * Rotinas automáticas ligadas ao Serpro (agendador do banco) e o que cada uma custa. Fonte da tela Tech > Consumo Serpro.
 * Quando uma rotina nova for agendada, entra aqui na mesma hora (com o tipo de chamada que ela faz): o custo fixo por mês da tela é calculado desta lista.
 * `chamadasPorMes` conta só as chamadas ao Serpro; rotinas que leem o que já está salvo no sistema têm 0.
 */
export type TipoRotina = 'Monitorar' | 'Consultar' | 'Emitir' | 'sem_chamada';

/** Rotinas que cobram e têm interruptor próprio em Tech (colunas de serpro_config). */
export type InterruptorRotina = 'auto_rotina_pgdas' | 'auto_lote_pagamentos_simples' | 'auto_lote_pagamentos_presumido_real';

export interface RotinaSerpro {
  id: string;
  nome: string;
  quando: string;
  faz: string;
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
  {
    id: 'caixa-postal', nome: 'Caixa Postal: mensagem nova (evento E0601)', quando: 'todo dia, 07:30', tipo: 'Monitorar', chamadasPorMes: 60,
    faz: 'Pergunta à Receita, de uma vez para a carteira toda, qual cliente recebeu mensagem nova e quem perdeu a procuração. Só marca o selo e avisa. Não abre mensagem.',
  },
  {
    id: 'pagamentos', nome: 'Pagamentos: pagamento novo (evento E0701)', quando: 'todo dia, 07:35', tipo: 'Monitorar', chamadasPorMes: 60,
    faz: 'Pergunta à Receita quais clientes tiveram mudança em pagamentos. Só marca "pagamento novo"; quem consulta o detalhe é a equipe, por clique.',
  },
  {
    id: 'dctfweb', nome: 'DCTFWeb: movimento novo (evento E0301)', quando: 'todo dia, 07:40', tipo: 'Monitorar', chamadasPorMes: 60,
    faz: 'Pergunta à Receita quais clientes do Lucro Presumido e do Real tiveram eSocial, EFD-Reinf ou transmissão da DCTFWeb. Só marca "movimento novo".',
  },
  {
    id: 'pgdas-consulta', nome: 'PGDAS-D: quem transmitiu o mês (consulta do ano de cada cliente do Simples)', quando: 'dia 16 (carteira toda) e no dia seguinte ao prazo (só quem ainda não transmitiu), de 07:45 a 08:00', tipo: 'Consultar', chamadasPorMes: 146 + 30, interruptor: 'auto_rotina_pgdas', padraoLigado: true,
    faz: 'No dia 16, consulta o ano de todos os clientes do Simples: mostra quem já transmitiu o mês anterior, quais DAS foram gerados e quais estão pagos, e conclui a tarefa "DAS - Simples Nacional" de quem transmitiu. No dia seguinte ao prazo (dia 20, ou o próximo dia útil), consulta de novo só quem ainda não transmitiu: a consulta depois do prazo é a prova de "não transmitida". Estimativa: 146 clientes no dia 16 e até 30 no dia seguinte ao prazo. Quem não tem procuração não é consultado.',
  },
  {
    id: 'lote-simples', nome: 'Pagamentos do Simples: lote do dia 30 (quem ainda não pagou o DAS)', quando: 'dia 30 (em fevereiro, o último dia do mês), 07:10', tipo: 'Consultar', chamadasPorMes: 25, interruptor: 'auto_lote_pagamentos_simples', padraoLigado: false,
    faz: 'Consulta Pagamentos na Receita só dos clientes do Simples que têm DAS do mês anterior sem pagamento registrado: mostra quem pagou depois do vencimento (com data e valor) e conclui a tarefa do DAS de quem pagou. Ao terminar, avisa no sino quantos continuam sem pagamento. Estimativa: cerca de 25 clientes por mês.',
  },
  {
    id: 'lote-presumido-real', nome: 'Pagamentos do Presumido e do Real: lote do dia 30', quando: 'dia 30 (em fevereiro, o último dia do mês), 07:20', tipo: 'Consultar', chamadasPorMes: 36, interruptor: 'auto_lote_pagamentos_presumido_real', padraoLigado: false,
    faz: 'Consulta Pagamentos na Receita de todos os clientes do Presumido e do Real (matriz): traz os DARF pagos do mês anterior e conclui as tarefas de PIS/COFINS e IRPJ/CSLL quando os dois tributos foram pagos. Estimativa: 36 clientes por mês.',
  },
  {
    id: 'procuracoes', nome: 'Procurações: aviso de vencimento', quando: 'toda segunda, 08:00', tipo: 'sem_chamada', chamadasPorMes: 0,
    faz: 'Avisa no sino as procurações que vencem em até 60 dias. Lê só o que já está salvo.',
  },
  {
    id: 'tarefas', nome: 'Tarefas fiscais criadas pela Receita', quando: 'todo dia, 08:00', tipo: 'sem_chamada', chamadasPorMes: 0,
    faz: 'Cria tarefa com o responsável do cliente para comunicação crítica, pendência na Situação Fiscal e parcela em atraso. Lê só o que já está salvo.',
  },
  {
    id: 'das', nome: 'Aviso do vencimento do DAS', quando: 'dia 20 (segunda se cair no fim de semana), 08:05', tipo: 'sem_chamada', chamadasPorMes: 0,
    faz: 'Avisa no sino quantos clientes estão sem pagamento registrado e quantos do Simples ainda não foram consultados. Lê só o que já está salvo.',
  },
  {
    id: 'pgdas', nome: 'Aviso do prazo do PGDAS-D', quando: 'dia seguinte ao prazo, 08:10', tipo: 'sem_chamada', chamadasPorMes: 0,
    faz: 'Avisa no sino que o prazo terminou e quantos clientes ainda precisam ser consultados para saber quem não transmitiu. Lê só o que já está salvo.',
  },
];
