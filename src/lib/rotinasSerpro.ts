/**
 * Rotinas automáticas ligadas ao Serpro (agendador do banco) e o que cada uma custa. Fonte da tela Tech > Consumo Serpro.
 * Quando uma rotina nova for agendada, entra aqui na mesma hora (com o tipo de chamada que ela faz): o custo fixo por mês da tela é calculado desta lista.
 * `chamadasPorMes` conta só as chamadas ao Serpro; rotinas que leem o que já está salvo no sistema têm 0.
 */
export type TipoRotina = 'Monitorar' | 'Consultar' | 'Emitir' | 'sem_chamada';

/** Rotinas que cobram e têm interruptor próprio em Tech (colunas de serpro_config). */
export type InterruptorRotina = 'auto_rotina_pgdas' | 'auto_lote_pagamentos_simples' | 'auto_lote_pagamentos_presumido_real' | 'auto_leitura_faturamento' | 'auto_rotina_defis' | 'auto_rotina_sitfis' | 'auto_rotina_dctfweb';

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
    id: 'lote-simples', nome: 'Pagamentos do Simples: detalhes de quem pagou, no dia 30', quando: 'dia 30 (em fevereiro, o último dia do mês), 18:00', tipo: 'Consultar', chamadasPorMes: 116, interruptor: 'auto_lote_pagamentos_simples', padraoLigado: false,
    faz: 'Relê o sensor gratuito de pagamentos e consulta Pagamentos na Receita só dos clientes do Simples que tiveram pagamento no mês (quem não pagou nada não é cobrado): traz os documentos pagos com data, valor e composição (o DAS e os demais) e conclui a tarefa do DAS de quem pagou. Ao terminar, avisa no sino quantos DAS continuam sem pagamento. Estimativa: 116 dos 146 clientes consultáveis.',
  },
  {
    id: 'lote-presumido-real', nome: 'Pagamentos do Presumido e do Real: consulta completa no dia 30', quando: 'dia 30 (em fevereiro, o último dia do mês), 18:10', tipo: 'Consultar', chamadasPorMes: 35, interruptor: 'auto_lote_pagamentos_presumido_real', padraoLigado: false,
    faz: 'Consulta Pagamentos na Receita de todos os clientes do Presumido e do Real (matriz): traz os DARF pagos do mês anterior e conclui as tarefas de PIS/COFINS e IRPJ/CSLL quando os dois tributos foram pagos. Estimativa: 35 clientes consultáveis.',
  },
  {
    id: 'leitura-faturamento', nome: 'Faturamento do Simples: leitura do PDF da declaração, a cada dois meses', quando: 'dia 30 de outubro, dezembro, fevereiro (último dia), abril, junho e agosto, de 18:20 a 18:55', tipo: 'Consultar', chamadasPorMes: 72, interruptor: 'auto_leitura_faturamento', padraoLigado: true,
    faz: 'Baixa e lê o PDF da declaração do mês anterior de todos os clientes do Simples e guarda receita, acumulados de 12 meses e do ano, limite, sublimite e fator r, que alimentam o cartão "Faturamento e limites". A primeira leitura é em 30/10/2026. Ao terminar, avisa no sino quantos estão acima do limite, em atenção ou perto do sublimite. Estimativa: 144 clientes por rodada, ou seja, 72 consultas por mês na média (cerca de R$ 34,56 por rodada).',
  },
  {
    id: 'defis-anual', nome: 'DEFIS: quem entregou a declaração anual (duas rodadas por ano)', quando: '15 de março (todos) e dia seguinte ao prazo, 1º de abril de 2027 (só quem continua sem a DEFIS), de 08:20 a 08:30', tipo: 'Consultar', chamadasPorMes: 16, interruptor: 'auto_rotina_defis', padraoLigado: true,
    faz: 'Em 15 de março, consulta o índice das DEFIS de cada cliente do Simples que ainda não tem a do ano na lista, para a equipe cobrar antes do prazo. No dia seguinte ao prazo (31 de março, ou o próximo dia útil), consulta de novo só quem continua sem a DEFIS: a consulta depois do prazo é a prova de "não entregue". Fora do escopo: empresa aberta depois do ano, filial e quem não tem procuração. Estimativa: cerca de 190 consultas por ano (uns 16 por mês na média).',
  },
  {
    id: 'sitfis-bimestral', nome: 'Situação fiscal: relatório de todos os clientes, a cada dois meses', quando: 'dia 30 de outubro, dezembro, fevereiro (último dia), abril, junho e agosto, de 19:00 a 19:55', tipo: 'Emitir', chamadasPorMes: 99, interruptor: 'auto_rotina_sitfis', padraoLigado: true,
    faz: 'Gera o relatório de situação fiscal de todos os clientes ativos (matriz) e lê o resultado: sem pendências, com pendências ou a conferir. O pedido do protocolo é grátis; cada relatório emitido custa R$ 0,32. A primeira rodada é em 30/10/2026, sem rodada de atualização antes. Ao terminar, avisa no sino; no dia seguinte às 08:00, a rotina de tarefas cria a tarefa de quem tem pendência. Estimativa: 197 clientes por rodada, ou seja, 99 emissões por mês na média (cerca de R$ 63 por rodada).',
  },
  {
    id: 'dctfweb-mensal', nome: 'DCTFWeb e MIT: consulta do mês de quem teve movimento novo', quando: 'dia 30 de cada mês (em fevereiro, o último dia), de 20:00 a 20:25', tipo: 'Consultar', chamadasPorMes: 70, interruptor: 'auto_rotina_dctfweb', padraoLigado: true,
    faz: 'Consulta só os clientes do Lucro Presumido e do Lucro Real que a rotina gratuita das 07:40 marcou como "Movimento novo": traz o recibo da DCTFWeb do mês anterior e as apurações da MIT do ano (2 consultas por cliente) e guarda o recibo. Quem não teve movimento não é consultado nem cobrado. Conclui as tarefas "DCTF" e "MIT" de quem entregou. A primeira rodada é em 30/10/2026, sem rodada de atualização antes. Ao terminar, avisa no sino. Estimativa: no máximo 35 clientes por rodada, ou seja, até 70 consultas por mês (quanto menos clientes com movimento, menos custa).',
  },
  {
    id: 'procuracoes', nome: 'Procurações: aviso de vencimento', quando: 'toda segunda, 08:00', tipo: 'sem_chamada', chamadasPorMes: 0,
    faz: 'Avisa no sino as procurações que vencem em até 60 dias. Lê só o que já está salvo.',
  },
  {
    id: 'tarefas', nome: 'Tarefas fiscais criadas pela Receita', quando: 'todo dia, 08:00', tipo: 'sem_chamada', chamadasPorMes: 0,
    faz: 'Cria tarefa com o responsável do cliente para comunicação crítica e pendência na Situação Fiscal. Lê só o que já está salvo.',
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
