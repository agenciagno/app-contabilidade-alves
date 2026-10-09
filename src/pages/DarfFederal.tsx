import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Copy, FileDown, Loader2, Barcode, Calculator } from 'lucide-react';
import { toast } from 'sonner';

import { DsBadge, PageHeader, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SearchableSelect } from '@/components/fiscal/SearchableSelect';
import { Preco, brl } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import {
  ROTULO_TIPO_PA, proximoDiaUtil, useClientesDarf, useCodigoBarrasDarf, useDarfsGerados, useGerarDarf, useLinkDarf,
  type DarfRow, type TipoPa,
} from '@/hooks/useSerproDarf';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string | null) => {
  const n = (d ?? '').replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d ?? '';
};
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const moeda = (v: number | null) => (v === null ? '—' : brl(v));
const nomeDe = (d: DarfRow) => d.contacts?.razao_social || d.contacts?.name || 'Cliente';

function abrir(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
}

export default function DarfFederal() {
  const { data: clientes = [] } = useClientesDarf();
  const { data: darfs = [], isLoading } = useDarfsGerados();
  const gerar = useGerarDarf();
  const barras = useCodigoBarrasDarf();
  const link = useLinkDarf();

  const [cliente, setCliente] = useState('all');
  const [receita, setReceita] = useState('');
  const [extensao, setExtensao] = useState('01');
  const [tipoPa, setTipoPa] = useState<TipoPa>('ME');
  const [mes, setMes] = useState('');         // AAAA-MM (mensal)
  const [trimestre, setTrimestre] = useState('01');
  const [ano, setAno] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [valor, setValor] = useState('');
  const [pagamento, setPagamento] = useState(proximoDiaUtil());
  const [referencia, setReferencia] = useState('');
  const [observacao, setObservacao] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const opcoes = useMemo(() => clientes.map((c) => ({ value: c.id, label: `${c.nome} · ${formatarCnpj(c.documento)}` })), [clientes]);
  const clienteSel = clientes.find((c) => c.id === cliente) ?? null;

  const dataPa = tipoPa === 'ME' ? (mes ? `${mes.slice(5, 7)}/${mes.slice(0, 4)}` : '') : tipoPa === 'TR' ? (ano ? `${trimestre}/${ano}` : '') : ano;
  const completo = !!clienteSel && /^\d{4}$/.test(receita) && /^\d{2}$/.test(extensao) && !!dataPa && !!vencimento && !!valor.trim() && !!pagamento;

  const stats = useMemo(() => {
    const mesAtual = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
    const doMes = darfs.filter((d) => d.created_at.slice(0, 7) === mesAtual);
    return {
      gerados: doMes.length,
      total: doMes.reduce((s, d) => s + (d.valor_total ?? 0), 0),
      acrescimos: doMes.reduce((s, d) => s + (d.valor_multa ?? 0) + (d.valor_juros ?? 0), 0),
    };
  }, [darfs]);

  const executar = async () => {
    if (!clienteSel) return;
    setConfirmando(false);
    setGerando(true);
    const aviso = toast.loading('Calculando o DARF na Receita...');
    try {
      const r = await gerar.mutateAsync({
        contactId: clienteSel.id, receita, extensao, tipoPa, dataPa, vencimento, valorImposto: valor, dataConsolidacao: pagamento,
        numeroReferencia: referencia || undefined, observacao: observacao || undefined,
      });
      if (r.semProcuracao || !r.ok) { toast.error(r.error ?? 'Não foi possível gerar o DARF.', { id: aviso }); return; }
      toast.success(r.jaGerado ? 'Este mesmo DARF foi gerado há poucos minutos: abrindo o arquivo guardado.' : `DARF gerado: total de ${moeda(r.valor_total ?? null)}${r.valido_ate ? `, pagar até ${dataBR(r.valido_ate)}` : ''}.`, { id: aviso });
      setUltimo(r.id ?? null);
      if (r.url) abrir(r.url);
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha ao gerar o DARF. Tente novamente em instantes.', { id: aviso });
    } finally {
      setGerando(false);
    }
  };

  const abrirPdf = async (id: string) => {
    setOcupado(`pdf:${id}`);
    try {
      const l = await link.mutateAsync({ id });
      if (!l.ok || !l.url) { toast.error(l.error ?? 'Não foi possível abrir o arquivo.'); return; }
      abrir(l.url);
    } catch (e) { toast.error((e as Error)?.message || 'Não foi possível abrir o arquivo.'); } finally { setOcupado(null); }
  };

  const pedirBarras = async (id: string) => {
    setOcupado(`cb:${id}`);
    try {
      const r = await barras.mutateAsync({ id });
      if (!r.ok || !r.codigo_barras) { toast.error(r.error ?? 'Não foi possível obter o código de barras.'); return; }
      toast.success('Código de barras obtido.');
    } catch (e) { toast.error((e as Error)?.message || 'Não foi possível obter o código de barras.'); } finally { setOcupado(null); }
  };

  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success('Código de barras copiado.'); } catch { toast.error('Não foi possível copiar.'); }
  };

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'darfs-gerados',
    titulo: 'DARFs atualizados gerados pelo SICALC',
    colunas: ['Gerado em', 'Razão social', 'CNPJ', 'Receita', 'Período', 'Vencimento', 'Imposto', 'Multa', 'Juros', 'Total', 'Pagar até', 'Nº do documento', 'Código de barras'],
    linhas: darfs.map((d) => [
      format(new Date(d.created_at), 'dd/MM/yyyy HH:mm'), nomeDe(d), formatarCnpj(d.contacts?.document ?? ''), `${d.codigo_receita}-${d.extensao}`, d.data_pa, dataBR(d.vencimento),
      moeda(d.valor_imposto), moeda(d.valor_multa), moeda(d.valor_juros), moeda(d.valor_total), dataBR(d.valido_ate), d.numero_documento ?? '', d.codigo_barras ?? '',
    ]),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard fiscal · darf atualizado"
        title="DARF atualizado."
        subtitle="Calcula multa e juros de um débito e gera o DARF para pagar. O sistema não descobre a dívida: você informa a receita, o período, o vencimento original, o valor do imposto e a data em que o cliente vai pagar, e a Receita devolve o DARF atualizado até essa data. DAS do Simples tem tela própria, não use aqui."
        actions={<ExportarMenu montar={tabelaExport} disabled={darfs.length === 0} escolherColunas />}
      />

      <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
        <h2 className="text-h4-card text-ink">Novo DARF</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-meta text-muted-ink md:col-span-2">
            Cliente
            <SearchableSelect value={cliente} onChange={setCliente} options={opcoes} placeholder="Escolha o cliente" width="w-full" />
          </label>
          <label className="space-y-1.5 text-meta text-muted-ink">
            Código da receita
            <Input inputMode="numeric" maxLength={4} value={receita} onChange={(e) => setReceita(e.target.value.replace(/\D/g, ''))} placeholder="ex.: 2089" />
          </label>
          <label className="space-y-1.5 text-meta text-muted-ink">
            Extensão
            <Input inputMode="numeric" maxLength={2} value={extensao} onChange={(e) => setExtensao(e.target.value.replace(/\D/g, ''))} placeholder="01" />
          </label>

          <label className="space-y-1.5 text-meta text-muted-ink">
            Tipo do período
            <Select value={tipoPa} onValueChange={(v) => setTipoPa(v as TipoPa)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ROTULO_TIPO_PA) as TipoPa[]).map((t) => <SelectItem key={t} value={t}>{ROTULO_TIPO_PA[t]}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {tipoPa === 'ME' && (
            <label className="space-y-1.5 text-meta text-muted-ink">
              Mês de apuração
              <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </label>
          )}
          {tipoPa === 'TR' && (
            <>
              <label className="space-y-1.5 text-meta text-muted-ink">
                Trimestre
                <Select value={trimestre} onValueChange={setTrimestre}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['01', '02', '03', '04'].map((t) => <SelectItem key={t} value={t}>{t}º trimestre</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-meta text-muted-ink">
                Ano
                <Input inputMode="numeric" maxLength={4} value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ''))} placeholder="aaaa" />
              </label>
            </>
          )}
          {tipoPa === 'AN' && (
            <label className="space-y-1.5 text-meta text-muted-ink">
              Ano
              <Input inputMode="numeric" maxLength={4} value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ''))} placeholder="aaaa" />
            </label>
          )}
          <label className="space-y-1.5 text-meta text-muted-ink">
            Vencimento original
            <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </label>
          <label className="space-y-1.5 text-meta text-muted-ink">
            Valor do imposto (R$)
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1000,00" />
          </label>
          <label className="space-y-1.5 text-meta text-muted-ink">
            Data do pagamento
            <Input type="date" value={pagamento} onChange={(e) => setPagamento(e.target.value)} />
          </label>
          <label className="space-y-1.5 text-meta text-muted-ink">
            Nº de referência (opcional)
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="só se a receita exigir" />
          </label>
          <label className="space-y-1.5 text-meta text-muted-ink md:col-span-2">
            Observação no DARF (opcional)
            <Input maxLength={100} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DicaBotao custo="Emitir" texto={completo ? 'Calcula multa e juros na Receita até a data do pagamento e gera o DARF em PDF. Pede confirmação antes.' : 'Preencha cliente, receita, período, vencimento, valor e data do pagamento.'}>
            <Button disabled={!completo || gerando} onClick={() => setConfirmando(true)}>
              {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
              Calcular e gerar DARF<Preco tipo="Emitir" />
            </Button>
          </DicaBotao>
          <p className="min-w-[240px] flex-1 text-meta text-muted-ink-2">
            Pagamento em dia útil. A multa de mora e os juros (Selic) são calculados pela Receita até a data informada; se o cliente pagar depois dela, gere de novo.
          </p>
        </div>
      </section>

      <StatCardRow
        items={[
          { label: 'DARFs gerados no mês', value: stats.gerados, hint: 'por cliques da equipe' },
          { label: 'Total dos DARFs do mês', value: moeda(stats.total), hint: 'imposto + multa + juros' },
          { label: 'Multa e juros do mês', value: moeda(stats.acrescimos), hint: 'acréscimos calculados pela Receita' },
        ]}
      />

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : darfs.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum DARF gerado ainda. Preencha o formulário acima.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gerado em</TableHead>
                <TableHead>Cliente / Razão Social</TableHead>
                <TableHead>Receita · período</TableHead>
                <TableHead className="text-right">Imposto</TableHead>
                <TableHead className="text-right">Multa + juros</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pagar até</TableHead>
                <TableHead className="text-center">PDF</TableHead>
                <TableHead className="text-right">Código de barras</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {darfs.map((d) => (
                <TableRow key={d.id} className={d.id === ultimo ? 'bg-bg-2' : undefined}>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">{format(new Date(d.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                  <TableCell>
                    <p className="text-ui text-ink">{nomeDe(d)}</p>
                    <p className="text-meta text-muted-ink-2">{formatarCnpj(d.contacts?.document ?? '')}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ui">
                    <span className="font-mono">{d.codigo_receita}-{d.extensao}</span> · {d.data_pa}
                    <p className="text-meta text-muted-ink-2">venc. {dataBR(d.vencimento)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-ui">{moeda(d.valor_imposto)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-ui text-muted-ink">
                    {moeda((d.valor_multa ?? 0) + (d.valor_juros ?? 0))}
                    <p className="text-meta text-muted-ink-2">{d.percentual_multa ?? 0}% + {d.percentual_juros ?? 0}%</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-ui text-ink">{moeda(d.valor_total)}</TableCell>
                  <TableCell className="whitespace-nowrap text-ui">
                    {d.valido_ate ? (d.valido_ate < new Date().toISOString().slice(0, 10) ? <DsBadge tone="danger" dot={false}>Venceu em {dataBR(d.valido_ate)}</DsBadge> : dataBR(d.valido_ate)) : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <DicaBotao texto="Abre o PDF do DARF, que já está guardado. Não consulta a Receita.">
                      <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `pdf:${d.id}`} onClick={() => abrirPdf(d.id)}>
                        {ocupado === `pdf:${d.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      </Button>
                    </DicaBotao>
                  </TableCell>
                  <TableCell className="text-right">
                    {d.codigo_barras ? (
                      <DicaBotao texto="Copia os 44 dígitos do código de barras para colar no app do banco.">
                        <Button size="sm" variant="outline" onClick={() => copiar(d.codigo_barras!)}>
                          <Copy className="mr-1.5 h-4 w-4" /> Copiar
                        </Button>
                      </DicaBotao>
                    ) : (
                      <DicaBotao custo="Emitir" texto="Pede à Receita o código de barras deste DARF, para pagar pelo app do banco. É uma nova emissão. Nem toda receita aceita.">
                        <Button size="sm" variant="outline" disabled={ocupado === `cb:${d.id}`} onClick={() => pedirBarras(d.id)}>
                          {ocupado === `cb:${d.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Barcode className="mr-1.5 h-4 w-4" />}
                          Gerar<Preco tipo="Emitir" />
                        </Button>
                      </DicaBotao>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar este DARF?</AlertDialogTitle>
            <AlertDialogDescription>
              {clienteSel?.nome}: receita {receita}-{extensao}, período {dataPa}, vencimento {dataBR(vencimento)}, imposto de R$ {valor}, pagamento em {dataBR(pagamento)}.
              A Receita calcula multa e juros até essa data e gera o DARF. Se o mesmo DARF foi gerado nos últimos 10 minutos, o arquivo guardado é aberto, sem emitir outro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <DicaBotao className={DICA_RODAPE} texto="Fecha sem gerar o DARF.">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
            </DicaBotao>
            <DicaBotao className={DICA_RODAPE} custo="Emitir" texto="Calcula e gera o DARF na Receita.">
              <AlertDialogAction onClick={executar}>Gerar DARF<Preco tipo="Emitir" /></AlertDialogAction>
            </DicaBotao>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
