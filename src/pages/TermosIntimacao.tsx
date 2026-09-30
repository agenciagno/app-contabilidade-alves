import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FileText, MailOpen, Send } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AvisarClienteDialog } from '@/components/serpro/AvisarClienteDialog';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirMensagemFlow } from '@/components/serpro/AbrirMensagemFlow';
import {
  CATEGORIAS, SITUACOES, STATUS_MONITORADO, diasParaPrazo, useAcompanharMensagem, useAvisosCaixa, useMensagensCriticas,
  type CategoriaMsg, type MensagemComCliente, type SituacaoMsg,
} from '@/hooks/useSerproCaixaPostal';
import type { TabelaExport } from '@/lib/exportarTabela';

const nomeCliente = (m: MensagemComCliente) => m.contacts?.display_name || m.contacts?.name || 'Cliente';

export default function TermosIntimacao() {
  const { data: mensagens = [], isLoading } = useMensagensCriticas();
  const acompanhar = useAcompanharMensagem();
  const { solicitar, dialogs } = useAbrirMensagemFlow();
  const { data: avisos } = useAvisosCaixa();
  const [avisando, setAvisando] = useState<MensagemComCliente | null>(null);
  const [busca, setBusca] = useState('');
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
      .filter((m) => !q || nomeCliente(m).toLowerCase().includes(q) || m.assunto.toLowerCase().includes(q)
        || (m.contacts?.document ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
  }, [mensagens, busca, categoria, situacao]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'termos-de-intimacao',
    titulo: 'Termos de intimação — mensagens da Receita que exigem ação',
    colunas: ['Cliente', 'CNPJ', 'Tipo', 'Assunto', 'Lida', 'Envio', 'Validade', 'Situação', 'Observação', 'Cliente avisado'],
    linhas: filtradas.map((m) => {
      const prazo = diasParaPrazo(m.data_validade);
      const av = avisos?.get(m.id);
      return [
        nomeCliente(m), m.contacts?.document ?? '', CATEGORIAS[m.categoria].label, m.assunto, m.lida ? 'Sim' : 'Não',
        m.data_envio ? format(new Date(m.data_envio), 'dd/MM/yyyy') : '',
        m.data_validade ? format(new Date(`${m.data_validade}T00:00:00`), 'dd/MM/yyyy') : (prazo === null ? '' : String(prazo)),
        SITUACOES[m.situacao].label, m.observacoes ?? '', av ? format(new Date(av.enviado_em), 'dd/MM/yyyy') : '',
      ];
    }),
  });

  const salvar = (m: MensagemComCliente, campos: { situacao?: SituacaoMsg; observacoes?: string | null }) =>
    acompanhar.mutate({ mensagemId: m.id, contactId: m.contact_id, ...campos }, { onError: () => toast.error('Não foi possível salvar.') });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · termos de intimação"
        title="Termos de intimação."
        subtitle="Mensagens da Receita que exigem ação (intimação, malha, exclusão do Simples, multa, cobrança e processo), já classificadas. Só aparecem clientes cuja lista foi baixada em Mensagens e-CAC."
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} />}
      />

      <StatCardRow
        items={[
          { label: 'Em aberto', value: stats.abertas, hint: 'novas + em tratamento', emphasis: stats.abertas > 0 ? 'warm' : 'none' },
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
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">
            {mensagens.length === 0
              ? 'Nenhuma mensagem classificada ainda. Baixe a lista de um cliente em Mensagens e-CAC.'
              : 'Nenhuma mensagem encontrada com esses filtros.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Lida</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((m) => {
                const cat = CATEGORIAS[m.categoria];
                const prazo = diasParaPrazo(m.data_validade);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <p className="text-ui text-ink">{nomeCliente(m)}</p>
                      <p className="font-mono text-meta text-muted-ink-2">{m.contacts?.document}</p>
                      {m.contacts?.status_cliente !== STATUS_MONITORADO && (
                        <DsBadge tone="neutral" dot={false}>{m.contacts?.status_cliente ?? 'Sem status'}</DsBadge>
                      )}
                    </TableCell>
                    <TableCell><DsBadge tone={cat.tone}>{cat.label}</DsBadge></TableCell>
                    <TableCell className="max-w-[280px] text-ui text-ink">{m.assunto}</TableCell>
                    <TableCell><DsBadge tone={m.lida ? 'ok' : 'warn'}>{m.lida ? 'Sim' : 'Não'}</DsBadge></TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-ui">{m.data_envio ? format(new Date(m.data_envio), 'dd/MM/yyyy') : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">
                      {prazo === null ? '—' : prazo >= 0 ? `${prazo} dias` : `venceu há ${-prazo} d`}
                    </TableCell>
                    <TableCell>
                      <Select value={m.situacao} onValueChange={(v) => salvar(m, { situacao: v as SituacaoMsg })}>
                        <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SITUACOES) as SituacaoMsg[]).map((k) => <SelectItem key={k} value={k}>{SITUACOES[k].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={m.observacoes ?? ''}
                        placeholder="Observação"
                        className="h-9 w-[180px] text-ui"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (m.observacoes ?? '')) salvar(m, { observacoes: v || null });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setAvisando(m)}>
                          <Send className="mr-1.5 h-4 w-4" /> Avisar cliente
                        </Button>
                        <Button size="sm" variant={m.corpo ? 'outline' : 'default'} onClick={() => solicitar(m, nomeCliente(m))}>
                          {m.corpo ? <FileText className="mr-1.5 h-4 w-4" /> : <MailOpen className="mr-1.5 h-4 w-4" />}
                          {m.corpo ? 'Ver' : 'Abrir'}
                        </Button>
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
        )}
      </div>

      {dialogs}
      <AvisarClienteDialog mensagem={avisando} onClose={() => setAvisando(null)} />
    </div>
  );
}
