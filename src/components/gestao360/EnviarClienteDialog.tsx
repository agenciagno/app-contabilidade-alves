import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { DICA_LARGURA_TOTAL, DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ROTULO_CANAL, useContatoEnvio, useDocumentosCliente, useEnviarCliente, useEnviosCliente,
  type CanalEnvio, type PedidoEnvio,
} from '@/hooks/useEnvioCliente';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import type { ModeloMensagem } from '@/lib/mensagensCliente';

interface Props {
  contactId: string;
  nome: string;
  modelo: ModeloMensagem;
  /** De onde o envio saiu: grava no histórico e, na ausência, anota "cliente avisado". */
  origem: 'ausencia' | 'ficha' | 'oportunidade';
  referencia?: PedidoEnvio['referencia'];
  /** Documentos já marcados ao abrir (`tipo:id`). */
  marcadosInicial?: string[];
  onClose: () => void;
}

const erroDe = (e: unknown, padrao: string) => (e as Error)?.message || padrao;
const chaveDoc = (tipo: string, id: string) => `${tipo}:${id}`;

/**
 * Enviar ao cliente: um só lugar para e-mail, WhatsApp ou texto copiado, com ou sem documentos guardados.
 * E-mail sai pelo servidor; WhatsApp abre no navegador de quem clicou (o clique final de enviar é humano); tudo fica no histórico.
 * Documentos vão como link com validade de 7 dias, nunca como anexo solto.
 */
export function EnviarClienteDialog({ contactId, nome, modelo, origem, referencia, marcadosInicial = [], onClose }: Props) {
  const [assunto, setAssunto] = useState(modelo.assunto);
  const [texto, setTexto] = useState(modelo.texto);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(marcadosInicial));
  const [ocupado, setOcupado] = useState<CanalEnvio | null>(null);
  const [paraCopiar, setParaCopiar] = useState<string | null>(null);

  const contato = useContatoEnvio(contactId);
  const docs = useDocumentosCliente(contactId);
  const envios = useEnviosCliente(contactId);
  const equipe = useTeamProfiles();
  const enviar = useEnviarCliente();

  const email = contato.data?.email ?? null;
  const fone = (contato.data?.whatsapp || contato.data?.phone || '').replace(/\D/g, '');
  const temFone = fone.length >= 10;
  const ultimo = envios.data?.[0];
  const quemEnviou = useMemo(() => new Map((equipe.data ?? []).map((p) => [p.id, p.full_name ?? ''] as const)), [equipe.data]);

  const alternar = (k: string, on: boolean) => setMarcados((atual) => { const n = new Set(atual); if (on) n.add(k); else n.delete(k); return n; });
  const pedido = (canal: CanalEnvio): PedidoEnvio => ({
    contactId, canal, mensagem: texto, assunto, origem, referencia,
    documentos: [...marcados].map((k) => { const [tipo, id] = k.split(':'); return { tipo, id }; }),
  });
  const rodar = async (canal: CanalEnvio, fazer: () => Promise<void>) => {
    setOcupado(canal);
    try { await fazer(); } finally { setOcupado(null); }
  };

  const enviarEmail = () => rodar('email', async () => {
    try {
      const r = await enviar.mutateAsync(pedido('email'));
      toast.success(`E-mail enviado para ${r.destino}.`);
      if (r.aviso) toast.warning(r.aviso);
    } catch (e) { toast.error(erroDe(e, 'Falha ao enviar o e-mail.')); }
  });

  const abrirWhatsapp = () => {
    // Abre a aba já no clique (o navegador bloqueia janela aberta depois de uma espera); o endereço entra quando o servidor responde.
    const janela = window.open('', '_blank');
    return rodar('whatsapp', async () => {
      try {
        const r = await enviar.mutateAsync(pedido('whatsapp'));
        if (!r.whatsapp) throw new Error('Cliente sem WhatsApp ou telefone cadastrado.');
        const url = `https://wa.me/${r.whatsapp}?text=${encodeURIComponent(r.texto)}`;
        if (janela) janela.location.href = url; else window.open(url, '_blank');
        if (r.aviso) toast.warning(r.aviso);
      } catch (e) {
        janela?.close();
        toast.error(erroDe(e, 'Falha ao preparar o WhatsApp.'));
      }
    });
  };

  const copiar = () => rodar('copiar', async () => {
    try {
      const r = await enviar.mutateAsync(pedido('copiar'));
      try { await navigator.clipboard.writeText(r.texto); toast.success('Texto copiado.'); }
      catch { setParaCopiar(r.texto); toast.info('O navegador não deixou copiar sozinho: copie o texto abaixo.'); }
    } catch (e) { toast.error(erroDe(e, 'Falha ao preparar o texto.')); }
  });

  const lista = docs.data ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[560px] overflow-y-auto p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[16px]">Enviar ao cliente</DialogTitle>
          <p className="text-meta text-muted-ink">{nome}</p>
          <p className="text-meta text-muted-ink-2">
            E-mail: {email ?? 'não cadastrado'} · WhatsApp: {contato.data?.whatsapp || contato.data?.phone || 'não cadastrado'}
          </p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-ink">Assunto (só no e-mail)</Label>
            <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Mensagem ao cliente</Label>
            <Textarea rows={9} value={texto} onChange={(e) => setTexto(e.target.value)} className="text-[13px]" />
            <p className="text-meta text-muted-ink-2">Texto pronto, editável. Só sai quando você clicar em um dos botões abaixo.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-ink">Documentos</Label>
            {docs.isLoading ? (
              <p className="text-meta text-muted-ink">Procurando documentos guardados…</p>
            ) : lista.length === 0 ? (
              <p className="text-meta text-muted-ink">
                Nenhum documento deste cliente está guardado ainda. A rodada mensal (dia 30) guarda a Situação fiscal dos clientes.
              </p>
            ) : (
              <div className="max-h-[170px] space-y-1.5 overflow-y-auto rounded-md border border-line-2 p-3">
                {lista.map((d) => {
                  const k = chaveDoc(d.tipo, d.id);
                  return (
                    <label key={k} className="flex cursor-pointer items-center gap-2 text-ui text-ink">
                      <Checkbox checked={marcados.has(k)} onCheckedChange={(v) => alternar(k, v === true)} />
                      <span className="min-w-0 flex-1 truncate">{d.rotulo}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-meta text-muted-ink-2">Os documentos vão como link com validade de 7 dias, não como anexo.</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <DicaBotao className={DICA_LARGURA_TOTAL} texto="Copia o texto (com os links dos documentos marcados) para colar onde quiser.">
              <Button variant="outline" className="w-full" onClick={copiar} disabled={!texto.trim() || ocupado !== null}>
                {ocupado === 'copiar' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Copiar'}
              </Button>
            </DicaBotao>
            <DicaBotao className={DICA_LARGURA_TOTAL} texto={temFone ? 'Abre o WhatsApp com o texto e os links prontos. Você só confirma o envio lá.' : 'Este cliente não tem WhatsApp ou telefone cadastrado.'}>
              <Button variant="outline" className="w-full" onClick={abrirWhatsapp} disabled={!texto.trim() || !temFone || ocupado !== null}>
                {ocupado === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir WhatsApp'}
              </Button>
            </DicaBotao>
            <DicaBotao className={DICA_LARGURA_TOTAL} texto={email ? 'Envia por e-mail ao cliente, pelo e-mail da Contabilidade Alves.' : 'Este cliente não tem e-mail cadastrado.'}>
              <Button variant="outline" className="w-full" onClick={enviarEmail} disabled={!texto.trim() || !email || ocupado !== null}>
                {ocupado === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar por E-mail'}
              </Button>
            </DicaBotao>
          </div>

          {paraCopiar !== null && (
            <Textarea readOnly rows={6} value={paraCopiar} onFocus={(e) => e.currentTarget.select()} className="text-[12px]" />
          )}

          <p className="text-meta text-muted-ink-2">
            {ultimo
              ? `Último envio: ${ROTULO_CANAL[ultimo.canal] ?? ultimo.canal} em ${format(new Date(ultimo.enviado_em), 'dd/MM/yyyy HH:mm')}${ultimo.enviado_por && quemEnviou.get(ultimo.enviado_por) ? ` por ${quemEnviou.get(ultimo.enviado_por)}` : ''}${ultimo.documentos?.length ? ` · ${ultimo.documentos.length} ${ultimo.documentos.length === 1 ? 'documento' : 'documentos'}` : ''}.`
              : 'Nenhum envio registrado para este cliente.'}
          </p>
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
