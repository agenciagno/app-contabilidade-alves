/**
 * Rotinas automáticas ligadas ao Serpro (agendador do banco) e o que cada uma custa. Fonte da tela Tech > Consumo Serpro.
 * Quando uma rotina nova for agendada, entra aqui na mesma hora (com o tipo de chamada que ela faz): o custo fixo por mês da tela é calculado desta lista.
 * `chamadasPorMes` conta só as chamadas ao Serpro; rotinas que leem o que já está salvo no sistema têm 0.
 */
export type TipoRotina = 'Monitorar' | 'Consultar' | 'Emitir' | 'sem_chamada';

export interface RotinaSerpro {
  id: string;
  nome: string;
  quando: string;
  faz: string;
  tipo: TipoRotina;
  chamadasPorMes: number;
}

/** Só `Consultar` e `Emitir` são cobrados. Monitorar (eventos e indicador) e Apoiar são gratuitos. */
export const cobra = (r: Pick<RotinaSerpro, 'tipo'>) => r.tipo === 'Consultar' || r.tipo === 'Emitir';

export const ROTINAS_ATIVAS: RotinaSerpro[] = [
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

/** Ideias estudadas que NÃO estão ligadas: nada disto roda hoje. Estimativa com a carteira de 01/10/2026 (153 do Simples, 37 do Presumido e Real). */
export const ROTINAS_NAO_ATIVADAS: { nome: string; consultasPorMes: number; nota: string }[] = [
  { nome: 'PGDAS de toda a carteira do Simples (dia 16 em todos e dia 21 só nos pendentes)', consultasPorMes: 153 + 30, nota: 'diz quem transmitiu e quem não, antes do prazo' },
  { nome: 'Pagamentos dos clientes do Presumido e do Real, uma vez por mês', consultasPorMes: 37, nota: 'alimenta as tarefas de PIS/COFINS e IRPJ/CSLL' },
];
