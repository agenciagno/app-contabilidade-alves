import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Check, Copy, ExternalLink, FileDown, FileText, Link2, ListPlus, Loader2, MessageCircle, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { DsAlert, DsBadge } from '@/components/ds';
import { Contact } from '@/hooks/useContacts';
import { DocumentoCliente, urlDoLink, useLinkCliente } from '@/hooks/useLinkCliente';
import { linkWhatsapp } from '@/hooks/useInteressados';
import { getContactDisplayName } from '@/lib/contact-display';
import { useOnboardingCadastro } from '@/hooks/useOnboardingCadastro';
import { cn } from '@/lib/utils';
import { useTextosOnboarding } from '@/hooks/useOnboardingConteudo';
import { baixarPdf, carregarLogo, gerarPdfDocumentos } from '@/lib/pdfRelatorios';
import { MensagemLinkCliente } from './MensagemLinkCliente';

const STATUS: Record<DocumentoCliente['status'], { rotulo: string; tom: 'neutral' | 'info' | 'ok' | 'warn' }> = {
  pendente: { rotulo: 'Falta enviar', tom: 'warn' },
  enviado: { rotulo: 'Enviado, conferir', tom: 'info' },
  aprovado: { rotulo: 'Recebido', tom: 'ok' },
  dispensado: { rotulo: 'Dispensado', tom: 'neutral' },
};

/**
 * Sub-aba "Link do cliente" do Super Perfil (17/10/2026): gera o link público com a lista de documentos, manda pelo WhatsApp,
 * acompanha o que chegou (baixar, aprovar, pedir de novo, dispensar) e libera as boas-vindas quando o cadastro estiver pronto.
 */
export function ClienteLinkTab({ contact }: { contact: Contact }) {
  const { link, documentos, isLoading, gerar, incluirListaPadrao, atualizarLink, atualizarDocumento, adicionarDocumento, baixar } = useLinkCliente(contact.id);
  // Cliente cadastrado pelo assistente = cliente novo (pede documentos). Cadastro antigo = já é da CA (só boas-vindas). Dá para trocar.
  const { temOnboarding, isLoading: carregandoOnboarding } = useOnboardingCadastro(contact.id);
  const [modoEscolhido, setModoEscolhido] = useState<'documentos' | 'boas_vindas' | null>(null);
  const modo = modoEscolhido ?? (temOnboarding ? 'documentos' : 'boas_vindas');
  const [temFuncionarios, setTemFuncionarios] = useState(false);
  const { textos } = useTextosOnboarding();
  const texto = (chave: string) => textos.find(t => t.chave === chave)?.conteudo ?? '';
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [novoDoc, setNovoDoc] = useState('');
  const fluxo = contact.tipo_cliente === 'Em processo de abertura' ? 'abertura' : 'cnpj_existente';
  const nome = getContactDisplayName(contact);

  if (isLoading || carregandoOnboarding) return <Skeleton className="h-64 w-full" />;

  if (!link) {
    const Opcao = ({ valor, titulo, texto }: { valor: 'documentos' | 'boas_vindas'; titulo: string; texto: string }) => (
      <button
        type="button"
        onClick={() => setModoEscolhido(valor)}
        aria-pressed={modo === valor}
        className={cn(
          'flex-1 rounded-lg border p-3 text-left transition-colors',
          modo === valor ? 'border-action bg-action-tint' : 'border-line bg-paper hover:border-action',
        )}
      >
        <span className="block text-[14px] font-semibold text-ink">{titulo}</span>
        <span className="block text-[13px] text-muted-ink">{texto}</span>
      </button>
    );
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Link do cliente</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[14px] text-ink">
            Um link só deste cliente. Pode levar a lista de documentos para ele enviar pelo celular e, depois, as boas-vindas:
            quem cuida da empresa, impostos do regime, o que ele recebe todo mês e o honorário.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Opcao valor="documentos" titulo="Cliente novo" texto="Lista de documentos agora; boas-vindas quando o cadastro estiver pronto." />
            <Opcao valor="boas_vindas" titulo="Já é nosso cliente" texto="Só as boas-vindas, sem pedir documentos. Já abre liberado." />
          </div>

          {modo === 'documentos' ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted-ink">Lista usada:</span>
                <DsBadge tone={fluxo === 'abertura' ? 'warn' : 'info'}>{fluxo === 'abertura' ? 'Abertura de empresa' : 'Cliente com CNPJ'}</DsBadge>
                {contact.tax_regime && <span className="text-muted-ink">· filtrada pelo regime do cadastro</span>}
              </div>
              <label className="flex max-w-md items-center justify-between gap-3 rounded-md border border-line p-3 text-[14px]">
                <span>A empresa tem funcionários?</span>
                <Switch checked={temFuncionarios} onCheckedChange={setTemFuncionarios} />
              </label>
            </>
          ) : (
            <p className="text-[13px] text-muted-ink">
              Confira antes regime, responsáveis, tarefas e honorário no cadastro: é deles que a página monta o resumo.
              Se depois precisar pedir documentos, dá para incluir a lista no mesmo link.
            </p>
          )}

          <Button
            className="gap-2" disabled={gerar.isPending}
            onClick={() => gerar.mutate({ temFuncionarios, fluxo, regime: contact.tax_regime, soBoasVindas: modo === 'boas_vindas' })}
          >
            {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {modo === 'documentos' ? 'Gerar link e lista de documentos' : 'Gerar link de boas-vindas'}
          </Button>
          <p className="text-meta text-muted-ink">A lista padrão e os textos são editados em Tech → Onboarding.</p>
        </CardContent>
      </Card>
    );
  }

  const url = urlDoLink(link.token);
  const ativos = documentos.filter(d => d.status !== 'dispensado');
  const recebidos = ativos.filter(d => d.status === 'enviado' || d.status === 'aprovado').length;
  const conferir = documentos.filter(d => d.status === 'enviado').length;
  const pendentes = ativos.filter(d => d.status === 'pendente');
  const cobrar = linkWhatsapp(contact.whatsapp || contact.phone,
    `Olá, ${nome}! Ainda faltam alguns documentos: ${pendentes.map(d => d.titulo).join('; ')}. Pode enviar por aqui: ${url}`);

  const baixarPdfDocumentos = async () => {
    setGerandoPdf(true);
    try {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const bytes = await gerarPdfDocumentos({
        cliente: nome,
        abertura: fluxo === 'abertura',
        documentos: ativos.map(d => ({ titulo: d.titulo, descricao: d.descricao })),
        // O texto da página fala em "botão ao lado"; no papel a orientação é outra.
        intro: link.revogado_em
          ? 'Separe os documentos abaixo e envie para a Contabilidade Alves: pode ser foto tirada pelo celular ou PDF.'
          : 'Separe os documentos abaixo e envie pelo link no fim desta página: pode ser foto tirada pelo celular ou PDF. Marque cada item conforme for enviando.',
        link: link.revogado_em ? null : url,
        prazo: link.prazo_envio,
        contato: texto('contato_escritorio'),
      }, hoje, await carregarLogo());
      const arquivo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      baixarPdf(bytes, `documentos-${arquivo || 'cliente'}.pdf`);
    } catch (e) {
      toast.error('Não foi possível gerar o PDF', { description: (e as Error)?.message });
    } finally {
      setGerandoPdf(false);
    }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copiado'); } catch { toast.error('Não foi possível copiar'); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Link do cliente</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {link.revogado_em ? (
            <DsAlert
              tone="warn" title="Link desativado"
              description={`Desativado em ${format(parseISO(link.revogado_em), 'dd/MM/yyyy')}. O cliente vê uma mensagem de link inválido.`}
              action={<Button size="sm" onClick={() => atualizarLink.mutate({ trocarToken: true }, { onSuccess: () => toast.success('Novo link gerado') })}>Gerar novo link</Button>}
            />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Input readOnly value={url} className="min-w-[260px] flex-1 font-mono text-[13px]" onFocus={e => e.currentTarget.select()} />
                <Button variant="outline" className="gap-1.5" onClick={copiar}><Copy className="h-4 w-4" /> Copiar</Button>
                <Button variant="outline" className="gap-1.5" onClick={() => window.open(url, '_blank', 'noopener')}><ExternalLink className="h-4 w-4" /> Abrir</Button>
                {ativos.length > 0 && (
                  <Button variant="outline" className="gap-1.5" disabled={gerandoPdf} onClick={baixarPdfDocumentos}>
                    {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Baixar PDF da lista
                  </Button>
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {documentos.length > 0 && (
            <div className="space-y-1.5">
              <Label>Prazo para enviar documentos</Label>
              <Input
                type="date" value={link.prazo_envio || ''}
                onChange={e => atualizarLink.mutate({ prazo_envio: e.target.value || null })}
              />
              <p className="text-meta text-muted-ink">Depois do prazo o cliente ainda vê a página, mas não envia arquivos.</p>
            </div>
            )}
            <label className="flex items-start justify-between gap-3 rounded-md border border-line p-3">
              <span className="space-y-0.5">
                <span className="block text-[14px] font-medium text-ink">Mostrar boas-vindas ao cliente</span>
                <span className="block text-meta text-muted-ink">Libere quando regime, responsáveis, tarefas e honorário estiverem no cadastro.</span>
              </span>
              <Switch
                checked={link.boas_vindas_liberada}
                onCheckedChange={v => atualizarLink.mutate({ boas_vindas_liberada: v }, { onSuccess: () => toast.success(v ? 'Boas-vindas liberadas' : 'Boas-vindas escondidas') })}
              />
            </label>
          </div>

          {!link.revogado_em && (
            <div className="flex flex-wrap gap-3 text-[13px]">
              <button type="button" className="font-semibold text-muted-ink hover:text-ink" onClick={() => window.confirm('Gerar um link novo? O link antigo para de funcionar.') && atualizarLink.mutate({ trocarToken: true }, { onSuccess: () => toast.success('Novo link gerado') })}>
                Gerar link novo
              </button>
              <button type="button" className="font-semibold text-danger hover:opacity-80" onClick={() => window.confirm('Desativar o link? O cliente não consegue mais abrir.') && atualizarLink.mutate({ revogar: true })}>
                Desativar link
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {!link.revogado_em && (
        <MensagemLinkCliente
          contactId={contact.id}
          nome={nome}
          email={contact.email}
          link={link}
          url={url}
          temDocumentosPendentes={pendentes.length > 0}
          modeloAssunto={texto('msg_link_assunto') || 'Contabilidade Alves'}
          modeloTexto={texto(pendentes.length > 0 ? 'msg_link_novo' : 'msg_link_boas_vindas')}
          salvando={atualizarLink.isPending}
          onSalvar={campos => atualizarLink.mutate(campos, {
            onSuccess: () => toast.success(campos.mensagem_texto === null ? 'Voltou ao modelo padrão' : 'Mensagem salva para este cliente'),
          })}
        />
      )}

      {documentos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium text-ink">Este link não pede documentos</p>
              <p className="text-meta text-muted-ink">O cliente vê só as boas-vindas. Precisa de algum documento? Inclua a lista ou um item avulso.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[13px]">
                <Switch checked={temFuncionarios} onCheckedChange={setTemFuncionarios} /> Tem funcionários
              </label>
              <Button
                variant="outline" size="sm" className="gap-1.5" disabled={incluirListaPadrao.isPending}
                onClick={() => incluirListaPadrao.mutate({ temFuncionarios, fluxo, regime: contact.tax_regime })}
              >
                {incluirListaPadrao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
                Incluir lista padrão
              </Button>
            </div>
            <div className="flex w-full gap-2">
              <Input value={novoDoc} onChange={e => setNovoDoc(e.target.value)} placeholder="Ou pedir um documento só para este cliente" />
              <Button
                variant="outline" className="gap-1.5" disabled={!novoDoc.trim() || adicionarDocumento.isPending}
                onClick={() => adicionarDocumento.mutate({ titulo: novoDoc.trim() }, { onSuccess: () => setNovoDoc('') })}
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Documentos · {recebidos} de {ativos.length} recebidos{conferir > 0 ? ` · ${conferir} para conferir` : ''}</CardTitle>
          {pendentes.length > 0 && cobrar && !link.revogado_em && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(cobrar, '_blank', 'noopener')}>
              <MessageCircle className="h-4 w-4" /> Cobrar pendentes
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
            <div className="h-full rounded-full bg-action" style={{ width: `${ativos.length ? (recebidos / ativos.length) * 100 : 0}%` }} />
          </div>
          <ul className="divide-y divide-line">
            {documentos.map(d => (
              <li key={d.id} className={`flex flex-wrap items-start gap-3 py-3 ${d.status === 'dispensado' ? 'opacity-60' : ''}`}>
                <div className="min-w-[220px] flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-medium text-ink">{d.titulo}</p>
                    <DsBadge tone={STATUS[d.status].tom}>{STATUS[d.status].rotulo}</DsBadge>
                  </div>
                  {d.descricao && <p className="text-[13px] text-muted-ink">{d.descricao}</p>}
                  {d.observacao && d.status === 'pendente' && <p className="text-[13px] text-warn">Pedido de novo: {d.observacao}</p>}
                  {d.arquivos.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {d.arquivos.map(a => (
                        <button key={a.id} type="button" onClick={() => baixar(a)} className="flex items-center gap-1 rounded border border-line px-2 py-0.5 text-[12px] text-action hover:bg-action-tint" title={`Enviado em ${format(parseISO(a.enviado_em), 'dd/MM/yyyy HH:mm')}`}>
                          <FileDown className="h-3.5 w-3.5" /> {a.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {d.status === 'enviado' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => atualizarDocumento.mutate({ id: d.id, status: 'aprovado' })}>
                      <Check className="h-4 w-4" /> Aprovar
                    </Button>
                  )}
                  {(d.status === 'enviado' || d.status === 'aprovado') && (
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => {
                      const motivo = window.prompt('O que precisa ser enviado de novo? (o cliente vê esta frase)');
                      if (motivo !== null) atualizarDocumento.mutate({ id: d.id, status: 'pendente', observacao: motivo.trim() || 'Envie de novo, por favor.' });
                    }}>
                      <RotateCcw className="h-4 w-4" /> Pedir de novo
                    </Button>
                  )}
                  {d.status === 'pendente' && (
                    <Button size="sm" variant="ghost" onClick={() => atualizarDocumento.mutate({ id: d.id, status: 'dispensado' })}>Dispensar</Button>
                  )}
                  {d.status === 'dispensado' && (
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => atualizarDocumento.mutate({ id: d.id, status: 'pendente', observacao: null })}>
                      <Undo2 className="h-4 w-4" /> Voltar a pedir
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t border-line pt-3">
            <Input value={novoDoc} onChange={e => setNovoDoc(e.target.value)} placeholder="Pedir outro documento só para este cliente" />
            <Button
              variant="outline" className="gap-1.5" disabled={!novoDoc.trim() || adicionarDocumento.isPending}
              onClick={() => adicionarDocumento.mutate({ titulo: novoDoc.trim() }, { onSuccess: () => setNovoDoc('') })}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
