import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  abrirPdf, useConsultarPgdasd, useDocumentosPgdasd, useExtratoDas, useGerarDas, useLinkPgdasd,
  type DasRow, type DeclaracaoRow, type ResultadoPgdasd, type TipoArquivoPgdasd,
} from '@/hooks/useSerproPgdasd';

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
 * Custos não aparecem nas telas de operação: ficam só em Tech > Consumo Serpro.
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
      toast.success(r.sem_declaracao ? `Nenhuma declaração em ${ano}` : `${r.declaracoes ?? 0} declarações e ${r.das ?? 0} DAS em ${ano} (${r.novas ?? 0} novos)`);
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
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const id = aConfirmar!; setAConfirmar(null); executar(id, true); }}>
            Consultar de novo
          </AlertDialogAction>
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

  /** Declaração ou recibo (ou MAED) de uma declaração. */
  const abrirDeclaracao = (d: DeclaracaoRow, tipo: 'declaracao' | 'recibo' | 'maed_notificacao' | 'maed_darf') =>
    abrir(`${d.id}:${tipo}`, tipo, { id: d.id, contactId: d.contact_id, periodo: d.periodo_apuracao.slice(0, 7) },
      () => documentos.mutateAsync({ contactId: d.contact_id, periodo: d.periodo_apuracao.slice(0, 7) }));

  const abrirExtrato = (das: DasRow) =>
    abrir(`${das.id}:extrato`, 'extrato', { id: das.id, contactId: das.contact_id, periodo: das.periodo_apuracao.slice(0, 7) },
      () => extrato.mutateAsync({ dasId: das.id }));

  const abrirDas = (das: DasRow) => abrir(`${das.id}:das`, 'das', { id: das.id, contactId: das.contact_id, periodo: das.periodo_apuracao.slice(0, 7) },
    async () => ({ ok: false, error: 'Este DAS não foi gerado por aqui. Use "Gerar DAS" para emitir o arquivo.' }));

  return { ocupado, abrirDeclaracao, abrirExtrato, abrirDas };
}

/** Gerar DAS: pede confirmação (registra uma emissão na Receita) e abre o PDF. */
export function useGerarDasComConfirmacao() {
  const gerar = useGerarDas();
  const [alvo, setAlvo] = useState<{ contactId: string; periodo: string; nome: string } | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);

  const confirmar = async () => {
    if (!alvo) return;
    const a = alvo;
    setAlvo(null);
    setGerando(a.contactId);
    try {
      const r = await gerar.mutateAsync({ contactId: a.contactId, periodo: a.periodo });
      if (avisarFalha(r)) return;
      if (r.url) abrirPdf(r.url);
      toast.success(r.jaGerado ? 'DAS já gerado: abrindo o arquivo guardado.' : 'DAS gerado.');
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
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar}>Gerar DAS</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { pedir: (contactId: string, periodo: string, nome: string) => setAlvo({ contactId, periodo, nome }), gerando, dialog };
}
