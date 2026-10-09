import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DICA_LARGURA_TOTAL, DicaBotao } from '@/components/serpro/DicaBotao';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useAvisarCliente, useAvisosCaixa, type CanalAviso, type MensagemComCliente,
} from '@/hooks/useSerproCaixaPostal';

const CANAL_LABEL: Record<CanalAviso, string> = { email: 'E-mail', whatsapp: 'WhatsApp', copiar: 'Copiado' };

export type CanalTela = 'whatsapp' | 'email';
/** O que avisar: uma ou mais mensagens do MESMO cliente, por um canal. */
export interface AlvoAviso { mensagens: MensagemComCliente[]; canal: CanalTela }

const MAX_LISTADAS = 5;

/** WhatsApp do cadastro: o que o cliente tem em WhatsApp ou, na falta, o telefone. */
export const foneDoCliente = (c: MensagemComCliente['contacts']) => c?.whatsapp || c?.phone || null;

/** Número como o wa.me pede: só dígitos, com 55 na frente quando vier só com DDD. */
export const numeroWhatsapp = (bruto: string) => { const d = bruto.replace(/\D/g, ''); return d.length <= 11 ? `55${d}` : d; };

/** Para mostrar ao usuário: (31) 99999-9999, com +55 quando o cadastro já trouxer. */
export function formatarFone(bruto: string): string {
  const d = bruto.replace(/\D/g, '');
  const nacional = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  if (nacional.length === 11) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  if (nacional.length === 10) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  return bruto;
}

const dataBR = (iso: string) => format(new Date(iso), 'dd/MM/yyyy');
const validadeBR = (d: string) => format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');

function textoPadrao(msgs: MensagemComCliente[]): string {
  const fecho = 'Nossa equipe já está analisando e vai orientar os próximos passos. Se você recebeu algo parecido, por favor nos avise. Qualquer dúvida, estamos à disposição.';
  if (msgs.length === 1) {
    const m = msgs[0];
    const enviada = m.data_envio ? ` (enviada em ${dataBR(m.data_envio)})` : '';
    const prazo = m.data_validade ? ` O prazo informado é até ${validadeBR(m.data_validade)}.` : '';
    return `Olá! Identificamos uma comunicação da Receita Federal para a sua empresa na Caixa Postal do e-CAC: "${m.assunto}"${enviada}.${prazo} ${fecho}`;
  }
  const linhas = msgs.slice(0, MAX_LISTADAS).map((m) => `• "${m.assunto}"${m.data_envio ? ` (enviada em ${dataBR(m.data_envio)})` : ''}`);
  if (msgs.length > MAX_LISTADAS) linhas.push(`• e mais ${msgs.length - MAX_LISTADAS}`);
  return `Olá! Identificamos ${msgs.length} comunicações da Receita Federal para a sua empresa na Caixa Postal do e-CAC:\n\n${linhas.join('\n')}\n\n${fecho}`;
}

/**
 * Avisa o CLIENTE de mensagens da Receita, por WhatsApp ou por e-mail. Leva só o texto abaixo (editável), nunca o corpo da intimação.
 * Mostra para quem vai antes de enviar. E-mail sai pelo servidor, sem abrir programa de e-mail, e a tela confirma o envio;
 * WhatsApp abre no navegador de quem clicou. Os dois ficam no histórico de cada mensagem.
 */
export function AvisarClienteDialog({ alvo, onClose }: { alvo: AlvoAviso | null; onClose: () => void }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviadoEm, setEnviadoEm] = useState<Date | null>(null);
  const avisar = useAvisarCliente();
  const { data: avisos } = useAvisosCaixa();

  useEffect(() => { if (alvo) { setTexto(textoPadrao(alvo.mensagens)); setEnviadoEm(null); setEnviando(false); } }, [alvo]);

  if (!alvo || !alvo.mensagens.length) return null;
  const { mensagens, canal } = alvo;
  const contato = mensagens[0].contacts;
  const nome = contato?.display_name || contato?.name || 'Cliente';
  const email = contato?.email ?? null;
  const fone = foneDoCliente(contato);
  const destino = canal === 'email' ? email : fone;
  const ids = mensagens.map((m) => m.id);
  const ultimo = mensagens.map((m) => avisos?.get(m.id)).filter((a): a is NonNullable<typeof a> => !!a)
    .sort((a, b) => b.enviado_em.localeCompare(a.enviado_em))[0];

  const registrar = (c: CanalAviso) => avisar.mutateAsync({ mensagemIds: ids, canal: c, mensagem: texto });

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    toast.success('Mensagem copiada.');
    registrar('copiar').catch(() => undefined);
  };

  const abrirWhatsapp = () => {
    if (!fone) { toast.error('Cliente sem WhatsApp/telefone cadastrado.'); return; }
    window.open(`https://wa.me/${numeroWhatsapp(fone)}?text=${encodeURIComponent(texto)}`, '_blank');
    registrar('whatsapp').catch(() => toast.error('O WhatsApp abriu, mas o histórico não foi gravado.'));
  };

  const enviarEmail = async () => {
    if (!email) { toast.error('Cliente sem e-mail cadastrado.'); return; }
    setEnviando(true);
    try {
      const r = await avisar.mutateAsync({
        mensagemIds: ids, canal: 'email', mensagem: texto, assunto: 'Comunicação da Receita Federal na Caixa Postal do e-CAC',
      });
      if (r?.error) throw new Error(r.error);
      setEnviadoEm(new Date());
      toast.success(`E-mail enviado para ${email}.`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha ao enviar e-mail.');
    } finally {
      setEnviando(false);
    }
  };

  const ehEmail = canal === 'email';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">{ehEmail ? 'Avisar o cliente por e-mail' : 'Avisar o cliente por WhatsApp'}</DialogTitle>
          <p className="text-meta text-muted-ink">
            {nome}{mensagens.length > 1 ? ` · ${mensagens.length} mensagens` : ''}
          </p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-md border border-line bg-bg-2 px-4 py-3">
            <p className="text-kicker uppercase text-muted-ink">{ehEmail ? 'Vai para este e-mail' : 'Vai para este WhatsApp'}</p>
            {destino ? (
              <>
                <p className="mt-1 break-all font-mono text-[15px] text-ink">{ehEmail ? destino : formatarFone(destino)}</p>
                <p className="mt-0.5 text-meta text-muted-ink-2">Confira se é o contato certo do cliente antes de enviar.</p>
              </>
            ) : (
              <p className="mt-1 text-ui text-danger">
                {ehEmail ? 'Este cliente não tem e-mail cadastrado.' : 'Este cliente não tem WhatsApp nem telefone cadastrado.'} Cadastre na ficha do cliente.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Mensagem ao cliente</Label>
            <Textarea rows={mensagens.length > 1 ? 10 : 7} value={texto} onChange={(e) => setTexto(e.target.value)} className="text-[13px]" disabled={!!enviadoEm} />
            <p className="text-meta text-muted-ink-2">Só este texto vai ao cliente. O conteúdo da intimação não é enviado.</p>
          </div>

          {enviadoEm && (
            <div className="flex items-start gap-2 rounded-md border border-line bg-bg-2 px-4 py-3" role="status">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-em-dia" aria-hidden />
              <p className="text-ui text-ink">E-mail enviado para {email} às {format(enviadoEm, 'HH:mm')}. O envio ficou no histórico.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <DicaBotao className={DICA_LARGURA_TOTAL} texto="Copia o texto do aviso para colar onde quiser.">
              <Button variant="outline" className="w-full" onClick={copiar} disabled={!texto.trim()}>Copiar</Button>
            </DicaBotao>
            {ehEmail ? (
              <DicaBotao className={DICA_LARGURA_TOTAL} texto={email ? 'Envia o aviso agora, pelo e-mail da Contabilidade Alves, sem abrir programa de e-mail. A tela confirma quando sair.' : 'Este cliente não tem e-mail cadastrado.'}>
                <Button className="w-full" onClick={enviarEmail} disabled={!texto.trim() || !email || enviando || !!enviadoEm}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : enviadoEm ? 'E-mail enviado' : 'Enviar e-mail'}
                </Button>
              </DicaBotao>
            ) : (
              <DicaBotao className={DICA_LARGURA_TOTAL} texto={fone ? 'Abre o WhatsApp com o texto pronto. Você só confirma o envio lá.' : 'Este cliente não tem WhatsApp ou telefone cadastrado.'}>
                <Button className="w-full" onClick={abrirWhatsapp} disabled={!texto.trim() || !fone}>Abrir WhatsApp</Button>
              </DicaBotao>
            )}
          </div>

          <p className="text-meta text-muted-ink-2">
            {ultimo
              ? `Último aviso: ${CANAL_LABEL[ultimo.canal] ?? ultimo.canal} em ${format(new Date(ultimo.enviado_em), 'dd/MM/yyyy HH:mm')}.`
              : mensagens.length > 1 ? 'Nenhum aviso enviado ainda para estas mensagens.' : 'Nenhum aviso enviado ainda para esta mensagem.'}
          </p>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <DicaBotao texto="Fecha esta janela.">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </DicaBotao>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
