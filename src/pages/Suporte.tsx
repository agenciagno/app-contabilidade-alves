import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Wrench, Receipt, AtSign, MessageCircle, Loader2, Paperclip, X, Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import {
  useCreateTicket, useMyOpenTickets, useWhatsappChannels, type TicketCategory,
} from '@/hooks/useSupportTickets';
import { PageHeader, tabsListClass, tabsTriggerClass } from '@/components/ds';

const CATEGORIAS: { value: TicketCategory; label: string; description: string; icon: typeof Wrench }[] = [
  {
    value: 'tecnico',
    label: 'Suporte Técnico',
    description: 'Erros, travamentos ou dúvida de uso do sistema.',
    icon: Wrench,
  },
  {
    value: 'financeiro',
    label: 'Financeiro',
    description: 'Fatura, cobrança ou plano contratado.',
    icon: Receipt,
  },
  {
    value: 'email',
    label: 'Alteração de E-mail',
    description: 'Trocar o e-mail de acesso da sua conta.',
    icon: AtSign,
  },
];

const CATEGORIA_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label])) as Record<TicketCategory, string>;

export default function Suporte() {
  const { user } = useAuth();
  const { companyName } = useCompany();

  const { data: tickets } = useMyOpenTickets();
  const { data: canais } = useWhatsappChannels();
  const criarTicket = useCreateTicket();

  const [categoriaAberta, setCategoriaAberta] = useState<TicketCategory | null>(null);
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);

  const resetForm = () => {
    setAssunto('');
    setDescricao('');
    setArquivos([]);
  };

  const abrirCategoria = (cat: TicketCategory) => {
    resetForm();
    setCategoriaAberta(cat);
  };

  const adicionarArquivos = (fileList: FileList | null) => {
    if (!fileList) return;
    const novos = Array.from(fileList).filter((f) => f.size <= 5 * 1024 * 1024);
    if (novos.length < fileList.length) {
      toast.error('Arquivos acima de 5MB foram ignorados.');
    }
    setArquivos((prev) => [...prev, ...novos].slice(0, 5));
  };

  const enviarChamado = async () => {
    if (!categoriaAberta) return;
    if (assunto.trim().length < 3) {
      toast.error('Informe o assunto.');
      return;
    }
    if (descricao.trim().length < 10) {
      toast.error('Descreva o problema com pelo menos 10 caracteres.');
      return;
    }
    try {
      await criarTicket.mutateAsync({
        category: categoriaAberta,
        assunto: assunto.trim(),
        descricao: descricao.trim(),
        files: arquivos,
      });
      toast.success('Chamado registrado! Nossa equipe já foi avisada.');
      setCategoriaAberta(null);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao abrir chamado.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/suporte"
        title="Como podemos ajudar?"
        subtitle="Fale com a gente quando precisar."
      />

      <Tabs defaultValue="inicio">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="inicio" className={tabsTriggerClass}>Início</TabsTrigger>
          <TabsTrigger value="chamados" className={tabsTriggerClass}>Meus chamados</TabsTrigger>
          <TabsTrigger value="bug" className={tabsTriggerClass}>Reportar bug</TabsTrigger>
          <TabsTrigger value="ajuda" className={tabsTriggerClass}>Central de ajuda</TabsTrigger>
        </TabsList>

        <TabsContent value="inicio" className="mt-4 max-w-3xl space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {CATEGORIAS.map((cat) => (
              <button key={cat.value} type="button" onClick={() => abrirCategoria(cat.value)} className="text-left">
                <Card className="h-full cursor-pointer border-border/50 bg-card transition-colors hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <cat.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{cat.label}</CardTitle>
                        <CardDescription>{cat.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </button>
            ))}
          </div>

          {(tickets ?? []).length > 0 && (
            <Card className="border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="text-base">Chamados em atendimento</CardTitle>
                <CardDescription>
                  {tickets!.length} chamado{tickets!.length === 1 ? '' : 's'} em aberto
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {tickets!.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{t.assunto}</p>
                      <p className="text-xs text-muted-foreground">
                        {CATEGORIA_LABEL[t.category]} · aberto{' '}
                        {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {t.status === 'em_atendimento' ? 'Em atendimento' : 'Aberto'}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(canais ?? []).length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {canais!.map((c) => (
                <a
                  key={c.id}
                  href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Card className="h-full border-border/50 bg-card transition-colors hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-ok-soft p-2">
                          <MessageCircle className="h-4 w-4 text-ok" />
                        </div>
                        <CardTitle className="text-sm">{c.label}</CardTitle>
                      </div>
                    </CardHeader>
                  </Card>
                </a>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chamados" className="mt-4">
          <EmBreve titulo="Meus chamados" />
        </TabsContent>
        <TabsContent value="bug" className="mt-4">
          <EmBreve titulo="Reportar bug" />
        </TabsContent>
        <TabsContent value="ajuda" className="mt-4">
          <EmBreve titulo="Central de ajuda" />
        </TabsContent>
      </Tabs>

      <Dialog open={!!categoriaAberta} onOpenChange={(o) => { if (!o) { setCategoriaAberta(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              Abrir chamado — {categoriaAberta ? CATEGORIA_LABEL[categoriaAberta] : ''}
            </DialogTitle>
            <DialogDescription>
              {companyName} · {user?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ticket-assunto">Assunto *</Label>
              <Input
                id="ticket-assunto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Resuma o problema em poucas palavras"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-descricao">Descrição *</Label>
              <Textarea
                id="ticket-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Explique o que está acontecendo. Quanto mais contexto, mais rápido resolvemos."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">{descricao.length} caracteres · mínimo 10</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-anexos">Anexos</Label>
              <label
                htmlFor="ticket-anexos"
                className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground hover:border-primary/50"
              >
                <Paperclip className="h-4 w-4" />
                PDF, JPG, PNG · até 5MB cada · máx. 5 arquivos
              </label>
              <input
                id="ticket-anexos"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => { adicionarArquivos(e.target.files); e.target.value = ''; }}
              />
              {arquivos.length > 0 && (
                <ul className="space-y-1">
                  {arquivos.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setArquivos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCategoriaAberta(null); resetForm(); }} disabled={criarTicket.isPending}>
              Cancelar
            </Button>
            <Button onClick={enviarChamado} disabled={criarTicket.isPending}>
              {criarTicket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar chamado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmBreve({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
      <Clock className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{titulo}</p>
      <p className="text-sm text-muted-foreground">Em breve.</p>
    </div>
  );
}
