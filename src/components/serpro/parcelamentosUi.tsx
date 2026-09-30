import { useState } from 'react';
import { toast } from 'sonner';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ROTULO_MOD, rotuloParcela, useConsultarParcelamentos, useGerarGuiaParcela, useLinkGuia,
  type Modalidade, type ResultadoParcelamentos,
} from '@/hooks/useSerproParcelamentos';

const msg = (e: unknown, padrao: string) => (e as Error)?.message || padrao;

/** Erros comuns das respostas do servidor. Devolve true se já tratou (mostrou o aviso). */
function avisarFalha(r: ResultadoParcelamentos): boolean {
  if (r.foraDoMonitoramento || r.filial) { toast.error(r.error ?? 'Cliente fora do monitoramento.'); return true; }
  if (r.semProcuracao) { toast.error(r.error ?? 'Este cliente não tem procuração para os parcelamentos.'); return true; }
  if (!r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return true; }
  return false;
}

/**
 * Consulta de UM cliente (pedidos das modalidades de parcelamento do Simples e, onde há parcelamento ativo, as parcelas em aberto),
 * sempre por clique, sem lote. Se o cliente foi consultado há pouco, pede confirmação antes de consultar de novo.
 * `chamadas` = quantas consultas o clique deve fazer (para o valor mostrado ao administrador).
 */
export function useConsultaParcelamentos() {
  const consultar = useConsultarParcelamentos();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<{ id: string; chamadas: number } | null>(null);

  const executar = async (contactId: string, chamadas: number, force = false) => {
    setEmAndamento(contactId);
    try {
      const r = await consultar.mutateAsync({ contactId, force });
      if (r.recente) { setAConfirmar({ id: contactId, chamadas }); return; }
      if (avisarFalha(r)) return;
      const erros = (r.modalidades ?? []).filter((m) => m.erro);
      const resumo = r.ativos ? `${r.ativos} parcelamento(s) ativo(s), ${r.parcelas ?? 0} parcela(s) em aberto` : 'Nenhum parcelamento ativo';
      if (erros.length) toast.warning(`${resumo}. Falhou em ${erros.map((e) => ROTULO_MOD[e.modalidade]).join(', ')}: ${erros[0].erro}`);
      else toast.success(resumo);
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
          <AlertDialogTitle>Este cliente foi consultado há pouco</AlertDialogTitle>
          <AlertDialogDescription>
            Só vale a pena consultar de novo se o cliente acabou de pagar ou de pedir um parcelamento e a mudança ainda não apareceu aqui.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem consultar.">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo="Consultar" vezes={aConfirmar?.chamadas} texto="Consulta a Receita de novo, mesmo já tendo consultado há pouco.">
            <AlertDialogAction onClick={() => { const a = aConfirmar!; setAConfirmar(null); executar(a.id, a.chamadas, true); }}>
              Consultar de novo<Preco tipo="Consultar" vezes={aConfirmar?.chamadas} />
            </AlertDialogAction>
          </DicaBotao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { executar, emAndamento, dialog };
}

/**
 * Gerar guia da parcela: pede confirmação (registra uma emissão na Receita) e abre o PDF. Guia da mesma parcela gerada nas últimas 24 h
 * é só reaberta, sem emitir outra.
 */
export function useGerarGuiaComConfirmacao() {
  const gerar = useGerarGuiaParcela();
  const [alvo, setAlvo] = useState<{ contactId: string; modalidade: Modalidade; parcela: number; nome: string; gratis: boolean } | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);

  const confirmar = async () => {
    if (!alvo) return;
    const a = alvo;
    setAlvo(null);
    setGerando(`${a.modalidade}:${a.parcela}`);
    try {
      const r = await gerar.mutateAsync({ contactId: a.contactId, modalidade: a.modalidade, parcela: a.parcela });
      if (avisarFalha(r)) return;
      if (r.url) { const l = document.createElement('a'); l.href = r.url; l.click(); }
      toast.success(r.jaGerado ? 'Guia já gerada há pouco: abrindo o arquivo guardado.' : 'Guia gerada.');
    } catch (e) {
      toast.error(msg(e, 'Não foi possível gerar a guia.'));
    } finally {
      setGerando(null);
    }
  };

  const dialog = (
    <AlertDialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gerar a guia da parcela?</AlertDialogTitle>
          <AlertDialogDescription>
            Vai gerar a guia da parcela {alvo ? rotuloParcela(alvo.parcela) : ''} do {alvo ? ROTULO_MOD[alvo.modalidade] : ''} de {alvo?.nome}. A emissão fica registrada na Receita.
            Parcela atrasada sai com multa e juros atualizados até a data da emissão. Se já houver uma guia desta parcela gerada nas últimas 24 horas, o arquivo guardado é aberto, sem emitir outra.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <DicaBotao className={DICA_RODAPE} texto="Fecha sem gerar a guia.">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </DicaBotao>
          <DicaBotao className={DICA_RODAPE} custo={alvo?.gratis ? undefined : 'Emitir'}
            texto={alvo?.gratis ? 'Abre a guia que já foi gerada há pouco, sem emitir outra.' : 'Gera a guia na Receita e abre o PDF. Fica registrada uma emissão.'}>
            <AlertDialogAction onClick={confirmar}>Gerar guia{!alvo?.gratis && <Preco tipo="Emitir" />}</AlertDialogAction>
          </DicaBotao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { pedir: (contactId: string, modalidade: Modalidade, parcela: number, nome: string, gratis = false) => setAlvo({ contactId, modalidade, parcela, nome, gratis }), gerando, dialog };
}

/** Reabre uma guia já guardada (sem chamada à Receita). */
export function useAbrirGuia() {
  const link = useLinkGuia();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const abrir = async (id: string) => {
    setOcupado(id);
    try {
      const l = await link.mutateAsync({ id });
      if (!l.ok || !l.url) { toast.error(l.error ?? 'Não foi possível abrir a guia.'); return; }
      const a = document.createElement('a');
      a.href = l.url;
      a.click();
    } catch (e) {
      toast.error(msg(e, 'Não foi possível abrir a guia.'));
    } finally {
      setOcupado(null);
    }
  };
  return { ocupado, abrir };
}
