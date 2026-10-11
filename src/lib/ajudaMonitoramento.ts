/**
 * Textos do "Como funciona" de cada tela do Monitoramento (11/10/2026, pedido de Gabriel): tira-dúvidas para a equipe saber o que cada
 * botão e cada rotina faz. Regra do pedido: dizer a função, sem informar o que é pago ou gratuito.
 * Os horários das rotinas vêm de `rotinasSerpro.ts` e dos agendamentos do banco; mudou lá, ajuste aqui.
 */
export type TelaAjuda =
  | 'dashboard' | 'caixa-postal' | 'simples' | 'situacao-fiscal' | 'dctfweb-mit' | 'parcelamentos'
  | 'procuracoes' | 'eprocesso' | 'relatorios' | 'pagamentos' | 'conferencia';

export interface ItemAjuda { nome: string; texto: string }
export interface GrupoAjuda { titulo?: string; itens: ItemAjuda[] }

export interface AjudaTela {
  titulo: string;
  /** Uma frase: para que serve a tela. */
  resumo: string;
  rotinas: ItemAjuda[];
  botoes: GrupoAjuda[];
}

const SEM_ROTINA: ItemAjuda[] = [];

export const AJUDA: Record<TelaAjuda, AjudaTela> = {
  dashboard: {
    titulo: 'Dashboard Fiscal',
    resumo: 'Visão geral da carteira. Só mostra o que já está salvo no sistema: abrir o painel não consulta a Receita.',
    rotinas: [
      { nome: 'Última leitura', texto: 'Mostra quando cada fonte (PGDAS-D, DEFIS, DCTFWeb | MIT, situação fiscal, Caixa Postal, pagamentos, parcelamentos, e-Processo e procurações) foi atualizada pela última vez. Se estiver antiga, abra a tela da fonte e consulte.' },
    ],
    botoes: [{
      itens: [
        { nome: 'Rosca "Clientes"', texto: 'Cada cliente conta uma vez, pelo pior estado entre os processos. Clique numa cor para ver a lista; clique num cliente para abrir a Ficha Fiscal.' },
        { nome: 'Barras do "Por Processo"', texto: 'O nome abre a tela do processo. Clicar numa cor da barra abre a tela já filtrada nessa situação.' },
        { nome: 'Declarações', texto: 'PGDAS-D, DEFIS e DCTFWeb | MIT em palavras: em dia, no prazo (ou a confirmar), em falta e sem consulta. Cada número abre a lista correspondente.' },
        { nome: 'Notificações', texto: 'Avisos da Receita e da equipe. Clicar abre a tela do assunto; "Marcar lidas" limpa a lista.' },
        { nome: 'Conferir (aviso de cadastro)', texto: 'Mostra clientes cujo regime, CNPJ ou situação no cadastro não batem com a Receita.' },
        { nome: 'Pagamentos e DAS', texto: 'Abre a tela com os pagamentos de todos os clientes.' },
      ],
    }],
  },

  'caixa-postal': {
    titulo: 'Caixa Postal e-CAC',
    resumo: 'Acompanha as mensagens que a Receita Federal envia aos clientes na caixa postal do e-CAC.',
    rotinas: [
      { nome: 'Rotina diária (07:30)', texto: 'Identifica se o cliente tem uma nova mensagem na caixa postal do e-CAC, sem identificar detalhes. Caso tenha, será atribuído o status de "Nova mensagem". Também avisa quem perdeu a procuração.' },
    ],
    botoes: [
      {
        titulo: 'Aba Clientes',
        itens: [
          { nome: 'Consultar (dentro do cliente)', texto: 'Baixa as 50 mensagens mais recentes da caixa postal do e-CAC (lidas e não lidas). Não registra ciência. "Carregar mais" baixa as mais antigas.' },
          { nome: 'Abrir mensagem', texto: 'Abre o corpo da mensagem e registra a CIÊNCIA da Receita Federal. Pede sua confirmação antes. Depois de aberta, "Ver mensagem" mostra o texto salvo, sem nova ciência.' },
          { nome: 'Consulta em Lote', texto: 'Escolha quem consultar (mensagem não lida, nova mensagem ou clientes marcados à mão). Baixa a lista de cada um, um por vez. Não registra ciência.' },
          { nome: 'Consultar marcados', texto: 'Abre a Consulta em Lote já com os clientes que você marcou na tabela.' },
          { nome: 'Consultar DTE', texto: 'Verifica se o cliente aderiu ao Domicílio Tributário Eletrônico (DTE).' },
        ],
      },
      {
        titulo: 'Aba Intimações',
        itens: [
          { nome: 'Lista por cliente', texto: 'Reúne as mensagens que pedem ação (intimações, malha, multa, cobrança). A situação do cliente é a da mensagem que mais pede atenção.' },
          { nome: 'Observações', texto: 'Anote o andamento: quem está tratando e o que foi combinado. Fica salvo para toda a equipe.' },
          { nome: 'WhatsApp e e-mail', texto: 'Mostram a prévia do aviso e o contato do cliente antes de enviar. O e-mail sai direto do sistema, com confirmação de envio.' },
        ],
      },
    ],
  },

  simples: {
    titulo: 'Simples Nacional | MEI',
    resumo: 'Acompanha PGDAS-D, DAS, DEFIS, faturamento e limite dos clientes do Simples Nacional e do MEI.',
    rotinas: [
      { nome: 'Dia 16', texto: 'Consulta o ano de todos os clientes do Simples: mostra quem já transmitiu o PGDAS-D do mês anterior, os DAS gerados e os pagos.' },
      { nome: 'Dia seguinte ao prazo (dia 20 ou próximo dia útil)', texto: 'Consulta de novo só quem ainda não transmitiu. É essa consulta que confirma "Não transmitida".' },
      { nome: 'Dia 30', texto: 'Confere quem pagou o DAS e lê a declaração do mês para atualizar faturamento, RBT12, sublimite e limite.' },
      { nome: 'DEFIS (15 de março e dia seguinte ao prazo)', texto: 'Consulta quem entregou a DEFIS do ano anterior.' },
    ],
    botoes: [
      {
        titulo: 'Aba Mensal',
        itens: [
          { nome: 'Consultar (linha)', texto: 'Busca na Receita as declarações e os DAS do ano daquele cliente.' },
          { nome: 'Clicar na linha (ficha)', texto: 'Mostra mês a mês: recibo, declaração, extrato, DAS, multa por atraso (MAED) e pagamento, e reúne as ações do cliente.' },
          { nome: 'Gerar DAS', texto: 'Gera o DAS do mês. Se já houver um válido guardado, reaproveita e não emite outro.' },
          { nome: 'DAS de cobrança', texto: 'Para período que já foi para a Cobrança da Receita, quando o DAS comum não sai mais.' },
          { nome: 'Regime de apuração', texto: 'Consulta se o cliente optou pelo regime de caixa ou de competência no ano.' },
          { nome: 'Ler faturamento', texto: 'Lê a declaração do mês e preenche faturamento, RBA e sublimite.' },
          { nome: 'Enviar ao cliente', texto: 'Abre o envio por e-mail ou WhatsApp com os documentos já guardados.' },
          { nome: 'Ações em lote', texto: 'Escolha a ação e os clientes (por situação ou à mão). Você confere a lista antes; roda um cliente por vez.' },
          { nome: 'Conferir e enviar', texto: 'Lista os DAS gerados dos clientes que recebem pela CA, para conferir e mandar por e-mail. Nada sai sem confirmação.' },
        ],
      },
      {
        titulo: 'Aba DEFIS',
        itens: [{ nome: 'Consultar', texto: 'Busca na Receita todas as DEFIS do cliente, de todos os anos, numa só chamada.' }],
      },
      {
        titulo: 'Aba MEI',
        itens: [
          { nome: 'Gerar DAS', texto: 'Gera o DAS do MEI do mês, sem repetir um válido já guardado.' },
          { nome: 'Dívida ativa', texto: 'Consulta os débitos do ano em dívida ativa.' },
          { nome: 'Situação no MEI', texto: 'Consulta a situação cadastral e o enquadramento do MEI.' },
          { nome: 'Emitir CCMEI', texto: 'Emite o Certificado da Condição de MEI.' },
        ],
      },
    ],
  },

  'situacao-fiscal': {
    titulo: 'Situação Fiscal',
    resumo: 'Relatório de situação fiscal de cada cliente (Receita Federal e PGFN), com pendências e certidão.',
    rotinas: [
      { nome: 'Dia 30, à noite', texto: 'Gera o relatório de todos os clientes ativos e lê o resultado: sem pendências, com pendências ou a conferir.' },
    ],
    botoes: [{
      itens: [
        { nome: 'Gerar / Atualizar (linha)', texto: 'Pede à Receita o relatório do cliente e guarda o PDF. Leva alguns segundos.' },
        { nome: 'Clicar na linha (ficha)', texto: 'Abre a ficha com o histórico de relatórios; cada um tem o seu PDF guardado.' },
        { nome: 'Gerar relatório (marcados)', texto: 'Faz o mesmo para vários clientes, um por vez. Quem já tem relatório de hoje fica de fora.' },
        { nome: 'Baixar', texto: 'Junta num ZIP o último relatório guardado de cada cliente marcado.' },
      ],
    }],
  },

  'dctfweb-mit': {
    titulo: 'DCTFWeb | MIT',
    resumo: 'Acompanha a DCTFWeb e a MIT dos clientes do Lucro Presumido e do Lucro Real, mês a mês.',
    rotinas: [
      { nome: 'Rotina diária (07:40)', texto: 'Identifica quem teve movimento (eSocial, EFD-Reinf ou transmissão da DCTFWeb) e marca "Movimento novo". Não mostra detalhes.' },
      { nome: 'Dia 30, à noite', texto: 'Consulta só os clientes marcados com "Movimento novo": traz o recibo da DCTFWeb do mês anterior e as apurações da MIT do ano.' },
    ],
    botoes: [{
      itens: [
        { nome: 'Consultar (linha)', texto: 'Busca na Receita o recibo da DCTFWeb do mês e as apurações da MIT do ano.' },
        { nome: 'Clicar na linha (ficha)', texto: 'Mostra mês a mês: DCTFWeb, MIT, valor apurado e pago, guia e DARF avulso.' },
        { nome: 'Gerar guia', texto: 'Gera a guia (DARF) da DCTFWeb do mês, depois de transmitida.' },
        { nome: 'Guia em andamento', texto: 'Gera a guia da declaração ainda não transmitida.' },
        { nome: 'Completar o ano', texto: 'Consulta os meses do ano que ainda não foram consultados, um por vez. Mostra o total antes de começar.' },
        { nome: 'Só movimento novo', texto: 'Filtra os clientes marcados pela rotina diária.' },
        { nome: 'Conferir e enviar', texto: 'Lista as guias geradas dos clientes que recebem pela CA, para conferir e mandar por e-mail.' },
      ],
    }],
  },

  parcelamentos: {
    titulo: 'Parcelamentos',
    resumo: 'Acompanha os parcelamentos do Simples Nacional e do MEI: parcelas em atraso e a do mês.',
    rotinas: [
      { nome: 'Rotina automática', texto: 'Não há. Os dados vêm das consultas feitas aqui.' },
    ],
    botoes: [{
      itens: [
        { nome: 'Consultar (linha ou marcados)', texto: 'Busca na Receita os pedidos de parcelamento e as parcelas em aberto. Quem já foi consultado hoje fica de fora.' },
        { nome: 'Clicar na linha (ficha)', texto: 'Mostra as parcelas do cliente e abre a guia de cada uma.' },
        { nome: 'Gerar guias', texto: 'Gera a guia de cada parcela em atraso e a do mês dos clientes marcados.' },
        { nome: 'Conferir e enviar', texto: 'Lista as guias geradas no mês para conferir e mandar por e-mail.' },
        { nome: 'Baixar', texto: 'Junta num ZIP as guias de parcela já guardadas.' },
      ],
    }],
  },

  procuracoes: {
    titulo: 'Procurações | Certificados',
    resumo: 'Controla as procurações eletrônicas (e-CAC), os certificados digitais e os vínculos na Redesim.',
    rotinas: [
      { nome: 'Rotina diária (07:30)', texto: 'Junto com a Caixa Postal, identifica quem perdeu a procuração.' },
      { nome: 'Toda segunda-feira (08:00)', texto: 'Avisa as procurações que vencem em até 60 dias.' },
    ],
    botoes: [
      {
        titulo: 'Aba Procurações',
        itens: [
          { nome: 'Mapear (linha ou marcados)', texto: 'Consulta quais procurações o cliente deu à Contabilidade Alves e até quando valem. Use depois que o cliente outorgar ou renovar no e-CAC.' },
        ],
      },
      {
        titulo: 'Aba Certificados',
        itens: [
          { nome: 'Cadastro de certificados', texto: 'Lista os certificados digitais com titular, modelo, validade e dias para vencer. Filtre por status e prazo.' },
          { nome: 'Ver senha e baixar comprovante', texto: 'Ver senha mostra a senha cadastrada. Baixar comprovante abre o anexo guardado, quando houver.' },
        ],
      },
      {
        titulo: 'Aba Vínculos Redesim',
        itens: [
          { nome: 'Atualizar vínculos', texto: 'Consulta a Receita e lista os CNPJs em que a Contabilidade Alves consta como contadora. Só administradores atualizam.' },
          { nome: 'Listas', texto: 'Mostram clientes ativos sem vínculo e CNPJs em que a CA ainda aparece como contadora, mas que não são clientes ativos.' },
        ],
      },
    ],
  },

  eprocesso: {
    titulo: 'e-Processo',
    resumo: 'Processos digitais da Receita Federal em que o cliente é interessado.',
    rotinas: [
      { nome: 'Rotina automática', texto: 'Não há. Os dados vêm das consultas feitas aqui.' },
    ],
    botoes: [{
      itens: [
        { nome: 'Consultar (linha ou marcados)', texto: 'Busca na Receita os processos digitais do cliente. Quem já foi consultado hoje fica de fora.' },
        { nome: 'Seta ao lado do nome', texto: 'Mostra os processos do cliente: número, tipo, protocolo, situação e localização.' },
        { nome: 'Clicar na linha (ficha)', texto: 'Abre a Ficha Fiscal com todas as frentes do cliente.' },
      ],
    }],
  },

  relatorios: {
    titulo: 'Relatórios',
    resumo: 'Relatório Completo da Empresa: como está o cliente por inteiro, pronto para baixar ou enviar.',
    rotinas: [
      { nome: 'Rotina automática', texto: 'Não há. O relatório é gerado por clique, com o que já está salvo no sistema.' },
    ],
    botoes: [{
      itens: [
        { nome: 'Gerar relatório (marcados)', texto: 'Gera e guarda o relatório de cada cliente, um por vez. Não consulta a Receita: usa os dados já salvos.' },
        { nome: 'Enviar por e-mail', texto: 'Lista o último relatório guardado de cada cliente, mostra o e-mail e só envia depois da sua confirmação.' },
        { nome: 'Baixar', texto: 'Junta num ZIP o último relatório de cada cliente marcado.' },
        { nome: 'Clicar na linha (ficha)', texto: 'Abre a Ficha Fiscal, onde dá para baixar e enviar o relatório de um cliente.' },
        { nome: 'Situação e score', texto: 'A situação resume o relatório (regular, pontos de atenção ou pendências). O score é a parte dos itens verificados que está regular.' },
      ],
    }],
  },

  pagamentos: {
    titulo: 'Pagamentos e DAS',
    resumo: 'Documentos de arrecadação pagos na Receita (DARF, DAE, DAS) e a situação do DAS de cada cliente.',
    rotinas: [
      { nome: 'Rotina diária (07:35)', texto: 'Identifica quem teve mudança em pagamentos e marca "Pagamento novo". Não mostra detalhes.' },
      { nome: 'Dia 30, à noite', texto: 'Consulta os pagamentos do mês: dos clientes do Simples que tiveram pagamento e de todos os do Presumido e do Real.' },
    ],
    botoes: [{
      itens: [
        { nome: 'Consultar pagamentos', texto: 'Baixa da Receita os documentos pagos do mês: data, valor e composição de cada um. Quem já foi consultado hoje fica de fora.' },
        { nome: 'Clicar na linha (painel)', texto: 'Mostra os pagamentos do cliente, a composição de cada guia e o comprovante.' },
        { nome: 'Emitir comprovantes', texto: 'Emite o comprovante dos pagamentos já consultados que ainda não têm um guardado.' },
        { nome: 'Baixar', texto: 'Junta num ZIP os comprovantes e os DAS já guardados do mês.' },
      ],
    }],
  },

  conferencia: {
    titulo: 'Conferência do cadastro',
    resumo: 'Lista clientes ativos em que o cadastro e o que a Receita mostra não batem.',
    rotinas: SEM_ROTINA,
    botoes: [{
      itens: [
        { nome: 'O que aparece', texto: 'Cliente do Simples sem declaração, declaração do Simples em cliente de outro regime, cliente ativo com data de saída e empresa sem regime.' },
        { nome: 'Como resolver', texto: 'Corrija o regime, o CNPJ ou a situação no cadastro do cliente. A tela só lê o que já está salvo.' },
        { nome: 'Exportar', texto: 'Baixa a lista em Excel, PDF ou CSV.' },
      ],
    }],
  },
};
