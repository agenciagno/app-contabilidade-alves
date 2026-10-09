import { useState } from 'react';
import { format, lastDayOfMonth } from 'date-fns';
import { DateField } from '@/components/ds';
import { ehDiaUtil } from '@/lib/prazosFederais';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  abrirPdf, useConsultarPgdasd, useDocumentosPgdasd, useExtratoDas, useGerarDas, useLinkPgdasd,
  type DasRow, type DeclaracaoRow, type ResultadoPgdasd, type TipoArquivoPgdasd,
} from '@/hooks/useSerproPgdasd';
import { useLerFaturamento } from '@/hooks/useSerproFaturamento';
import { sufixoTarefas } from '@/lib/tarefasConcluidas';

/** Erros comuns das respostas do servidor. Devolve true se já tratou (mostrou o aviso). */
function avisarFalha(r: ResultadoPgdasd): boolean {
  if (r.foraDoMonitoramento || r.filial) { toast.error(r.error ?? 'Cliente fora do monitoramento.'); return true; }
  if (r.semProcuracao) { toast.error('Este cliente não tem procuração para o PGDAS-D.'); return true; }
  if (!r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return true; }
  return false;
}
const msg = (e: unknown, padrao: string) => (e as Error)?.message || padrao;

/**
 * Consulta do ANO de UM cliente (as 12 competências numa chamada), sempre por clique, sem lote.
 * Se o ano deste cliente foi consultado há pouco, pede confirmação antes de consultar de novo.
 * O valor do clique aparece no botão e na dica só para administrador e super administrador (`Preco`, `DicaBotao`); o total fica em Tech > Consumo Serpro.
 */
export function useConsultaPgdasd(ano: number) {
  const consultar = useConsultarPgdasd();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  const executar = async (contactId: string, force = false) => {
    setEmAndamento(contactId);
    try {
      const r = await consultar.mutateAsync({ contactId, ano, force });
      if (r.recente) { setAConfirmar(contactId); return; }
      if (avisarFalha(r)) return;
      toast.success((r.sem_declaracao ? `Nenhuma declaração em ${ano}` : `${r.declaracoes ?? 0} declarações e ${r.das ?? 0} DAS em ${ano} (${r.novas ?? 0} novos)`) + sufixoTarefas(r.tarefas_concluidas));
    } catch (e) {
      toast.error(msg(e, 'Falha na consulta. Tente novamente em instantes.'));
    } finally {
      setEmAndamento(null);
    }
  };

  const dialog = (
    <AlertDialog open={!!aConfirmar} onOpenChange={(o) => !o && setAConfirmar(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Este ano foi consultado há pouco</AlertDialogTitle>
          <AlertDialogDescription>
            Só vale a pena consultar de novo se o cliente acabou de transmitir ou pagar e a mudança ainda não apareceu aqui.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem consultar.">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo="Consultar" texto="Consulta a Receita de novo, mesmo já tendo consultado há pouco.">
            <AlertDialogAction onClick={() => { const id = aConfirmar!; setAConfirmar(null); executar(id, true); }}>
              Consultar de novo<Preco tipo="Consultar" />
            </AlertDialogAction>
          </DicaBotao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { executar, emAndamento, dialog };
}

/**
 * Abre um PDF guardado. Se ainda não foi baixado da Receita, baixa uma vez (chamada individual ao Serpro) e depois abre.
 * `ocupado` = chave do botão em andamento, para o spinner.
 */
export function useAbrirArquivo() {
  const documentos = useDocumentosPgdasd();
  const extrato = useExtratoDas();
  const link = useLinkPgdasd();
  const lerFaturamento = useLerFaturamento();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const abrir = async (chave: string, tipo: TipoArquivoPgdasd, linha: { id: string; contactId: string; periodo: string }, baixar: () => Promise<ResultadoPgdasd>) => {
    setOcupado(chave);
    try {
      let l = await link.mutateAsync({ tipo, id: linha.id });
      if (!l.ok || !l.url) {
        const b = await baixar();
        if (avisarFalha(b)) return;
        l = await link.mutateAsync({ tipo, id: linha.id });
      }
      if (!l.ok || !l.url) { toast.error(l.error ?? 'Não foi possível abrir o arquivo.'); return; }
      abrirPdf(l.url);
    } catch (e) {
      toast.error(msg(e, 'Não foi possível abrir o arquivo.'));
    } finally {
      setOcupado(null);
    }
  };

  /**
   * Declaração ou recibo (ou MAED) de uma declaração. Quando o PDF acaba de ser baixado da Receita, a leitura do faturamento
   * roda em seguida, em segundo plano e sem custo: falha aqui não atrapalha a abertura do arquivo.
   */
  const abrirDeclaracao = (d: DeclaracaoRow, tipo: 'declaracao' | 'recibo' | 'maed_notificacao' | 'maed_darf') =>
    abrir(`${d.id}:${tipo}`, tipo, { id: d.id, contactId: d.contact_id, periodo: d.periodo_apuracao.slice(0, 7) },
      async () => {
        const b = await documentos.mutateAsync({ contactId: d.contact_id, periodo: d.periodo_apuracao.slice(0, 7) });
        if (b.ok) lerFaturamento.mutate({ contactId: d.contact_id, periodo: d.periodo_apuracao.slice(0, 7) });
        return b;
      });

  const abrirExtrato = (das: DasRow) =>
    abrir(`${das.id}:extrato`, 'extrato', { id: das.id, contactId: das.contact_id, periodo: das.periodo_apuracao.slice(0, 7) },
      () => extrato.mutateAsync({ dasId: das.id }));

  const abrirDas = (das: DasRow) => abrir(`${das.id}:das`, 'das', { id: das.id, contactId: das.contact_id, periodo: das.periodo_apuracao.slice(0, 7) },
    async () => ({ ok: false, error: 'Este DAS não foi gerado por aqui. Use "Gerar DAS" para emitir o arquivo.' }));

  return { ocupado, abrirDeclaracao, abrirExtrato, abrirDas };
}

/**
 * Gerar DAS: pede confirmação (registra uma emissão na Receita) e abre o PDF.
 * Opcional (G12, 09/10/2026): uma data de pagamento. O DAS sai recalculado para aquele dia (multa e juros até ela) e é sempre um DAS novo,
 * mesmo que já exista um guardado. A data vai de hoje até o fim do mês; fora disso a Receita recusa e o aviso dela aparece.
 */
export function useGerarDasComConfirmacao() {
  const gerar = useGerarDas();
  const [alvo, setAlvo] = useState<{ contactId: string; periodo: string; nome: string; gratis: boolean } | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [dataPagamento, setDataPagamento] = useState('');
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const fimDoMes = format(lastDayOfMonth(new Date()), 'yyyy-MM-dd');
  const dataValida = !dataPagamento || (dataPagamento >= hoje && dataPagamento <= fimDoMes && ehDiaUtil(dataPagamento));
  const gratis = !!alvo?.gratis && !dataPagamento;

  const confirmar = async () => {
    if (!alvo || !dataValida) return;
    const a = alvo;
    const data = dataPagamento || undefined;
    setAlvo(null);
    setGerando(a.contactId);
    try {
      const r = await gerar.mutateAsync({ contactId: a.contactId, periodo: a.periodo, dataPagamento: data });
      if (avisarFalha(r)) return;
      if (r.url) abrirPdf(r.url);
      toast.success(r.jaGerado ? 'DAS já gerado: abrindo o arquivo guardado.' : data ? `DAS gerado para pagar em ${data.split('-').reverse().join('/')}.` : 'DAS gerado.');
    } catch (e) {
      toast.error(msg(e, 'Não foi possível gerar o DAS.'));
    } finally {
      setGerando(null);
    }
  };

  const dialog = (
    <AlertDialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gerar DAS?</AlertDialogTitle>
          <AlertDialogDescription>
            Vai gerar o DAS de {alvo ? `${alvo.periodo.slice(5)}/${alvo.periodo.slice(0, 4)}` : ''} de {alvo?.nome}. A emissão fica registrada na Receita.
            Se já houver um DAS gerado por aqui e ainda dentro do prazo, o arquivo guardado é aberto, sem emitir outro.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <label className="text-ui-strong text-ink">Data do pagamento (opcional)</label>
          <DateField value={dataPagamento} onChange={setDataPagamento} min={hoje} max={fimDoMes} desabilitar={(d) => !ehDiaUtil(d)} placeholder="Deixe em branco para o vencimento" />
          <p className={dataValida ? 'text-meta text-muted-ink-2' : 'text-meta text-danger'}>
            {dataValida
              ? 'Para o cliente que vai pagar atrasado: o DAS sai com multa e juros calculados até essa data. Sempre emite um DAS novo.'
              : `Escolha um dia útil (sem sábado, domingo ou feriado) entre hoje e ${fimDoMes.split('-').reverse().join('/')}.`}
          </p>
        </div>
        <AlertDialogFooter>
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem gerar o DAS.">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo={gratis ? undefined : 'Emitir'}
            texto={gratis ? 'Abre o DAS que já está guardado, sem emitir outro.' : 'Gera o DAS na Receita e abre o PDF. Fica registrada uma emissão.'}>
            <AlertDialogAction onClick={confirmar} disabled={!dataValida}>Gerar DAS{!gratis && <Preco tipo="Emitir" />}</AlertDialogAction>
          </DicaBotao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  /** `gratis` = já há DAS guardado e dentro do prazo: abrir o arquivo não emite nem cobra. */
  const pedir = (contactId: string, periodo: string, nome: string, gratisGuardado = false) => {
    setDataPagamento('');
    setAlvo({ contactId, periodo, nome, gratis: gratisGuardado });
  };
  return { pedir, gerando, dialog };
}
