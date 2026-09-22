import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, Copy, Loader2, Mail, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCobrancaBoletos, type CobrancaBoleto, type CobrancaContact } from '@/hooks/useCobrancaBoletos';
import { useNotificarCobrancaMultipla, useRegistrarNotificacaoLocalCobranca } from '@/hooks/useBoletoNotifications';
import { buildCobrancaMensagem, fmtBRL, fmtDateCobranca, PIX_KEY_CNPJ } from '@/lib/cobranca-mensagem';

type SelectedBoleto = CobrancaBoleto & { contact_name: string };

export function CobrancaTab() {
  const { contacts, isLoading } = useCobrancaBoletos();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [uncheckedBoletoIds, setUncheckedBoletoIds] = useState<Set<string>>(new Set());
  const [destinoWhats, setDestinoWhats] = useState('');
  const [destinoEmail, setDestinoEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [gerandoPrint, setGerandoPrint] = useState(false);
  const reciboRef = useRef<HTMLDivElement>(null);

  const registrarLocal = useRegistrarNotificacaoLocalCobranca();
  const enviarEmailMultiplo = useNotificarCobrancaMultipla();

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedContactIds.has(c.contact_id)),
    [contacts, selectedContactIds],
  );

  const selectedBoletos = useMemo<SelectedBoleto[]>(() => {
    const list: SelectedBoleto[] = [];
    for (const c of selectedContacts) {
      for (const b of c.boletos) {
        if (!uncheckedBoletoIds.has(b.id)) list.push({ ...b, contact_name: c.name });
      }
    }
    return list;
  }, [selectedContacts, uncheckedBoletoIds]);

  const totalAtualizado = selectedBoletos.reduce((s, b) => s + b.valor_atualizado, 0);
  const selectionKey = useMemo(() => selectedBoletos.map((b) => b.id).sort().join(','), [selectedBoletos]);
  const soloContactId = selectedContacts.length === 1 ? selectedContacts[0].contact_id : null;

  // Mensagem é recalculada sempre que muda o conjunto de boletos marcados — modelo individual
  // (1 boleto) vira geral (2+) automaticamente, como pedido.
  useEffect(() => {
    setMensagem(buildCobrancaMensagem(selectedBoletos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // Pré-preenche destino quando sobra 1 cliente só — continua editável pra qualquer caso.
  useEffect(() => {
    if (selectedContacts.length === 1) {
      const c = selectedContacts[0];
      setDestinoWhats(c.whatsapp_cobranca || c.whatsapp || c.phone || '');
      setDestinoEmail(c.email_cobranca || c.email || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloContactId]);

  const toggleContact = (contactId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const removeContact = (contactId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      next.delete(contactId);
      return next;
    });
  };

  const toggleBoleto = (boletoId: string) => {
    setUncheckedBoletoIds((prev) => {
      const next = new Set(prev);
      if (next.has(boletoId)) next.delete(boletoId);
      else next.add(boletoId);
      return next;
    });
  };

  // PNG (não JPEG) porque é o único formato que a Clipboard API aceita de forma confiável pra
  // ClipboardItem em Chrome/Edge. Retorna a Promise sem esperar (nunca "await" isso antes de
  // chamar clipboard.write) — o html2canvas demora o suficiente pra estourar a janela de
  // "ativação transitória" do clique, e depois disso o Chrome recusa o write em silêncio (foi
  // o que causava só o texto ir, sem imagem). O jeito certo é passar a Promise direto como
  // valor do ClipboardItem: a API espera ela resolver por dentro, mas ainda conta como
  // originada do clique.
  const gerarPrintBlobPromise = (): Promise<Blob> => {
    const el = reciboRef.current;
    if (!el) return Promise.reject(new Error('Preview da cobrança não está pronto.'));
    return import('html2canvas')
      .then((mod) => mod.default(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }))
      .then((canvas) => new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png');
      }));
  };

  const baixarBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cobranca-${format(new Date(), 'yyyy-MM-dd')}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const suportaClipboardImagem = () => !!(navigator.clipboard && typeof ClipboardItem !== 'undefined' && reciboRef.current);

  // Testado na prática (22/09): quando texto e imagem estão juntos na área de transferência, o
  // WhatsApp sempre prioriza a imagem e descarta o texto — não dá pra combinar os dois num
  // Ctrl+V só. Fluxo em 2 passos: botão WhatsApp copia a imagem e abre a conversa (Ctrl+V lá
  // anexa a imagem, com legenda vazia); "Copiar" copia só o texto, pra colar (Ctrl+V) direto
  // na legenda da imagem que já está anexada.
  const handleCopiar = () => {
    if (selectedBoletos.length === 0) { toast.error('Selecione ao menos um boleto.'); return; }
    const boletoIds = selectedBoletos.map((b) => b.id);
    const msg = mensagem;
    navigator.clipboard.writeText(msg).then(() => toast.success('Mensagem copiada.'));
    registrarLocal.mutate({ boleto_ids: boletoIds, canal: 'copiar', mensagem: msg });
  };

  const handleWhatsapp = () => {
    if (selectedBoletos.length === 0) { toast.error('Selecione ao menos um boleto.'); return; }
    if (!destinoWhats.trim()) { toast.error('Informe o WhatsApp de destino.'); return; }
    setGerandoPrint(true);
    const boletoIds = selectedBoletos.map((b) => b.id);
    const msg = mensagem;
    const destino = destinoWhats;
    const numero = destino.replace(/\D/g, '');
    // Sem "text=" de propósito — o texto agora entra pelo botão "Copiar", colado direto na
    // legenda da imagem depois que ela for anexada aqui (ver comentário em handleCopiar).
    // web.whatsapp.com em vez de wa.me — o wa.me entrega esse link pro app Desktop, cujo
    // parser de URL corrompe emoji fora do plano básico (🗓️, 💰) mesmo com o texto chegando
    // corretamente codificado (round-trip de encodeURIComponent/decodeURIComponent confere).
    const whatsappUrl = `https://web.whatsapp.com/send?phone=55${numero}`;

    const abrirEFinalizar = (imagemCopiada: boolean) => {
      window.open(whatsappUrl, '_blank');
      registrarLocal.mutate({ boleto_ids: boletoIds, canal: 'whatsapp', destino, mensagem: msg });
      toast.success(
        imagemCopiada
          ? 'Imagem copiada — na conversa que abriu, dá um Ctrl+V pra anexar. Depois usa o "Copiar" pra colar o texto na legenda.'
          : 'WhatsApp aberto — não deu pra copiar a imagem automaticamente aqui, baixei o arquivo pra anexar manualmente.',
      );
      setGerandoPrint(false);
    };

    if (suportaClipboardImagem()) {
      const printPromise = gerarPrintBlobPromise();
      navigator.clipboard.write([new ClipboardItem({ 'image/png': printPromise })])
        .then(() => abrirEFinalizar(true))
        .catch(() => {
          printPromise.then(baixarBlob).catch(() => {}).finally(() => abrirEFinalizar(false));
        });
    } else if (reciboRef.current) {
      gerarPrintBlobPromise().then(baixarBlob).catch(() => {}).finally(() => abrirEFinalizar(false));
    } else {
      abrirEFinalizar(false);
    }
  };

  const handleEmail = async () => {
    if (selectedBoletos.length === 0) { toast.error('Selecione ao menos um boleto.'); return; }
    if (!destinoEmail.trim()) { toast.error('Informe o e-mail de destino.'); return; }
    setEnviandoEmail(true);
    try {
      const assunto = selectedBoletos.length === 1
        ? `Cobrança — vencimento em ${fmtDateCobranca(selectedBoletos[0].data_vencimento)}`
        : 'Cobrança — boletos em aberto';
      await enviarEmailMultiplo.mutateAsync({
        boleto_ids: selectedBoletos.map((b) => b.id),
        destino: destinoEmail.trim(),
        assunto,
        mensagem,
      });
      toast.success('E-mail enviado.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar e-mail.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Busca multi-seleção de clientes com boleto vencido */}
        <div className="space-y-2">
          <Label className="text-ink">Clientes com boleto vencido</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full max-w-md justify-between font-normal">
                <span className={cn('truncate', selectedContactIds.size === 0 && 'text-muted-foreground')}>
                  {selectedContactIds.size === 0
                    ? 'Buscar cliente…'
                    : `${selectedContactIds.size} cliente${selectedContactIds.size === 1 ? '' : 's'} selecionado${selectedContactIds.size === 1 ? '' : 's'}`}
                </span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] max-w-md p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar cliente…" className="h-9" />
                <CommandList>
                  <CommandEmpty>Nenhum cliente com boleto vencido encontrado.</CommandEmpty>
                  <CommandGroup>
                    {contacts.map((c) => {
                      const checked = selectedContactIds.has(c.contact_id);
                      return (
                        <CommandItem key={c.contact_id} value={`${c.name} ${c.document ?? ''}`} onSelect={() => toggleContact(c.contact_id)}>
                          <Check className={cn('mr-2 h-4 w-4', checked ? 'opacity-100' : 'opacity-0')} />
                          <span className="truncate flex-1">{c.name}</span>
                          <span className="ml-2 shrink-0 text-xs text-muted-ink-2">
                            {c.boletos.length} boleto{c.boletos.length === 1 ? '' : 's'}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedContacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedContacts.map((c) => (
                <Badge key={c.contact_id} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5">
                  <span className="text-xs">{c.name}</span>
                  <button type="button" onClick={() => removeContact(c.contact_id)} className="rounded-full p-0.5 hover:bg-muted-foreground/10" aria-label={`Remover ${c.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Boletos dos clientes selecionados, com marcar/desmarcar */}
        {selectedContacts.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-bg-2 text-left text-meta text-muted-ink">
                <tr>
                  <th className="w-9 px-3 py-2"></th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Valor original</th>
                  <th className="px-3 py-2">Vencimento</th>
                  <th className="px-3 py-2">Dias atraso</th>
                  <th className="px-3 py-2">Juros</th>
                  <th className="px-3 py-2">Multa</th>
                  <th className="px-3 py-2">Valor atualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {selectedContacts.map((c) => c.boletos.map((b) => {
                  const checked = !uncheckedBoletoIds.has(b.id);
                  return (
                    <tr key={b.id} className={cn(!checked && 'opacity-40')}>
                      <td className="px-3 py-2">
                        <Checkbox checked={checked} onCheckedChange={() => toggleBoleto(b.id)} />
                      </td>
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2">{fmtBRL(b.valor)}</td>
                      <td className="px-3 py-2">{fmtDateCobranca(b.data_vencimento)}</td>
                      <td className="px-3 py-2">{b.dias_atraso}</td>
                      <td className="px-3 py-2">{b.encargos_disponiveis ? fmtBRL(b.juros_valor) : '—'}</td>
                      <td className="px-3 py-2">{b.encargos_disponiveis ? fmtBRL(b.multa_valor) : '—'}</td>
                      <td className="px-3 py-2 font-medium">{fmtBRL(b.valor_atualizado)}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-line bg-bg-2 px-3 py-2 text-sm">
              <span className="text-muted-ink">
                {selectedBoletos.length} boleto{selectedBoletos.length === 1 ? '' : 's'} selecionado{selectedBoletos.length === 1 ? '' : 's'}
              </span>
              <span className="font-medium">Total: {fmtBRL(totalAtualizado)}</span>
            </div>
          </div>
        )}

        {selectedContacts.some((c) => c.boletos.some((b) => !b.encargos_disponiveis)) && (
          <p className="text-xs text-warn">
            Um ou mais boletos selecionados não têm multa/juros registrados no Sicoob — o valor atualizado deles considera só o valor original.
          </p>
        )}

        {/* Destino + mensagem + ações */}
        {selectedContacts.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-ink">WhatsApp de destino</Label>
                <Input value={destinoWhats} onChange={(e) => setDestinoWhats(e.target.value)} placeholder="DDD + número" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-ink">E-mail de destino</Label>
                <Input value={destinoEmail} onChange={(e) => setDestinoEmail(e.target.value)} placeholder="email@cliente.com.br" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-ink">Mensagem</Label>
              <Textarea rows={9} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="font-mono text-[13px]" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="gap-1.5" onClick={handleCopiar}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={handleWhatsapp} disabled={gerandoPrint}>
                {gerandoPrint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                WhatsApp
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={handleEmail} disabled={enviandoEmail}>
                {enviandoEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                E-mail
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Preview do print — mesmo conteúdo que vai pra imagem copiada ao clicar em WhatsApp */}
      {selectedBoletos.length > 0 && (
        <div className="space-y-2">
          <Label className="text-ink">Preview da cobrança</Label>
          <div className="flex justify-center rounded-lg border border-line bg-bg-2 p-4">
            <ReciboPreview ref={reciboRef} contacts={selectedContacts} boletos={selectedBoletos} total={totalAtualizado} />
          </div>
        </div>
      )}
    </div>
  );
}

const ReciboPreview = forwardRef<HTMLDivElement, {
  contacts: CobrancaContact[];
  boletos: SelectedBoleto[];
  total: number;
}>(function ReciboPreview({ contacts, boletos, total }, ref) {
  const nomes = contacts.map((c) => c.name).join(', ');
  const unico = boletos.length === 1;
  const hoje = format(new Date(), 'dd/MM/yyyy');

  return (
    <div ref={ref} className="mx-auto w-[560px] bg-white p-6 text-[#111]" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="mb-4 flex items-center justify-center">
        <img src="/logo-azul.png" alt="Contabilidade Alves" className="h-10 w-auto" crossOrigin="anonymous" />
      </div>
      <p className="mb-3 text-[13px]">
        Nosso setor financeiro não identificou a quitação {unico ? 'do boleto' : 'dos boletos'} abaixo:
      </p>
      <p className="mb-3 text-[13px]"><strong>{contacts.length === 1 ? 'Empresa' : 'Empresas'}:</strong> {nomes}</p>

      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[#111]">
            <th className="py-1 text-left font-semibold">Valor</th>
            <th className="py-1 text-left font-semibold">Vencimento</th>
            <th className="py-1 text-left font-semibold">Dias atraso</th>
            <th className="py-1 text-right font-semibold">Juros</th>
            <th className="py-1 text-right font-semibold">Multa</th>
            <th className="py-1 text-right font-semibold">Vr. Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {boletos.map((b) => (
            <tr key={b.id}>
              <td className="py-1">{fmtBRL(b.valor)}</td>
              <td className="py-1">{fmtDateCobranca(b.data_vencimento)}</td>
              <td className="py-1">{b.dias_atraso}</td>
              <td className="py-1 text-right">{b.encargos_disponiveis ? fmtBRL(b.juros_valor) : '—'}</td>
              <td className="py-1 text-right">{b.encargos_disponiveis ? fmtBRL(b.multa_valor) : '—'}</td>
              <td className="py-1 text-right">{fmtBRL(b.valor_atualizado)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex justify-between border-t border-[#111] pt-1 text-[13px] font-semibold">
        <span>Total</span>
        <span>{fmtBRL(total)}</span>
      </div>

      <p className="mt-4 text-[12px]">
        {unico && boletos[0].url_qrcode ? (
          <><strong>Pix copia e cola:</strong> {boletos[0].url_qrcode}</>
        ) : (
          <><strong>Dados para o Pix (CNPJ):</strong> {PIX_KEY_CNPJ}</>
        )}
      </p>

      <p className="mt-3 text-[11px] text-[#444]">Caso o pagamento já tenha sido efetuado, favor desconsiderar esta mensagem.</p>
      <p className="mt-1 text-[11px] text-[#444]">Qualquer dúvida, estamos à disposição.</p>

      <div className="mt-4 flex items-end justify-between text-[12px]">
        <span>Juatuba</span>
        <span>{hoje}</span>
      </div>

      <div className="mt-4 text-center text-[12px]">
        <p>Contabilidade Alves</p>
        <p>José Geraldo Alves</p>
        <p>CRC/MG 064187</p>
      </div>
    </div>
  );
});
