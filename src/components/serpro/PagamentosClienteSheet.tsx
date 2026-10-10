import { useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Copy, FileDown, Loader2, Receipt, RefreshCw } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { DocumentoPagamentoCard, PagamentosDoCliente, dataPagBR as dataBR, moedaPag as moeda, numerosDuplicados } from '@/components/serpro/PagamentosDoCliente';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAbrirArquivo, useGerarDasComConfirmacao } from '@/components/serpro/pgdasdUi';
import { siglaCompetencia, usePagamentosCliente, type PagamentoRow } from '@/hooks/useSerproPagamentos';
import type { DasRow } from '@/hooks/useSerproPgdasd';
import { dasReaproveitavel } from '@/hooks/useSerproPgdasd';
import { ehSimplesConsultavel, mensagemLembreteDas, type DasUnificado, type LinhaUnificada } from '@/hooks/useSerproDasUnificado';
import { diasEntre, hojeBR } from '@/lib/prazosFederais';

const dataHoraBR = (iso: string | null) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : '—');

function resumoDas(d: DasUnificado): { badge: { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }; texto: string } {
  const venc = d.vencimento ? dataBR(d.vencimento) : '—';
  switch (d.estado) {
    case 'pago': {
      const origem = d.origemPago === 'ambos' ? 'confirmado pelo PGDAS e por Pagamentos'
        : d.origemPago === 'pagamentos' ? 'confirmado em Pagamentos'
          : 'segundo o PGDAS (para ver data e valor do pagamento, use "Consultar pagamentos")';
      return { badge: { label: 'Pago', tone: 'ok' }, texto: `${d.pagoEm ? `Pago em ${dataBR(d.pagoEm)} · ` : ''}${origem}.` };
    }
    case 'a_vencer': return { badge: { label: `Vence ${venc.slice(0, 5)}`, tone: 'warn' }, texto: `Vence em ${venc}${d.vencimentoCalculado ? ' (data calculada: dia 20, segunda-feira se cair no fim de semana)' : ''}. Ainda sem pagamento registrado pela Receita.` };
    case 'vencido': return { badge: { label: `Vencido ${venc.slice(0, 5)}`, tone: 'danger' }, texto: `Venceu em ${venc}${d.vencimentoCalculado ? ' (data calculada)' : ''} e a Receita não registra pagamento. Se o cliente pagou há pouco, a Receita pode levar 1 a 2 dias úteis para marcar.` };
    case 'sem_das': return { badge: { label: 'Sem DAS', tone: 'info' }, texto: 'Nenhum DAS gerado para este período na Receita.' };
    default: return { badge: { label: 'Não consultado', tone: 'neutral' }, texto: 'Ainda não consultado. Use "Atualizar DAS" para ver se o DAS foi gerado e se está pago.' };
  }
}

/**
 * Painel de UM cliente. Abrir = documentos já salvos (grátis). "Consultar" baixa os pagamentos do mês de apuração;
 * a busca avançada usa os filtros do serviço (tipo, documento, receita, datas e valores). O comprovante é emitido por
 * clique, uma vez: depois só se reabre o arquivo guardado.
 */
export function PagamentosClienteSheet({
  linha, competencia, consultando, consultandoDas, onConsultar, onConsultarDas, onClose,
}: {
  linha: LinhaUnificada | null;
  competencia: string;
  consultando: boolean;
  consultandoDas: boolean;
  onConsultar: (contactId: string) => void;
  onConsultarDas: (contactId: string) => void;
  onClose: () => void;
}) {
  const { data: todos = [] } = usePagamentosCliente(linha?.contact_id ?? null);
  const { ocupado, abrirExtrato } = useAbrirArquivo();
  const { pedir: pedirDas, gerando, dialog: dialogGerar } = useGerarDasComConfirmacao();

  // O DAS da competência aparece uma vez só, no bloco do DAS (com o documento pago, a composição e o comprovante); a lista traz os demais documentos.
  const idsNoBlocoDas = useMemo(() => new Set((linha?.das.docs ?? []).map((x) => x.id)), [linha]);
  const duplicados = useMemo(() => numerosDuplicados(todos), [todos]);

  if (!linha) return null;

  const renderDocumento = (p: PagamentoRow, opcoes?: { emitidoEm?: string | null; extrato?: React.ReactNode }) => (
    <DocumentoPagamentoCard key={p.id} p={p} duplicado={duplicados.has(p.numero_documento)} emitidoEm={opcoes?.emitidoEm} extrato={opcoes?.extrato} />
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[780px]">
        <SheetHeader className="space-y-1 text-left">
          <p className="font-mono text-meta text-muted-ink-2">{linha.documento}</p>
          <SheetTitle className="text-[20px]">{linha.nome}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <DsBadge tone={linha.consultadoEm ? 'ok' : 'neutral'}>
                {linha.consultadoEm ? `PA ${siglaCompetencia(competencia)} consultado` : `PA ${siglaCompetencia(competencia)} não consultado`}
              </DsBadge>
              {linha.novo && <DsBadge tone="warn">Pagamento novo</DsBadge>}
              {linha.duplicidade && <DsBadge tone="danger">Duplicidade</DsBadge>}
              {linha.saldo && <DsBadge tone="info">Saldo a verificar</DsBadge>}
              <span className="text-meta text-muted-ink">
                {linha.consultadoEm ? `Última consulta em ${format(new Date(linha.consultadoEm), 'dd/MM/yyyy HH:mm')}` : 'Use "Consultar" para baixar os pagamentos do mês'}
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5">
          <PagamentosDoCliente
            contactId={linha.contact_id}
            competencia={competencia}
            excluirIds={idsNoBlocoDas}
            consultando={consultando}
            onConsultar={onConsultar}
            consultadoEm={linha.consultadoEm}
            temDasNoMes={linha.das.docs.length > 0}
            meio={
              linha.das.estado !== 'nao_simples' && linha.das.estado !== 'filial' ? (() => {
          const d = linha.das;
          const r = resumoDas(d);
          const consultavel = ehSimplesConsultavel(linha);
          const pg = linha.simples;
          const reaproveitavel = !!pg && dasReaproveitavel(pg, competencia);
          const naoConsultado = d.estado === 'nao_consultado';
          // Documento pago em Pagamentos: a versão completa (com composição) vem da lista salva do cliente.
          const docCompleto = (doc: PagamentoRow) => todos.find((x) => x.id === doc.id) ?? doc;
          const idsCasados = new Set(d.casados.flatMap((c) => (c.doc ? [c.doc.id] : [])));
          const docsSemPar = d.docs.filter((x) => !idsCasados.has(x.id));
          const botaoExtrato = (das: DasRow) => (
            <DicaBotao custo={das.extrato_path ? undefined : 'Consultar'}
              texto={das.extrato_path ? 'Abre o extrato do DAS em PDF, que já está guardado.' : 'Baixa da Receita o extrato do DAS em PDF e guarda. Depois, é só reabrir o arquivo.'}>
              <Button size="sm" variant="outline" disabled={ocupado === `${das.id}:extrato`} onClick={() => abrirExtrato(das)}>
                {ocupado === `${das.id}:extrato` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
                Extrato{!das.extrato_path && <Preco tipo="Consultar" />}
              </Button>
            </DicaBotao>
          );
          // Lembrete para o cliente: DAS vencido, ou vencendo hoje e ainda sem pagamento registrado.
          const hoje = hojeBR();
          const lembrete = d.vencimento && (d.estado === 'vencido' || (d.estado === 'a_vencer' && d.vencimento === hoje))
            ? mensagemLembreteDas({ nome: linha.nome, pa: competencia, valor: d.valor, vencimento: d.vencimento, diasAtraso: diasEntre(d.vencimento, hoje) })
            : null;
          const copiarLembrete = async (texto: string) => {
            try {
              await navigator.clipboard.writeText(texto);
              toast.success('Mensagem copiada. É só colar no WhatsApp do cliente.');
            } catch {
              toast.error('Não foi possível copiar. Tente de novo.');
            }
          };
          return (
            <div className="mt-5 space-y-3 rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DsBadge tone="info">DAS</DsBadge>
                    <span className="text-ui text-ink">{siglaCompetencia(competencia)}</span>
                    <DsBadge tone={r.badge.tone}>{r.badge.label}</DsBadge>
                  </div>
                  <p className="mt-1 text-meta text-muted-ink">{r.texto}</p>
                  {pg?.consultadoEm && <p className="text-meta text-muted-ink-2">Consulta do PGDAS em {dataHoraBR(pg.consultadoEm)}</p>}
                </div>
                {d.valor != null && d.docs.length === 0 && <p className="text-[18px] font-medium text-ink">{moeda(d.valor)}</p>}
              </div>

              {(d.casados.length > 0 || docsSemPar.length > 0) && (
                <div className="space-y-3">
                  {d.casados.map(({ das, doc }) => doc ? renderDocumento(docCompleto(doc), { emitidoEm: das.emitido_em, extrato: botaoExtrato(das) }) : (
                    <div key={das.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-meta">
                      <span className="min-w-0 text-ink">
                        <span className="font-mono">{das.numero_das}</span>
                        <span className="text-muted-ink-2"> · emitido em {dataHoraBR(das.emitido_em)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <DsBadge tone={das.das_pago === true ? 'ok' : 'warn'} dot={false}>{das.das_pago === true ? 'Pago' : 'Não pago'}</DsBadge>
                        {botaoExtrato(das)}
                      </span>
                    </div>
                  ))}
                  {docsSemPar.map((doc) => renderDocumento(docCompleto(doc)))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <DicaBotao custo={consultavel ? 'Consultar' : undefined}
                  texto={consultavel ? `Consulta na Receita as declarações e os DAS do ano inteiro deste cliente, numa só chamada: mostra se o DAS foi gerado e se está pago.` : 'Filial: o DAS é da matriz. Consulte o CNPJ da matriz.'}>
                  <Button variant="outline" disabled={!consultavel || consultandoDas} onClick={() => onConsultarDas(linha.contact_id)}>
                    {consultandoDas ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Atualizar DAS{consultavel && <Preco tipo="Consultar" />}
                  </Button>
                </DicaBotao>
                {d.estado !== 'pago' && (
                  <DicaBotao custo={!consultavel || naoConsultado || reaproveitavel ? undefined : 'Emitir'}
                    texto={naoConsultado ? 'Consulte o ano deste cliente antes de gerar o DAS.'
                      : reaproveitavel ? 'Já existe um DAS gerado aqui e dentro do prazo: abre o arquivo guardado, sem emitir outro.'
                        : 'Gera o DAS deste período na Receita e guarda o PDF. Fica registrada uma emissão. Pede confirmação antes.'}>
                    <Button disabled={!consultavel || naoConsultado || gerando === linha.contact_id} onClick={() => pedirDas(linha.contact_id, competencia, linha.nome, reaproveitavel)}>
                      {gerando === linha.contact_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                      Gerar DAS{consultavel && !naoConsultado && !reaproveitavel && <Preco tipo="Emitir" />}
                    </Button>
                  </DicaBotao>
                )}
                {lembrete && (
                  <DicaBotao texto="Copia o texto pronto para colar no WhatsApp do cliente. Antes de enviar, use Atualizar DAS para confirmar que o pagamento ainda não aparece.">
                    <Button variant="outline" onClick={() => copiarLembrete(lembrete)}>
                      <Copy className="mr-2 h-4 w-4" />Copiar mensagem
                    </Button>
                  </DicaBotao>
                )}
                <p className="min-w-[200px] flex-1 text-meta text-muted-ink-2">Guia, extrato e comprovante são documentos diferentes e só saem no clique.</p>
              </div>
            </div>
          );
        })() : null
            }
          />
        </div>
        {dialogGerar}
      </SheetContent>
    </Sheet>
  );
}
