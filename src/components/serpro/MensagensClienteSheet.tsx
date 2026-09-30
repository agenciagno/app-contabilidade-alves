import { format } from 'date-fns';
import { toast } from 'sonner';
import { FileText, Loader2, MailOpen, RefreshCw } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_LARGURA_TOTAL, DicaBotao } from '@/components/serpro/DicaBotao';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAbrirMensagemFlow } from '@/components/serpro/AbrirMensagemFlow';
import { useConsultaCliente } from '@/components/serpro/useConsultaCliente';
import {
  CATEGORIAS, SITUACOES, diasParaPrazo, seloCaixa,
  useAcompanharMensagem, useMensagensCliente,
  type ClienteCaixa, type MensagemCaixa, type SituacaoMsg,
} from '@/hooks/useSerproCaixaPostal';

/**
 * Painel de UM cliente. Abrir = lista já salva (grátis). "Consultar" baixa a lista atual do e-CAC (sem ciência).
 * O corpo de cada mensagem só abre pelo botão da própria linha, depois do pop-up de ciência.
 */
export function MensagensClienteSheet({ cliente, onClose }: { cliente: ClienteCaixa | null; onClose: () => void }) {
  const { data: mensagens = [], isLoading } = useMensagensCliente(cliente?.contact_id ?? null);
  const acompanhar = useAcompanharMensagem();
  const { solicitar, dialogs } = useAbrirMensagemFlow();
  const { executar, emAndamento, proximo: proximos, dialog: dialogConsulta } = useConsultaCliente();

  if (!cliente) return null;
  const selo = seloCaixa(cliente);
  const semProcuracao = cliente.procuracao === 'ausente';
  const inativo = selo.estado === 'inativo';
  const consultando = emAndamento === cliente.contact_id;
  const proximo = proximos[cliente.contact_id] ?? null;

  const salvar = (m: MensagemCaixa, campos: { situacao?: SituacaoMsg; observacoes?: string | null; visivel_portal?: boolean }) =>
    acompanhar.mutate({ mensagemId: m.id, contactId: m.contact_id, ...campos }, { onError: () => toast.error('Não foi possível salvar.') });

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[780px]">
          <SheetHeader className="space-y-1 text-left">
            <p className="font-mono text-meta text-muted-ink-2">{cliente.documento}</p>
            <SheetTitle className="text-[20px]">{cliente.nome}</SheetTitle>
            <SheetDescription asChild>
              <div className="flex flex-wrap items-center gap-2">
                <DsBadge tone={selo.tone}>{selo.label}</DsBadge>
                <span className="text-meta text-muted-ink">
                  {cliente.consultado_em
                    ? `Lista baixada em ${format(new Date(cliente.consultado_em), 'dd/MM/yyyy HH:mm')}`
                    : 'Lista ainda não baixada'}
                </span>
              </div>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-bg-2 p-4">
            <DicaBotao custo={semProcuracao || inativo ? undefined : 'Consultar'}
              texto="Baixa da Receita as 50 mensagens mais recentes da Caixa Postal deste cliente (lidas e não lidas). Não registra ciência.">
              <Button onClick={() => executar(cliente.contact_id)} disabled={consultando || semProcuracao || inativo}>
                {consultando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Consultar{!semProcuracao && !inativo && <Preco tipo="Consultar" />}
              </Button>
            </DicaBotao>
            <p className="min-w-[220px] flex-1 text-meta text-muted-ink">
              {inativo
                ? `Cliente fora do monitoramento (${cliente.status_cliente ?? 'sem status'}). O Serpro só é consultado para clientes ativos.`
                : semProcuracao
                  ? 'Sem procuração para a Caixa Postal: peça ao cliente para outorgá-la no e-CAC.'
                  : 'Baixa as 50 mensagens mais recentes (lidas e não lidas). Não registra ciência.'}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
            ) : mensagens.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line p-8 text-center text-ui text-muted-ink">
                {cliente.consultado_em
                  ? 'Nenhuma mensagem na Caixa Postal deste cliente.'
                  : 'Nenhuma mensagem salva ainda. Use "Consultar" para baixar a lista.'}
              </div>
            ) : (
              mensagens.map((m) => {
                const cat = CATEGORIAS[m.categoria];
                const prazo = diasParaPrazo(m.data_validade);
                return (
                  <div key={m.id} className="space-y-3 rounded-lg border border-line bg-paper p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-ink">{m.assunto}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DsBadge tone={cat.tone}>{cat.label}</DsBadge>
                        {m.relevancia === 2 && <DsBadge tone="warn">Com relevância</DsBadge>}
                        <DsBadge tone={m.lida ? 'ok' : 'warn'}>{m.lida ? 'Lida' : 'Não lida'}</DsBadge>
                      </div>
                    </div>
                    <p className="text-meta text-muted-ink">
                      {m.data_envio ? `Enviada em ${format(new Date(m.data_envio), 'dd/MM/yyyy HH:mm')}` : 'Data não informada'}
                      {m.descricao_origem ? ` · ${m.descricao_origem}` : ''}
                      {m.data_ciencia ? ` · Ciência em ${format(new Date(`${m.data_ciencia}T00:00:00`), 'dd/MM/yyyy')}` : ''}
                      {prazo !== null ? ` · Validade: ${prazo >= 0 ? `${prazo} dias` : `venceu há ${-prazo} dias`}` : ''}
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                      <Select value={m.situacao} onValueChange={(v) => salvar(m, { situacao: v as SituacaoMsg })}>
                        <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SITUACOES) as SituacaoMsg[]).map((k) => (
                            <SelectItem key={k} value={k}>{SITUACOES[k].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <DicaBotao custo={m.corpo ? undefined : 'Consultar'}
                        texto={m.corpo ? 'Mostra o texto da mensagem que já foi aberto antes. Não consulta a Receita e não registra nova ciência.'
                          : 'Abre o corpo da mensagem na Receita. Antes, pede sua confirmação: abrir registra a ciência do contribuinte.'}>
                        <Button size="sm" variant={m.corpo ? 'outline' : 'default'} onClick={() => solicitar(m, cliente.nome)}>
                          {m.corpo ? <FileText className="mr-1.5 h-4 w-4" /> : <MailOpen className="mr-1.5 h-4 w-4" />}
                          {m.corpo ? 'Ver mensagem' : 'Abrir mensagem'}{!m.corpo && <Preco tipo="Consultar" />}
                        </Button>
                      </DicaBotao>
                      <label className="ml-auto flex items-center gap-2 text-meta text-muted-ink">
                        <Switch checked={m.visivel_portal} onCheckedChange={(v) => salvar(m, { visivel_portal: v })} />
                        Publicar no portal
                      </label>
                    </div>

                    <Input
                      defaultValue={m.observacoes ?? ''}
                      placeholder="Observação da equipe (salva ao sair do campo)"
                      className="h-9 text-ui"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (m.observacoes ?? '')) salvar(m, { observacoes: v || null });
                      }}
                    />
                  </div>
                );
              })
            )}

            {proximo && (
              <DicaBotao className={DICA_LARGURA_TOTAL} custo="Consultar" texto="Baixa da Receita a página seguinte, com as mensagens mais antigas deste cliente.">
                <Button variant="outline" className="w-full" disabled={consultando} onClick={() => executar(cliente.contact_id, true, proximo)}>
                  Carregar mais antigas<Preco tipo="Consultar" />
                </Button>
              </DicaBotao>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {dialogConsulta}

      {dialogs}
    </>
  );
}
