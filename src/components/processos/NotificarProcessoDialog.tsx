import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEnviarCliente } from '@/hooks/useEnvioCliente';
import {
  ProcessoOpcao, ProcessoRow, nomeCliente, useRegistrarMensagemProcesso,
} from '@/hooks/useProcessos';
import { HistoricoProcesso } from '@/components/processos/HistoricoProcesso';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processo: ProcessoRow | null;
  opcoes: Map<string, ProcessoOpcao>;
}

/** Nome para a saudação: o nome curto do cadastro (não a razão social com LTDA) ou o nome avulso. */
function nomeSaudacao(p: ProcessoRow): string {
  return p.contacts?.display_name || p.contacts?.name || p.nome_avulso || nomeCliente(p);
}

/** Texto pronto conforme o status, no tom do WhatsApp da CA (saudação pelo nome, curto, fecha com "estou à disposição"). */
function mensagemPadrao(p: ProcessoRow, opcoes: Map<string, ProcessoOpcao>): string {
  const status = opcoes.get(p.status_id);
  const servico = opcoes.get(p.servico_id)?.nome ?? 'serviço';
  const orgao = p.orgao_id ? opcoes.get(p.orgao_id)?.nome : null;
  const protocolo = p.protocolo ? `\nProtocolo: ${p.protocolo}` : '';
  const ola = `Olá, ${nomeSaudacao(p)}! 👋`;
  const fecho = 'Qualquer dúvida, estou à disposição!';
  switch (status?.papel) {
    case 'inicial':
      return `${ola}\n\nRecebemos sua solicitação de ${servico} e já vamos dar início ao processo\n\n${fecho}`;
    case 'aguardando_cliente':
      return `${ola}\n\nPara seguir com a sua solicitação de ${servico}, precisamos de um retorno seu para continuar${protocolo}\n\nAssim que recebermos, damos sequência. ${fecho}`;
    case 'concluido':
      return `${ola} ✅\n\nSua solicitação de ${servico} foi concluída${protocolo}\n\n${fecho}`;
    default:
      return `${ola}\n\nAtualização da sua solicitação de ${servico}: ${status?.nome ?? 'em andamento'}${orgao ? ` (${orgao})` : ''}${protocolo}\n\n${fecho}`;
  }
}

/** Número para o wa.me: só dígitos, com 55 quando vier só DDD + número. */
function numeroWhats(bruto: string | null | undefined): string | null {
  const d = String(bruto ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

export function NotificarProcessoDialog({ open, onOpenChange, processo, opcoes }: Props) {
  const [mensagem, setMensagem] = useState('');
  const enviar = useEnviarCliente();
  const registrar = useRegistrarMensagemProcesso();

  useEffect(() => {
    if (open && processo) setMensagem(mensagemPadrao(processo, opcoes));
  }, [open, processo, opcoes]);

  if (!processo) return null;

  const doCadastro = !!processo.contact_id;
  const email = processo.contacts?.email ?? null;
  const whats = doCadastro ? numeroWhats(processo.contacts?.whatsapp || processo.contacts?.phone) : numeroWhats(processo.whatsapp_avulso);
  const servico = opcoes.get(processo.servico_id)?.nome ?? 'Processo';
  const referencia = { processo_id: processo.id };

  const anotar = (canal: 'email' | 'whatsapp' | 'copiar', destino: string | null) =>
    registrar.mutate({ processo, canal, destino, mensagem }, {
      onError: () => toast.warning('Mensagem enviada, mas o histórico do processo não foi gravado.'),
    });

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
    } catch {
      toast.error('Não foi possível copiar.');
      return;
    }
    toast.success('Mensagem copiada.');
    anotar('copiar', null);
    if (doCadastro) enviar.mutate({ contactId: processo.contact_id!, canal: 'copiar', mensagem, documentos: [], origem: 'processo', referencia });
  };

  const handleWhatsapp = async () => {
    if (!whats) { toast.error('Cliente sem WhatsApp ou telefone cadastrado.'); return; }
    // Abre a aba já no clique (senão o navegador bloqueia a janela aberta depois da resposta do servidor).
    const aba = window.open('', '_blank');
    let numero = whats;
    let texto = mensagem;
    if (doCadastro) {
      try {
        const r = await enviar.mutateAsync({ contactId: processo.contact_id!, canal: 'whatsapp', mensagem, documentos: [], origem: 'processo', referencia });
        numero = r.whatsapp ?? numero;
        texto = r.texto || texto;
      } catch (e: any) {
        aba?.close();
        toast.error(e?.message ?? 'Falha ao preparar a mensagem.');
        return;
      }
    }
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
    if (aba) aba.location.href = url; else window.open(url, '_blank');
    anotar('whatsapp', numero);
  };

  const handleEmail = async () => {
    if (!doCadastro || !email) { toast.error('Cliente sem e-mail cadastrado.'); return; }
    try {
      await enviar.mutateAsync({ contactId: processo.contact_id!, canal: 'email', mensagem, assunto: `${servico} — andamento da sua solicitação`, documentos: [], origem: 'processo', referencia });
      toast.success('E-mail enviado ao cliente.');
      anotar('email', email);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar o e-mail.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">Mensagem ao cliente</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="truncate text-ui text-ink">{nomeCliente(processo)}</p>
            <p className="text-meta text-muted-ink-2">
              WhatsApp: {whats ?? 'não cadastrado'} · E-mail: {doCadastro ? (email ?? 'não cadastrado') : 'sem cadastro'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Mensagem</Label>
            <Textarea rows={7} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="text-[13px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={handleCopiar} disabled={!mensagem.trim()}>Copiar</Button>
            <Button variant="outline" onClick={handleWhatsapp} disabled={!mensagem.trim() || !whats || enviar.isPending}>Abrir WhatsApp</Button>
            <Button variant="outline" onClick={handleEmail} disabled={!mensagem.trim() || !doCadastro || !email || enviar.isPending}>
              {enviar.isPending && enviar.variables?.canal === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar por e-mail'}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Mensagens enviadas</Label>
            <HistoricoProcesso processoId={processo.id} opcoes={opcoes} so="mensagens" />
          </div>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
