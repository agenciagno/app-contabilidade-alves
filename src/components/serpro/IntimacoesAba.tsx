import { Fragment, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, ChevronRight, CircleDot, Clock, FileText, Mail, MailOpen, MessageCircle, MinusCircle, NotebookPen, type LucideIcon } from 'lucide-react';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AvisarClienteDialog, foneDoCliente, formatarFone, type AlvoAviso, type CanalTela } from '@/components/serpro/AvisarClienteDialog';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { NotaDialog, type NotaAlvo } from '@/components/serpro/NotaDialog';
import { useAbrirMensagemFlow } from '@/components/serpro/AbrirMensagemFlow';
import {
  CATEGORIAS, SITUACOES, STATUS_MONITORADO, diasParaPrazo, useAcompanharClienteCaixa, useAcompanharMensagem, useAvisosCaixa,
  useMensagensCriticas, useNotasClientesCaixa,
  type CategoriaMsg, type MensagemComCliente, type SituacaoMsg,
} from '@/hooks/useSerproCaixaPostal';
import type { TabelaExport } from '@/lib/exportarTabela';

const nomeCliente = (m: MensagemComCliente) => m.contacts?.razao_social || m.contacts?.name || 'Cliente';

const ICONE_SITUACAO: Record<SituacaoMsg, LucideIcon> = {
  nova: CircleDot, em_tratamento: Clock, resolvida: CheckCircle2, sem_acao: MinusCircle,
};
/** Do mais urgente ao menos: a situação do cliente é a da mensagem que mais pede atenção. */
const ORDEM_SITUACAO: SituacaoMsg[] = ['nova', 'em_tratamento', 'resolvida', 'sem_acao'];

interface GrupoCliente {
  contactId: string;
  msgs: MensagemComCliente[];        // só as que passam nos filtros
  situacao: SituacaoMsg;             // calculada sobre TODAS as mensagens do cliente
  resumoSituacao: string;
  todasLidas: boolean;
  total: number;
}

/**
 * Aba Intimações da Caixa Postal e-CAC (era a tela Termos de intimação até 09/10/2026; `/dashboard-federal/intimacoes` redireciona para cá).
 * Mensagens da Receita que exigem ação (intimação, malha, exclusão do Simples, multa, cobrança e processo), uma linha por cliente.
 * Só aparecem clientes cuja lista foi baixada na aba Clientes.
 */
export function IntimacoesAba() {
  const { data: mensagens = [], isLoading } = useMensagensCriticas();
  const { data: notasClientes } = useNotasClientesCaixa();
  const acompanhar = useAcompanharMensagem();
  const acompanharCliente = useAcompanharClienteCaixa();
  const { solicitar, dialogs } = useAbrirMensagemFlow();
  const { data: avisos } = useAvisosCaixa();
  const [avisando, setAvisando] = useState<AlvoAviso | null>(null);
  const [nota, setNota] = useState<NotaAlvo | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [categoria, setCategoria] = useState<'todas' | CategoriaMsg>('todas');
  const [situacao, setSituacao] = useState<'abertas' | 'todas' | SituacaoMsg>('abertas');

  const stats = useMemo(() => ({
    abertas: mensagens.filter((m) => m.situacao === 'nova' || m.situacao === 'em_tratamento').length,
    novas: mensagens.filter((m) => m.situacao === 'nova').length,
    tratamento: mensagens.filter((m) => m.situacao === 'em_tratamento').length,
    resolvidas: mensagens.filter((m) => m.situacao === 'resolvida').length,
  }), [mensagens]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return mensagens
      .filter((m) => categoria === 'todas' || m.categoria === categoria)
      .filter((m) => {
        if (situacao === 'todas') return true;
        if (situacao === 'abertas') return m.situacao === 'nova' || m.situacao === 'em_tratamento';
        return m.situacao === situacao;
      })
      .filter((m) => !q || nomeCliente(m).toLowerCase().includes(q) || (m.contacts?.name ?? '').toLowerCase().includes(q) || m.assunto.toLowerCase().includes(q)
        || (m.contacts?.document ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
  }, [mensagens, busca, categoria, situacao]);

  // Uma linha por cliente. Lida e situação olham todas as mensagens do cliente; os filtros só escolhem quem aparece e o que abre.
  const grupos = useMemo(() => {
    const todasPorCliente = new Map<string, MensagemComCliente[]>();
    for (const m of mensagens) todasPorCliente.set(m.contact_id, [...(todasPorCliente.get(m.contact_id) ?? []), m]);
    const porCliente = new Map<string, MensagemComCliente[]>();
    for (const m of filtradas) porCliente.set(m.contact_id, [...(porCliente.get(m.contact_id) ?? []), m]);
    const lista: GrupoCliente[] = [...porCliente.entries()].map(([contactId, msgs]) => {
      const todas = todasPorCliente.get(contactId) ?? msgs;
      const contagem = ORDEM_SITUACAO.map((s) => [s, todas.filter((m) => m.situacao === s).length] as const).filter(([, n]) => n > 0);
      return {
        contactId, msgs, total: todas.length,
        situacao: contagem[0][0],
        resumoSituacao: contagem.map(([s, n]) => `${n} ${SITUACOES[s].label.toLowerCase()}`).join(' · '),
        todasLidas: todas.every((m) => m.lida),
      };
    });
    const maisRecente = (g: GrupoCliente) => g.msgs[0]?.data_envio ?? '';
    return lista.sort((a, b) => ORDEM_SITUACAO.indexOf(a.situacao) - ORDEM_SITUACAO.indexOf(b.situacao) || maisRecente(b).localeCompare(maisRecente(a)));
  }, [mensagens, filtradas]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'termos-de-intimacao',
    titulo: 'Termos de intimação — mensagens da Receita que exigem ação',
    colunas: ['Razão Social', 'CNPJ', 'Tipo', 'Assunto', 'Lida', 'Envio', 'Validade', 'Situação', 'Observação da mensagem', 'Observação do cliente', 'Cliente avisado'],
    linhas: filtradas.map((m) => {
      const prazo = diasParaPrazo(m.data_validade);
      const av = avisos?.get(m.id);
      return [
        nomeCliente(m), m.contacts?.document ?? '', CATEGORIAS[m.categoria].label, m.assunto, m.lida ? 'Sim' : 'Não',
        m.data_envio ? format(new Date(m.data_envio), 'dd/MM/yyyy') : '',
        m.data_validade ? format(new Date(`${m.data_validade}T00:00:00`), 'dd/MM/yyyy') : (prazo === null ? '' : String(prazo)),
        SITUACOES[m.situacao].label, m.observacoes ?? '', notasClientes?.get(m.contact_id) ?? '', av ? format(new Date(av.enviado_em), 'dd/MM/yyyy') : '',
      ];
    }),
  });

  const salvar = (m: MensagemComCliente, campos: { situacao?: SituacaoMsg; observacoes?: string | null }) =>
    acompanhar.mutate({ mensagemId: m.id, contactId: m.contact_id, ...campos }, { onError: () => toast.error('Não foi possível salvar.') });

  const abrirNotaCliente = (g: GrupoCliente) => setNota({
    titulo: 'Acompanhamento do cliente',
    referencia: nomeCliente(g.msgs[0]),
    texto: notasClientes?.get(g.contactId) ?? '',
    salvar: async (t) => { await acompanharCliente.mutateAsync({ contactId: g.contactId, observacoes: t }); toast.success('Nota do cliente salva.'); },
  });
  const abrirNotaMensagem = (m: MensagemComCliente) => setNota({
    titulo: 'Observação da mensagem',
    referencia: `${nomeCliente(m)} · ${m.assunto}`,
    texto: m.observacoes ?? '',
    salvar: async (t) => { await acompanhar.mutateAsync({ mensagemId: m.id, contactId: m.contact_id, observacoes: t }); toast.success('Observação da mensagem salva.'); },
  });

  const BotaoNota = ({ tem, onClick, dica }: { tem: boolean; onClick: () => void; dica: string }) => (
    <DicaBotao texto={dica}>
      <Button size="icon" variant="ghost" className="relative h-8 w-8" aria-label={dica} onClick={onClick}>
        <NotebookPen className={tem ? 'h-4 w-4 text-brand' : 'h-4 w-4 text-muted-ink-2'} />
        {tem && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-pill bg-brand" aria-hidden />}
      </Button>
    </DicaBotao>
  );

  /** Ícone de WhatsApp ou e-mail: abre a prévia do aviso. Fica apagado quando o cliente não tem o contato; ponto = já avisado por esse canal. */
  const BotaoAviso = ({ msgs, canal }: { msgs: MensagemComCliente[]; canal: CanalTela }) => {
    const contato = msgs[0].contacts;
    const destino = canal === 'email' ? contato?.email : foneDoCliente(contato);
    const jaAvisou = msgs.some((m) => avisos?.get(m.id)?.canal === canal);
    const Icone = canal === 'email' ? Mail : MessageCircle;
    const rotulo = canal === 'email' ? 'e-mail' : 'WhatsApp';
    const dica = destino
      ? `Mostra o aviso pronto para enviar por ${rotulo} a ${canal === 'email' ? destino : formatarFone(destino)}. Você confere antes de mandar.${jaAvisou ? ' Este cliente já foi avisado por aqui.' : ''}`
      : `Este cliente não tem ${canal === 'email' ? 'e-mail' : 'WhatsApp nem telefone'} cadastrado.`;
    return (
      <DicaBotao texto={dica}>
        <Button size="icon" variant="ghost" className="relative h-8 w-8" aria-label={`Avisar por ${rotulo}`} disabled={!destino}
          onClick={() => setAvisando({ mensagens: msgs, canal })}>
          <Icone className={jaAvisou ? 'h-4 w-4 text-brand' : 'h-4 w-4 text-muted-ink-2'} />
          {jaAvisou && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-pill bg-brand" aria-hidden />}
        </Button>
      </DicaBotao>
    );
  };

  /** Mensagens do cliente que entram no aviso: as em aberto (o que ainda pede ação); se não houver, as que estão na lista. */
  const paraAvisar = (g: GrupoCliente) => {
    const abertas = g.msgs.filter((m) => m.situacao === 'nova' || m.situacao === 'em_tratamento');
    return abertas.length ? abertas : g.msgs;
  };

  return (
    <div className="space-y-5">
      <StatCardRow
        items={[
          { label: 'Em aberto', value: stats.abertas, hint: 'mensagens novas + em tratamento', emphasis: stats.abertas > 0 ? 'warm' : 'none' },
          { label: 'Novas', value: stats.novas, hint: 'ninguém assumiu' },
          { label: 'Em tratamento', value: stats.tratamento, hint: 'equipe trabalhando' },
          { label: 'Resolvidas', value: stats.resolvidas, hint: 'histórico' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por cliente, CNPJ ou assunto..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={categoria} onValueChange={(v) => setCategoria(v as typeof categoria)}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {(Object.keys(CATEGORIAS) as CategoriaMsg[]).filter((k) => CATEGORIAS[k].critica).map((k) => (
              <SelectItem key={k} value={k}>{CATEGORIAS[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em aberto</SelectItem>
            <SelectItem value="todas">Todas as situações</SelectItem>
            {(Object.keys(SITUACOES) as SituacaoMsg[]).map((k) => <SelectItem key={k} value={k}>{SITUACOES[k].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="sm:ml-auto"><ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas /></div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : grupos.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">
            {mensagens.length === 0
              ? 'Nenhuma mensagem classificada ainda. Baixe a lista de um cliente na aba Clientes.'
              : 'Nenhuma mensagem encontrada com esses filtros.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Lida</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => {
                const cliente = g.msgs[0];
                const aberto = abertos[g.contactId] ?? (!!busca.trim() && grupos.length === 1);
                const Icone = ICONE_SITUACAO[g.situacao];
                const notaCliente = notasClientes?.get(g.contactId);
                const alternar = () => setAbertos((a) => ({ ...a, [g.contactId]: !aberto }));
                return (
                  <Fragment key={g.contactId}>
                    <TableRow className="cursor-pointer" onClick={alternar}>
                      <TableCell className="w-10 pr-0">
                        <DicaBotao texto={aberto ? 'Fecha as mensagens deste cliente.' : 'Mostra as mensagens deste cliente.'}>
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={aberto ? 'Fechar mensagens' : 'Ver mensagens'} aria-expanded={aberto} onClick={(e) => { e.stopPropagation(); alternar(); }}>
                            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </DicaBotao>
                      </TableCell>
                      <TableCell>
                        <p className="text-ui text-ink">{nomeCliente(cliente)}</p>
                        <p className="text-meta text-muted-ink-2">{g.total} {g.total === 1 ? 'mensagem' : 'mensagens'}</p>
                        {cliente.contacts?.status_cliente !== STATUS_MONITORADO && (
                          <DsBadge tone="neutral" dot={false}>{cliente.contacts?.status_cliente ?? 'Sem status'}</DsBadge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-ui">{cliente.contacts?.document ?? '—'}</TableCell>
                      <TableCell><DsBadge tone={g.todasLidas ? 'ok' : 'warn'}>{g.todasLidas ? 'Lida' : 'Não Lida'}</DsBadge></TableCell>
                      <TableCell>
                        <DicaBotao texto={`Situação do cliente = a da mensagem que mais pede atenção. ${g.resumoSituacao}.`}>
                          <DsBadge tone={SITUACOES[g.situacao].tone} dot={false}><Icone className="h-3.5 w-3.5" aria-hidden />{SITUACOES[g.situacao].label}</DsBadge>
                        </DicaBotao>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <BotaoNota tem={!!notaCliente} onClick={() => abrirNotaCliente(g)} dica={notaCliente ? 'Abre o bloco de notas deste cliente (já tem anotação).' : 'Abre o bloco de notas deste cliente para escrever uma observação.'} />
                          <BotaoAviso msgs={paraAvisar(g)} canal="whatsapp" />
                          <BotaoAviso msgs={paraAvisar(g)} canal="email" />
                        </div>
                      </TableCell>
                    </TableRow>

                    {aberto && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-bg-2 p-3">
                          {/* w-0 + min-w-full: a tabela de dentro não alarga a de fora; se faltar espaço, ela rola sozinha */}
                          <div className="w-0 min-w-full overflow-hidden rounded-lg border border-line bg-paper">
                            <Table className="[&_td]:px-2 [&_th]:px-2">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Tipo</TableHead>
                                  <TableHead>Assunto</TableHead>
                                  <TableHead>Lida</TableHead>
                                  <TableHead>Envio</TableHead>
                                  <TableHead>Validade</TableHead>
                                  <TableHead>Situação</TableHead>
                                  <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.msgs.map((m) => {
                                  const cat = CATEGORIAS[m.categoria];
                                  const prazo = diasParaPrazo(m.data_validade);
                                  return (
                                    <TableRow key={m.id}>
                                      <TableCell><DsBadge tone={cat.tone}>{cat.label}</DsBadge></TableCell>
                                      <TableCell className="text-ui text-ink"><div className="max-w-[140px]">{m.assunto}</div></TableCell>
                                      <TableCell><DsBadge tone={m.lida ? 'ok' : 'warn'}>{m.lida ? 'Sim' : 'Não'}</DsBadge></TableCell>
                                      <TableCell className="whitespace-nowrap font-mono text-ui">{m.data_envio ? format(new Date(m.data_envio), 'dd/MM/yyyy') : '—'}</TableCell>
                                      <TableCell className="whitespace-nowrap text-ui text-muted-ink">
                                        {prazo === null ? '—' : prazo >= 0 ? `${prazo} dias` : `venceu há ${-prazo} d`}
                                      </TableCell>
                                      <TableCell>
                                        <Select value={m.situacao} onValueChange={(v) => salvar(m, { situacao: v as SituacaoMsg })}>
                                          <SelectTrigger className="h-9 w-[128px]"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {(Object.keys(SITUACOES) as SituacaoMsg[]).map((k) => <SelectItem key={k} value={k}>{SITUACOES[k].label}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-0.5">
                                          <DicaBotao custo={m.corpo ? undefined : 'Consultar'}
                                            texto={m.corpo ? 'Mostra o texto da mensagem que já foi aberto antes. Não consulta a Receita e não registra nova ciência.'
                                              : 'Abre o corpo da mensagem na Receita. Antes, pede sua confirmação: abrir registra a ciência do contribuinte.'}>
                                            <Button size="sm" variant={m.corpo ? 'outline' : 'default'} onClick={() => solicitar(m, nomeCliente(m))}>
                                              {m.corpo ? <FileText className="mr-1.5 h-4 w-4" /> : <MailOpen className="mr-1.5 h-4 w-4" />}
                                              {m.corpo ? 'Ver' : 'Abrir'}{!m.corpo && <Preco tipo="Consultar" />}
                                            </Button>
                                          </DicaBotao>
                                          <BotaoNota tem={!!m.observacoes} onClick={() => abrirNotaMensagem(m)} dica={m.observacoes ? 'Abre o bloco de notas desta mensagem (já tem anotação).' : 'Abre o bloco de notas desta mensagem para escrever uma observação.'} />
                                          <BotaoAviso msgs={[m]} canal="whatsapp" />
                                          <BotaoAviso msgs={[m]} canal="email" />
                                        </div>
                                        {avisos?.get(m.id) && (
                                          <p className="mt-1 text-meta text-muted-ink-2">Avisado em {format(new Date(avisos.get(m.id)!.enviado_em), 'dd/MM')}</p>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {dialogs}
      <AvisarClienteDialog alvo={avisando} onClose={() => setAvisando(null)} />
      <NotaDialog alvo={nota} onClose={() => setNota(null)} />
    </div>
  );
}
