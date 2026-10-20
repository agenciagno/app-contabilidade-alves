import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Copy, Loader2, Mail, MessageCircle, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DsBadge } from '@/components/ds';
import { useEnviarCliente, type CanalEnvio } from '@/hooks/useEnvioCliente';
import type { LinkCliente } from '@/hooks/useLinkCliente';

/** Troca {nome}, {link} e {prazo} pelos dados do cliente. */
export function preencherMensagem(texto: string, v: { nome: string; link: string; prazo: string | null }) {
  const prazo = v.prazo ? format(parseISO(v.prazo), 'dd/MM/yyyy') : 'sem prazo definido';
  return texto.replace(/\{nome\}/g, v.nome).replace(/\{link\}/g, v.link).replace(/\{prazo\}/g, prazo);
}

/**
 * Mensagem de envio do link (20/10/2026): parte do modelo padrão de Tech → Onboarding (cliente novo × só boas-vindas) e pode ser
 * personalizada e salva só para este cliente. Envia por e-mail (sai pelo servidor, e-mail do cadastro), WhatsApp ou copia; tudo vai para
 * o histórico de envios do cliente.
 */
export function MensagemLinkCliente({
  contactId, nome, email, link, url, temDocumentosPendentes, modeloAssunto, modeloTexto, onSalvar, salvando,
}: {
  contactId: string;
  nome: string;
  email: string | null;
  link: LinkCliente;
  url: string;
  temDocumentosPendentes: boolean;
  modeloAssunto: string;
  modeloTexto: string;
  onSalvar: (campos: { mensagem_assunto: string | null; mensagem_texto: string | null }) => void;
  salvando: boolean;
}) {
  const personalizada = link.mensagem_texto != null || link.mensagem_assunto != null;
  const assuntoBase = link.mensagem_assunto ?? modeloAssunto;
  const textoBase = link.mensagem_texto ?? modeloTexto;
  const [assunto, setAssunto] = useState(assuntoBase);
  const [texto, setTexto] = useState(textoBase);
  const [ocupado, setOcupado] = useState<CanalEnvio | null>(null);
  const enviar = useEnviarCliente();

  // Recarrega quando muda o que está salvo (ou o modelo: cliente passou a ter documentos pendentes, por exemplo).
  useEffect(() => { setAssunto(assuntoBase); setTexto(textoBase); }, [assuntoBase, textoBase]);

  const mudou = assunto !== assuntoBase || texto !== textoBase;
  const valores = { nome, link: url, prazo: temDocumentosPendentes ? link.prazo_envio : null };

  const mandar = async (canal: CanalEnvio) => {
    if (!texto.trim()) { toast.error('Escreva a mensagem'); return; }
    setOcupado(canal);
    try {
      const r = await enviar.mutateAsync({
        contactId, canal, origem: 'onboarding', documentos: [],
        mensagem: preencherMensagem(texto, valores), assunto: preencherMensagem(assunto, valores),
        referencia: { link_id: link.id },
      });
      if (canal === 'email') toast.success(`E-mail enviado para ${r.destino}`);
      if (canal === 'whatsapp' && r.whatsapp) window.open(`https://wa.me/${r.whatsapp}?text=${encodeURIComponent(r.texto)}`, '_blank', 'noopener');
      if (canal === 'copiar') { await navigator.clipboard.writeText(r.texto); toast.success('Mensagem copiada'); }
      if (r.aviso) toast.warning(r.aviso);
    } catch (e) {
      toast.error((e as Error)?.message || 'Não foi possível enviar');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Mensagem para o cliente</CardTitle>
        <DsBadge tone={personalizada ? 'warn' : 'neutral'}>{personalizada ? 'Personalizada para este cliente' : 'Modelo padrão'}</DsBadge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Assunto do e-mail</Label>
          <Input value={assunto} onChange={e => setAssunto(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Mensagem</Label>
          <Textarea rows={8} value={texto} onChange={e => setTexto(e.target.value)} />
          <p className="text-meta text-muted-ink">{'{nome}'}, {'{link}'} e {'{prazo}'} viram os dados do cliente no envio. O modelo padrão fica em Tech → Onboarding.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline" size="sm" className="gap-1.5" disabled={!mudou || salvando}
            onClick={() => onSalvar({ mensagem_assunto: assunto, mensagem_texto: texto })}
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar só para este cliente
          </Button>
          {personalizada && (
            <Button variant="ghost" size="sm" className="gap-1.5" disabled={salvando}
              onClick={() => onSalvar({ mensagem_assunto: null, mensagem_texto: null })}>
              <RotateCcw className="h-4 w-4" /> Voltar ao modelo padrão
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button size="sm" className="gap-1.5" disabled={!email || !!ocupado} onClick={() => mandar('email')} title={email ? `Para ${email}` : 'Cadastre o e-mail do cliente'}>
            {ocupado === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar por e-mail
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!!ocupado} onClick={() => mandar('whatsapp')}>
            {ocupado === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Enviar no WhatsApp
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={!!ocupado} onClick={() => mandar('copiar')}>
            <Copy className="h-4 w-4" /> Copiar mensagem
          </Button>
          <span className="text-meta text-muted-ink">{email ? `E-mail vai para ${email}` : 'Sem e-mail no cadastro'}</span>
        </div>
      </CardContent>
    </Card>
  );
}
