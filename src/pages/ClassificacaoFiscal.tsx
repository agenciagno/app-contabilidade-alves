import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Search, CheckCircle2 } from 'lucide-react';
import {
  PageHeader, DsAlert, DsBadge, tabsListClass, tabsTriggerClass,
  segmentedListClass, segmentedTriggerClass, MetricaFaixa, type MetricaFaixaItem,
} from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useContacts } from '@/hooks/useContacts';
import {
  useClassifyProduct, useConfirmarClassificacao, useFiscalClassificationHistory,
  type ClassificarResultado,
} from '@/hooks/useFiscalClassification';
import { UploadLoteFiscal } from '@/components/fiscal/UploadLoteFiscal';
import { getContactDisplayName } from '@/lib/contact-display';

function statusClassificacao(r: ClassificarResultado): { label: string; tone: 'ok' | 'warn' | 'info' } {
  const ambiguo = r.cclasstrib_candidatos.length > 0 || r.cest_candidatos.length > 1;
  if (ambiguo) return { label: 'Ambíguo — revisar', tone: 'warn' };
  if (r.ncm_via_ia) return { label: 'Sugerido por IA — confirmar', tone: 'info' };
  return { label: 'Classificado', tone: 'ok' };
}

export default function ClassificacaoFiscal() {
  const { contacts } = useContacts();
  const classificar = useClassifyProduct();
  const confirmar = useConfirmarClassificacao();
  const { historico, isLoading: carregandoHistorico } = useFiscalClassificationHistory();

  const [aba, setAba] = useState('consultar');
  const [contactId, setContactId] = useState<string>('');
  const [modoBusca, setModoBusca] = useState<'descricao' | 'ncm'>('descricao');
  const [ncmInput, setNcmInput] = useState('');
  const [descricaoInput, setDescricaoInput] = useState('');
  const [resultado, setResultado] = useState<ClassificarResultado | null>(null);
  const [cestEscolhido, setCestEscolhido] = useState<string>('');
  const [cclasstribEscolhido, setCclasstribEscolhido] = useState<string>('');
  const [csosnEscolhido, setCsosnEscolhido] = useState<string>('');
  const [confirmado, setConfirmado] = useState(false);

  const clientes = useMemo(
    () => contacts.filter((c) => c.is_active && c.type === 'cliente'),
    [contacts],
  );

  const podeClassificar = modoBusca === 'ncm'
    ? ncmInput.trim().length > 0
    : descricaoInput.trim().length > 0;

  const executar = () => {
    setConfirmado(false);
    classificar.mutate(
      {
        ncm: modoBusca === 'ncm' ? ncmInput.trim() || undefined : undefined,
        descricao: modoBusca === 'descricao' ? descricaoInput.trim() || undefined : undefined,
        contactId: contactId || null,
      },
      {
        onSuccess: (r) => {
          setResultado(r);
          setCestEscolhido(r.cest_candidatos?.[0]?.codigo ?? '');
          setCclasstribEscolhido(
            r.cclasstrib_sugerido?.codigo ?? r.cclasstrib_candidatos?.[0]?.cclasstrib_codigo ?? '',
          );
          setCsosnEscolhido(r.csosn_sugerido?.[0]?.codigo ?? '');
        },
      },
    );
  };

  const usarNcmCandidato = (codigo: string) => {
    setModoBusca('ncm');
    setNcmInput(codigo);
    setDescricaoInput('');
    classificar.mutate(
      { ncm: codigo, contactId: contactId || null },
      {
        onSuccess: (r) => {
          setResultado(r);
          setCestEscolhido(r.cest_candidatos?.[0]?.codigo ?? '');
          setCclasstribEscolhido(
            r.cclasstrib_sugerido?.codigo ?? r.cclasstrib_candidatos?.[0]?.cclasstrib_codigo ?? '',
          );
          setCsosnEscolhido(r.csosn_sugerido?.[0]?.codigo ?? '');
        },
      },
    );
  };

  const cclasstribEscolhidoInfo = resultado?.cclasstrib_candidatos?.find(
    (c) => c.cclasstrib_codigo === cclasstribEscolhido,
  );
  const cstFinal = resultado?.cclasstrib_sugerido?.cst_vinculado ?? null;

  const confirmarClassificacao = () => {
    if (!resultado?.classification_id) return;
    confirmar.mutate(
      {
        id: resultado.classification_id,
        cest: cestEscolhido || null,
        cclasstrib: cclasstribEscolhido || null,
        cstIbsCbs: cstFinal,
        csosn: csosnEscolhido || null,
      },
      { onSuccess: () => setConfirmado(true) },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/diagnóstico fiscal"
        title="Classificação Fiscal."
        subtitle="NCM, CEST, cClassTrib, CST-IBS/CBS e CSOSN por produto — direto das tabelas oficiais da Receita Federal, CONFAZ e da LC 214/2025."
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className={tabsListClass}>
          <TabsTrigger value="consultar" className={tabsTriggerClass}>Consultar</TabsTrigger>
          <TabsTrigger value="lote" className={tabsTriggerClass}>Upload em Lote</TabsTrigger>
          <TabsTrigger value="historico" className={tabsTriggerClass}>
            Histórico
            {historico.length > 0 && <span className="text-muted-ink">({historico.length})</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="consultar" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Classificar produto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cliente (opcional)</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem cliente vinculado" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{getContactDisplayName(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-meta text-muted-ink-2">
                  Vincular um cliente pré-carrega regime tributário e segmento de atuação já cadastrados.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Buscar por</Label>
                <Tabs value={modoBusca} onValueChange={(v) => setModoBusca(v as 'descricao' | 'ncm')}>
                  <TabsList className={segmentedListClass}>
                    <TabsTrigger value="descricao" className={segmentedTriggerClass}>Descrição</TabsTrigger>
                    <TabsTrigger value="ncm" className={segmentedTriggerClass}>NCM</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {modoBusca === 'descricao' ? (
                <div className="space-y-1.5">
                  <Label>Descrição do produto</Label>
                  <Textarea
                    placeholder="Ex.: Refrigerante Coca-Cola 1L"
                    value={descricaoInput}
                    onChange={(e) => setDescricaoInput(e.target.value)}
                    rows={2}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Código NCM</Label>
                  <Input
                    placeholder="Ex.: 2202.10.00"
                    value={ncmInput}
                    onChange={(e) => setNcmInput(e.target.value)}
                  />
                </div>
              )}

              <Button onClick={executar} disabled={!podeClassificar || classificar.isPending}>
                {classificar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Classificar
              </Button>
            </CardContent>
          </Card>

          {classificar.isPending && <Skeleton className="h-64 w-full" />}

          {resultado && !classificar.isPending && (
            <div className="space-y-4">
              {resultado.avisos?.map((a, i) => (
                <DsAlert key={i} tone="warn" title={a} />
              ))}

              {!resultado.ncm && resultado.ncm_candidatos && resultado.ncm_candidatos.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">NCM não identificado com certeza — candidatos</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {resultado.ncm_candidatos.map((c) => (
                      <button
                        key={c.codigo}
                        onClick={() => usarNcmCandidato(c.codigo)}
                        className="flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-bg-2"
                      >
                        <span><span className="font-medium">{c.codigo}</span> — {c.descricao}</span>
                        <DsBadge tone="neutral">{Math.round(c.score * 100)}%</DsBadge>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}

              {resultado.ncm && (() => {
                const status = statusClassificacao(resultado);
                const itensFaixa: MetricaFaixaItem[] = [];
                if (resultado.cclasstrib_sugerido) {
                  itensFaixa.push({
                    label: 'cClassTrib',
                    valor: resultado.cclasstrib_sugerido.codigo,
                    hint: resultado.cclasstrib_sugerido.nome || resultado.cclasstrib_sugerido.descricao,
                  });
                }
                if (resultado.cst_ibs_cbs) {
                  itensFaixa.push({ label: 'CST-IBS/CBS', valor: resultado.cst_ibs_cbs });
                }
                if (resultado.cest_candidatos.length === 1) {
                  itensFaixa.push({
                    label: 'CEST',
                    valor: resultado.cest_candidatos[0].codigo,
                    hint: resultado.cest_candidatos[0].descricao,
                  });
                } else if (resultado.cest_candidatos.length === 0) {
                  itensFaixa.push({ label: 'CEST', valor: 'Não sujeito a ST' });
                }
                if (resultado.csosn_sugerido.length === 1) {
                  itensFaixa.push({
                    label: 'CSOSN',
                    valor: resultado.csosn_sugerido[0].codigo,
                    hint: resultado.csosn_sugerido[0].descricao,
                  });
                }
                itensFaixa.push({
                  label: 'CFOP de referência',
                  valor: resultado.cfop_referencia.codigo,
                  hint: resultado.cfop_referencia.aviso,
                });

                return (
                  <Card>
                    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-4">
                      <div className="space-y-3">
                        <CardTitle className="text-base">Resultado da consulta</CardTitle>
                        {resultado.ncm_hierarquia && resultado.ncm_hierarquia.length > 0 && (
                          <div className="space-y-0.5">
                            {resultado.ncm_hierarquia.map((h) => (
                              <p key={h.codigo} className="text-sm text-muted-ink">
                                <span className="font-medium">{h.codigo}</span> — {h.descricao}
                              </p>
                            ))}
                          </div>
                        )}
                        <div>
                          <p className="text-metric-xl text-ink">{resultado.ncm.codigo}</p>
                          <p className="mt-0.5 text-sm text-muted-ink">{resultado.ncm.descricao}</p>
                        </div>
                      </div>
                      <DsBadge tone={status.tone}>{status.label}</DsBadge>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {itensFaixa.length > 0 && (
                        <MetricaFaixa items={itensFaixa} labelClassName="text-xs font-bold text-ink" />
                      )}

                      {resultado.cclasstrib_sugerido?.fonte && (
                        <p className="text-sm text-muted-ink">Base legal: {resultado.cclasstrib_sugerido.fonte}</p>
                      )}
                      {resultado.cclasstrib_sugerido && (resultado.cclasstrib_sugerido.p_red_ibs || resultado.cclasstrib_sugerido.p_red_cbs) ? (
                        <p className="text-sm text-muted-ink">
                          Redução: IBS {resultado.cclasstrib_sugerido.p_red_ibs ?? 0}% · CBS {resultado.cclasstrib_sugerido.p_red_cbs ?? 0}%
                        </p>
                      ) : null}

                      {(resultado.cest_candidatos.length > 1 || resultado.cclasstrib_candidatos.length > 0) && (
                        <div className="space-y-4 rounded-md border border-line bg-bg-2 p-4">
                          <p className="text-ui-strong text-ink">Revisar e escolher</p>
                          {resultado.cest_candidatos.length > 1 && (
                            <div className="space-y-1.5">
                              <Label>CEST</Label>
                              <RadioGroup value={cestEscolhido} onValueChange={setCestEscolhido}>
                                {resultado.cest_candidatos.map((c) => (
                                  <div key={c.codigo} className="flex items-start gap-2">
                                    <RadioGroupItem value={c.codigo} id={`cest-${c.codigo}`} className="mt-1" />
                                    <Label htmlFor={`cest-${c.codigo}`} className="text-sm font-normal">
                                      <span className="font-medium">{c.codigo}</span> — {c.descricao}
                                    </Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>
                          )}
                          {resultado.cclasstrib_candidatos.length > 0 && (
                            <div className="space-y-1.5">
                              <Label>cClassTrib</Label>
                              <RadioGroup value={cclasstribEscolhido} onValueChange={setCclasstribEscolhido}>
                                {resultado.cclasstrib_candidatos.map((c) => (
                                  <div key={c.cclasstrib_codigo} className="flex items-start gap-2 rounded-md border border-line p-3">
                                    <RadioGroupItem value={c.cclasstrib_codigo} id={`cc-${c.cclasstrib_codigo}`} className="mt-1" />
                                    <Label htmlFor={`cc-${c.cclasstrib_codigo}`} className="text-sm font-normal">
                                      <span className="font-medium">{c.cclasstrib_codigo}</span> — {c.cclasstrib_nome}
                                      <p className="mt-1 text-meta text-muted-ink-2">
                                        Anexo {c.anexo}, item {c.item_lei}: {c.descricao_lei}
                                      </p>
                                    </Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>
                          )}
                        </div>
                      )}

                      {resultado.csosn_sugerido.length > 1 && (
                        <div className="space-y-1.5">
                          <Label>CSOSN (Simples Nacional / MEI)</Label>
                          <RadioGroup value={csosnEscolhido} onValueChange={setCsosnEscolhido}>
                            {resultado.csosn_sugerido.map((c) => (
                              <div key={c.codigo} className="flex items-start gap-2">
                                <RadioGroupItem value={c.codigo} id={`csosn-${c.codigo}`} className="mt-1" />
                                <Label htmlFor={`csosn-${c.codigo}`} className="text-sm font-normal">
                                  <span className="font-medium">{c.codigo}</span> — {c.descricao}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                      )}

                      {resultado.classification_id && (
                        <Button onClick={confirmarClassificacao} disabled={confirmar.isPending || confirmado}>
                          {confirmado ? <CheckCircle2 className="h-4 w-4" /> : confirmar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {confirmado ? 'Confirmado — no acervo da equipe' : 'Confirmar classificação'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="lote" className="mt-4">
          <UploadLoteFiscal />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <div className="overflow-hidden rounded-lg border border-line bg-paper">
            {carregandoHistorico ? (
              <Skeleton className="h-40 w-full" />
            ) : historico.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma classificação ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>NCM</TableHead>
                    <TableHead>CEST</TableHead>
                    <TableHead>cClassTrib</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="max-w-[240px] truncate font-medium">{h.descricao_produto}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{getContactDisplayName(h.contacts) || '—'}</TableCell>
                      <TableCell className="text-sm">{h.ncm ?? '—'}</TableCell>
                      <TableCell className="text-sm">{h.cest ?? '—'}</TableCell>
                      <TableCell className="text-sm">{h.cclasstrib ?? '—'}</TableCell>
                      <TableCell>
                        <DsBadge tone={h.status === 'confirmado' ? 'ok' : 'neutral'}>
                          {h.status === 'confirmado' ? 'Confirmado' : 'Sugestão'}
                        </DsBadge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(h.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
