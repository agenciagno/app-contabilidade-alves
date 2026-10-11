import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { FileText, Loader2 } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { FichaCliente } from '@/components/gestao360/FichaCliente';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { SeloMini } from '@/components/monitor/MonitorUi';
import { PagamentosDoCliente } from '@/components/serpro/PagamentosDoCliente';
import { useAbrirRelatorioSitfis } from '@/components/serpro/sitfisUi';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { certificadoPorCliente, useCertificates } from '@/hooks/useCertificates';
import { useMatrizEProcesso } from '@/hooks/useSerproExtras';
import { competenciaPadrao } from '@/hooks/useSerproPagamentos';
import {
  ROTULO_MOD, competenciaAtual, estadoParcelamento, modalidadesAtivas, parcelasAtrasadas, parcelasDoMes, rotuloParcela, somaValor, useMatrizParcelamentos,
} from '@/hooks/useSerproParcelamentos';
import { useMatrizSitfis, type SitfisRow } from '@/hooks/useSerproSitfis';
import { useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';
import { seloCertificado, seloParcelamento, seloSitfis, type Selo } from '@/lib/monitorEstados';
import { ROTULO_PRIORIDADE, montarPlanoAcao, ultimaLeituraFaturamento, type AcaoPlano } from '@/lib/relatoriosCliente';
import { digitos } from '@/lib/situacaoCarteira';

/** Seção em que a ficha abre (a da tela de onde veio). */
export type SecaoFicha = 'plano' | 'pagamentos' | 'sitfis' | 'parcelamentos' | 'eprocesso' | 'certificado';

interface FichaCtx { abrir: (contactId: string, secao?: SecaoFicha) => void }
const Contexto = createContext<FichaCtx | null>(null);

/**
 * Ficha Fiscal do Cliente (R2 da varredura do Monitoramento, 10/10/2026): um painel só, com tudo o que está salvo do cliente.
 * Fica no AppLayout: qualquer tela abre com `useFichaFiscal().abrir(id)`. Ao trocar de tela (ou de filtro na URL) a ficha fecha.
 */
export function FichaFiscalProvider({ children }: { children: ReactNode }) {
  const [alvo, setAlvo] = useState<{ id: string; secao?: SecaoFicha } | null>(null);
  const valor = useMemo<FichaCtx>(() => ({ abrir: (id, secao) => setAlvo({ id, secao }) }), []);
  // O mesmo AppLayout serve rotas diferentes sem remontar: um link de dentro da ficha leva a outra tela e a ficha fecha.
  const { pathname, search } = useLocation();
  useEffect(() => { setAlvo(null); }, [pathname, search]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      {alvo && <FichaFiscalSheet key={alvo.id} contactId={alvo.id} secao={alvo.secao} onClose={() => setAlvo(null)} />}
    </Contexto.Provider>
  );
}

export function useFichaFiscal(): FichaCtx {
  return useContext(Contexto) ?? { abrir: () => {} };
}

/** Botão "Ficha fiscal completa" para os painéis próprios das telas (Simples, DCTFWeb, Parcelamentos, Pagamentos, Caixa Postal). */
export function BotaoFichaFiscal({ contactId, secao }: { contactId: string; secao?: SecaoFicha }) {
  const { abrir } = useFichaFiscal();
  return (
    <DicaBotao texto="Abre tudo o que está salvo deste cliente num painel só: situação de cada frente, o que fazer, pagamentos, situação fiscal, parcelamentos, e-Processo e certificado. Não consulta a Receita.">
      <Button size="sm" variant="outline" onClick={() => abrir(contactId, secao)}>Ficha fiscal completa</Button>
    </DicaBotao>
  );
}

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function seloDoRelatorio(r: SitfisRow): Selo | null {
  if (!r.confiavel || r.resultado === 'nao_lido' || !r.resultado) return seloSitfis('a_conferir');
  return seloSitfis(r.resultado);
}

function Secao({ id, titulo, link, children }: { id: SecaoFicha; titulo: string; link?: { to: string; rotulo: string }; children: ReactNode }) {
  return (
    <section id={`ficha-${id}`} className="scroll-mt-4 space-y-3 rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-ui-strong text-ink">{titulo}</h3>
        {link && <Link to={link.to} className="text-ui-strong text-action hover:underline">{link.rotulo}</Link>}
      </div>
      {children}
    </section>
  );
}

const TOM_PRIORIDADE: Record<AcaoPlano['prioridade'], 'danger' | 'warn' | 'info' | 'neutral'> = { 1: 'danger', 2: 'warn', 3: 'info', 4: 'neutral' };

function FichaFiscalSheet({ contactId, secao, onClose }: { contactId: string; secao?: SecaoFicha; onClose: () => void }) {
  const { linhas, carregando, faturamento } = useSituacaoCarteira();
  const { data: sitfis = [], isLoading: carregandoSitfis } = useMatrizSitfis();
  const { data: parcelamentos = [], isLoading: carregandoParc } = useMatrizParcelamentos();
  const { data: eprocessos = [], isLoading: carregandoEproc } = useMatrizEProcesso();
  const { data: certificados = [] } = useCertificates();
  const { ocupado, abrir: abrirPdf } = useAbrirRelatorioSitfis();
  const [verTodos, setVerTodos] = useState(false);
  const rolou = useRef(false);

  const l = linhas.find((x) => x.contact_id === contactId) ?? null;
  const sf = sitfis.find((x) => x.contact_id === contactId) ?? null;
  const pc = parcelamentos.find((x) => x.contact_id === contactId) ?? null;
  const ep = eprocessos.find((x) => x.contact_id === contactId) ?? null;
  const cert = useMemo(() => certificadoPorCliente(certificados).get(contactId) ?? null, [certificados, contactId]);
  const plano = useMemo(() => (l ? montarPlanoAcao(l) : []), [l]);
  const ocupadoTudo = carregando || carregandoSitfis || carregandoParc || carregandoEproc;

  const nome = l?.nome ?? sf?.nome ?? ep?.nome ?? pc?.nome ?? 'Cliente';
  const documento = l?.documento ?? sf?.documento ?? ep?.documento ?? pc?.documento ?? '';
  const q = `?q=${digitos(documento)}`;

  // Abre já na seção da tela de onde veio (uma vez, quando os dados chegam).
  useEffect(() => {
    if (!secao || ocupadoTudo || rolou.current) return;
    rolou.current = true;
    requestAnimationFrame(() => document.getElementById(`ficha-${secao}`)?.scrollIntoView({ block: 'start' }));
  }, [secao, ocupadoTudo]);

  const atual = competenciaAtual();
  const historico = sf?.historico ?? [];

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto bg-bg-2 sm:max-w-[820px]">
        <SheetHeader className="space-y-1 text-left">
          <p className="text-kicker uppercase text-muted-ink-2">Ficha fiscal</p>
          {/* Com o cliente na carteira, nome e CNPJ já vêm no cabeçalho da ficha logo abaixo: aqui ficam só para o leitor de tela. */}
          <SheetTitle className={l ? 'sr-only' : 'text-[20px]'}>{nome}</SheetTitle>
          <SheetDescription className={l ? 'sr-only' : undefined}>{documento ? formatarCnpj(documento) : ''} · tudo o que está salvo, sem consultar a Receita</SheetDescription>
          {l && <p className="text-meta text-muted-ink-2">Tudo o que está salvo do cliente, sem consultar a Receita.</p>}
        </SheetHeader>

        {ocupadoTudo ? (
          <div className="mt-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
        ) : (
          <div className="mt-5 space-y-4">
            {l ? (
              <FichaCliente
                linha={l}
                faturamento={ultimaLeituraFaturamento(faturamento, contactId)}
                extra={(
                  <div id="ficha-plano" className="scroll-mt-4 space-y-2 rounded-md border border-line-2 p-3">
                    <p className="text-ui-strong text-ink">O que fazer</p>
                    {plano.length === 0 ? (
                      <p className="text-meta text-muted-ink">Nada pendente nos itens verificados.</p>
                    ) : (
                      <ul className="space-y-2">
                        {plano.map((a) => (
                          <li key={a.titulo} className="flex items-start gap-2">
                            <DsBadge tone={TOM_PRIORIDADE[a.prioridade]} dot={false} className="mt-0.5 shrink-0">{ROTULO_PRIORIDADE[a.prioridade]}</DsBadge>
                            <span className="min-w-0">
                              <span className="block text-ui text-ink">{a.titulo}</span>
                              <span className="block text-meta text-muted-ink">{a.oQueFazer} · <span className="text-muted-ink-2">{a.quem}</span></span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              />
            ) : (
              <section className="rounded-lg border border-line bg-paper p-5 text-ui text-muted-ink">
                Este cliente não está na carteira monitorada (cliente inativo, filial ou sem regime no cadastro). Abaixo, só o que já está salvo dele.{' '}
                <Link to={`/crm/cliente/${contactId}`} className="text-ui-strong text-action hover:underline">Abrir cadastro</Link>
              </section>
            )}

            <Secao id="pagamentos" titulo="Pagamentos" link={{ to: `/dashboard-federal/pagamentos${q}`, rotulo: 'Abrir em Pagamentos' }}>
              <PagamentosDoCliente contactId={contactId} competencia={competenciaPadrao()} soMesInicial={false} />
            </Secao>

            <Secao id="sitfis" titulo="Situação fiscal" link={{ to: `/dashboard-federal/situacao-fiscal${q}`, rotulo: 'Abrir em Situação Fiscal' }}>
              {historico.length === 0 ? (
                <p className="text-meta text-muted-ink">Nenhum relatório guardado. A rotina mensal gera um por cliente; para gerar agora, abra a Situação Fiscal.</p>
              ) : (
                <div className="divide-y divide-line-2">
                  {(verTodos ? historico : historico.slice(0, 3)).map((r, i) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <span className="w-[130px] shrink-0 font-mono text-ui text-ink">{r.gerado_em ? format(new Date(r.gerado_em), 'dd/MM/yyyy HH:mm') : '—'}</span>
                      <SeloMini selo={seloDoRelatorio(r)} />
                      {i === 0 && <DsBadge tone="neutral" dot={false}>Mais recente</DsBadge>}
                      <span className="min-w-0 flex-1 text-meta text-muted-ink">
                        {r.categorias.length > 0 ? r.categorias.join('; ') : ''}
                        {r.certidao_tipo ? `${r.categorias.length ? ' · ' : ''}${r.certidao_tipo} até ${dataBR(r.certidao_validade)}` : ''}
                      </span>
                      <DicaBotao texto="Abre o PDF deste relatório, que já está guardado. Não consulta a Receita.">
                        <Button size="sm" variant="ghost" disabled={!r.pdf_path || ocupado === r.id} onClick={() => abrirPdf(r.id)}>
                          {ocupado === r.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}PDF
                        </Button>
                      </DicaBotao>
                    </div>
                  ))}
                  {historico.length > 3 && (
                    <button type="button" className="pt-2 text-ui-strong text-action hover:underline" onClick={() => setVerTodos((v) => !v)}>
                      {verTodos ? 'Mostrar só os 3 mais recentes' : `Ver os ${historico.length} relatórios`}
                    </button>
                  )}
                </div>
              )}
            </Secao>

            <Secao id="parcelamentos" titulo="Parcelamentos" link={{ to: `/dashboard-federal/parcelamentos${q}`, rotulo: 'Abrir em Parcelamentos' }}>
              {!pc ? (
                <p className="text-meta text-muted-ink">Fora da lista de parcelamentos (só Simples Nacional e MEI).</p>
              ) : (() => {
                const atrasadas = parcelasAtrasadas(pc, atual);
                const doMes = parcelasDoMes(pc, atual);
                const ativas = modalidadesAtivas(pc);
                return (
                  <div className="space-y-1.5">
                    <SeloMini selo={seloParcelamento(estadoParcelamento(pc, atual), atrasadas.length, doMes.length)} vazio="Não consultado" />
                    {ativas.length > 0 && <p className="text-ui text-ink">Ativos: {ativas.map((m) => ROTULO_MOD[m]).join(', ')}</p>}
                    {atrasadas.length > 0 && (
                      <p className="text-meta text-muted-ink">
                        {atrasadas.length} {atrasadas.length === 1 ? 'parcela atrasada' : 'parcelas atrasadas'} ({atrasadas.map((p) => rotuloParcela(p.parcela)).join(', ')})
                        {` · ${moeda(somaValor(atrasadas))}`}
                      </p>
                    )}
                    {doMes.length > 0 && <p className="text-meta text-muted-ink">Parcela do mês em aberto · {moeda(somaValor(doMes))}</p>}
                  </div>
                );
              })()}
            </Secao>

            <Secao id="eprocesso" titulo="e-Processo" link={{ to: `/dashboard-federal/eprocesso${q}`, rotulo: 'Abrir em e-Processo' }}>
              {!ep?.consulta ? (
                <p className="text-meta text-muted-ink">Ainda não consultado.</p>
              ) : ep.processos.length === 0 ? (
                <p className="text-meta text-muted-ink">Nenhum processo em que o cliente é interessado (consulta de {dataBR(ep.consulta.consultado_em)}).</p>
              ) : (
                <div className="divide-y divide-line-2">
                  {ep.processos.map((p) => (
                    <div key={p.id} className="py-2">
                      <p className="text-ui text-ink"><span className="font-mono">{p.numero}</span> · {p.tipo ?? 'Processo'}{p.subtipo ? ` (${p.subtipo})` : ''}</p>
                      <p className="text-meta text-muted-ink">Protocolo {dataBR(p.data_protocolo)}{p.situacao ? ` · ${p.situacao}` : ''}{p.localizacao ? ` · ${p.localizacao}` : ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </Secao>

            <Secao id="certificado" titulo="Certificado digital" link={{ to: '/dashboard-federal/procuracoes?aba=certificados', rotulo: 'Abrir em Certificados' }}>
              {cert ? (
                <div className="flex flex-wrap items-center gap-3">
                  <SeloMini selo={seloCertificado(cert.dias)} />
                  <span className="text-meta text-muted-ink">{cert.modelo} · válido até {dataBR(cert.validade)}</span>
                </div>
              ) : (
                <p className="text-meta text-muted-ink">Nenhum certificado do cliente cadastrado.</p>
              )}
            </Secao>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
