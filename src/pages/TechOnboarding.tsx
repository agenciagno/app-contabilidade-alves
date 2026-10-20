import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DsAlert, DsBadge, PageHeader, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { useUserRole } from '@/hooks/useUserRole';
import { TAX_REGIMES } from '@/constants/taxRegimes';
import { DocumentoModelo, FluxoDocumento, TextoOnboarding, useDocumentosModelo, useTextosOnboarding } from '@/hooks/useOnboardingConteudo';

const REGIMES = TAX_REGIMES.filter(r => r.value !== 'nao_aplica');
const rotuloRegime = (v: string) => REGIMES.find(r => r.value === v)?.label ?? v;
const FLUXOS: { valor: FluxoDocumento; titulo: string; ajuda: string }[] = [
  { valor: 'cnpj_existente', titulo: 'Cliente com CNPJ', ajuda: 'Troca de contador ou empresa já aberta.' },
  { valor: 'abertura', titulo: 'Abertura de empresa', ajuda: 'Cliente que ainda vai abrir a empresa.' },
];

type Edicao = Partial<DocumentoModelo> & { fluxo: FluxoDocumento };

function ItemDialog({ item, onClose, onSalvar, salvando }: {
  item: Edicao | null;
  onClose: () => void;
  onSalvar: (m: Edicao & { titulo: string }) => void;
  salvando: boolean;
}) {
  const [f, setF] = useState<Edicao | null>(item);
  useEffect(() => setF(item), [item]);
  if (!f) return null;
  const regimes = f.regimes ?? [];
  const alternarRegime = (v: string) => setF({ ...f, regimes: regimes.includes(v) ? regimes.filter(r => r !== v) : [...regimes, v] });
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{f.id ? 'Editar documento' : 'Novo documento'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Documento *</Label>
            <Input value={f.titulo || ''} onChange={e => setF({ ...f, titulo: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Explicação para o cliente</Label>
            <Textarea rows={2} value={f.descricao || ''} onChange={e => setF({ ...f, descricao: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Pedir só para estes regimes</Label>
            <p className="text-meta text-muted-ink">Nenhum marcado = todos os regimes.</p>
            <div className="grid grid-cols-2 gap-2">
              {REGIMES.map(r => (
                <label key={r.value} className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={regimes.includes(r.value)} onCheckedChange={() => alternarRegime(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>Pedir só quando o cliente tem funcionários</span>
            <Switch checked={!!f.so_com_funcionarios} onCheckedChange={v => setF({ ...f, so_com_funcionarios: v })} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button
              disabled={!f.titulo?.trim() || salvando}
              onClick={() => onSalvar({ ...f, titulo: f.titulo!.trim(), descricao: f.descricao?.trim() || null, regimes: regimes.length ? regimes : null })}
              className="gap-2"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListaDocumentos() {
  const { modelos, salvar, trocarOrdem, apagar } = useDocumentosModelo();
  const [editando, setEditando] = useState<Edicao | null>(null);

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-ink">
        É a lista que o cliente recebe no link. Cada cliente ganha uma cópia quando o link é gerado: mudar aqui não altera links já enviados.
      </p>
      {FLUXOS.map(fl => {
        const itens = modelos.filter(m => m.fluxo === fl.valor);
        return (
          <section key={fl.valor} className="rounded-lg border border-line bg-paper">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{fl.titulo}</h2>
                <p className="text-meta text-muted-ink">{fl.ajuda}</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditando({ fluxo: fl.valor, ordem: (itens.at(-1)?.ordem ?? 0) + 1, ativo: true })}>
                <Plus className="h-4 w-4" /> Adicionar documento
              </Button>
            </header>
            <ul className="divide-y divide-line">
              {itens.map((m, idx) => (
                <li key={m.id} className={`flex items-start gap-3 p-3 ${m.ativo ? '' : 'opacity-60'}`}>
                  <div className="flex flex-col">
                    <button type="button" aria-label="Subir" disabled={idx === 0} onClick={() => trocarOrdem.mutate([m, itens[idx - 1]])} className="text-muted-ink hover:text-ink disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="Descer" disabled={idx === itens.length - 1} onClick={() => trocarOrdem.mutate([m, itens[idx + 1]])} className="text-muted-ink hover:text-ink disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[14px] font-medium text-ink">{m.titulo}</p>
                    {m.descricao && <p className="text-[13px] text-muted-ink">{m.descricao}</p>}
                    <div className="flex flex-wrap gap-1">
                      {m.regimes?.length ? m.regimes.map(r => <DsBadge key={r} tone="info" dot={false}>{rotuloRegime(r)}</DsBadge>) : <DsBadge tone="neutral" dot={false}>Todos os regimes</DsBadge>}
                      {m.so_com_funcionarios && <DsBadge tone="warn" dot={false}>Só com funcionários</DsBadge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={m.ativo} onCheckedChange={v => salvar.mutate({ id: m.id, fluxo: m.fluxo, titulo: m.titulo, ativo: v })} aria-label="Ativo" />
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditando(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => window.confirm(`Remover "${m.titulo}" da lista padrão?`) && apagar.mutate(m.id)}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                </li>
              ))}
              {itens.length === 0 && <li className="p-3 text-[13px] text-muted-ink">Nenhum documento.</li>}
            </ul>
          </section>
        );
      })}
      <ItemDialog
        item={editando}
        onClose={() => setEditando(null)}
        salvando={salvar.isPending}
        onSalvar={m => salvar.mutate(m, { onSuccess: () => setEditando(null) })}
      />
    </div>
  );
}

function EditorTexto({ texto, onSalvar, salvando }: { texto: TextoOnboarding; onSalvar: (conteudo: string) => void; salvando: boolean }) {
  const [valor, setValor] = useState(texto.conteudo);
  useEffect(() => setValor(texto.conteudo), [texto.conteudo]);
  const mudou = valor !== texto.conteudo;
  const temColchete = /\[[^\]]+\]/.test(valor);
  return (
    <div className="space-y-2 rounded-lg border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[14px] font-semibold text-ink">{texto.titulo}</Label>
        {temColchete && <DsBadge tone="warn">Falta preencher [ ]</DsBadge>}
      </div>
      <Textarea rows={3} value={valor} onChange={e => setValor(e.target.value)} />
      <div className="flex justify-end gap-2">
        {mudou && <Button variant="ghost" size="sm" onClick={() => setValor(texto.conteudo)}>Desfazer</Button>}
        <Button size="sm" disabled={!mudou || salvando} onClick={() => onSalvar(valor)}>Salvar</Button>
      </div>
    </div>
  );
}

function Textos() {
  const { textos, salvar } = useTextosOnboarding();
  const grupos = useMemo(() => ([
    { titulo: 'Antes · lista de documentos', itens: textos.filter(t => t.chave.startsWith('pre_')) },
    { titulo: 'Depois · boas-vindas', itens: textos.filter(t => t.chave.startsWith('pos_') || t.chave === 'contato_escritorio') },
    { titulo: 'Impostos por regime', itens: textos.filter(t => t.chave.startsWith('imposto_')) },
    { titulo: 'Reforma Tributária por regime', itens: textos.filter(t => t.chave.startsWith('rt_')) },
    { titulo: 'Mensagem de envio do link (e-mail e WhatsApp)', ajuda: '{nome}, {link} e {prazo} são trocados pelos dados do cliente. No Super Perfil dá para personalizar a mensagem só para um cliente.', itens: textos.filter(t => t.chave.startsWith('msg_')) },
  ]), [textos]);
  const pendentes = textos.filter(t => /\[[^\]]+\]/.test(t.conteudo)).length;
  return (
    <div className="space-y-5">
      {pendentes > 0 && (
        <DsAlert tone="warn" title={`${pendentes} texto(s) com campo entre colchetes`} description="Troque o que está entre [ ] (endereço, WhatsApp, dia do envio...) antes de liberar as boas-vindas para clientes." />
      )}
      {grupos.map(g => (
        <section key={g.titulo} className="space-y-2">
          <h2 className="text-[15px] font-semibold text-ink">{g.titulo}</h2>
          {'ajuda' in g && g.ajuda && <p className="text-[13px] text-muted-ink">{g.ajuda}</p>}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {g.itens.map(t => (
              <EditorTexto key={t.id} texto={t} salvando={salvar.isPending} onSalvar={conteudo => salvar.mutate({ id: t.id, conteudo })} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Tech → Onboarding (17/10/2026): Gabriel edita a lista de documentos pedida ao cliente novo (antes) e os textos da página de
 * boas-vindas (depois, por regime). Base criada com listas e textos padrão; só admin grava (RLS).
 */
export default function TechOnboarding() {
  const { isAdmin, isSuperAdmin } = useUserRole();
  return (
    <div className="space-y-6">
      <PageHeader kicker="~/tech · onboarding" title="Onboarding de clientes." subtitle="Lista de documentos e textos do link que o cliente novo recebe." />
      {!isAdmin && !isSuperAdmin && <DsAlert tone="info" title="Só administradores editam" description="Você pode ver, mas as mudanças são feitas por administradores." />}
      <Tabs defaultValue="documentos" className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="documentos" className={tabsTriggerClass}>Lista de documentos</TabsTrigger>
          <TabsTrigger value="textos" className={tabsTriggerClass}>Textos da página</TabsTrigger>
        </TabsList>
        <TabsContent value="documentos"><ListaDocumentos /></TabsContent>
        <TabsContent value="textos"><Textos /></TabsContent>
      </Tabs>
    </div>
  );
}
