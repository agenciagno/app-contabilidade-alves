import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, StatCardRow, SearchField, DsBadge } from '@/components/ds';
import { SearchableSelect } from '@/components/fiscal/SearchableSelect';
import {
  Send,
  MessageSquare,
  Mail,
  Users,
  Calendar as CalendarIcon,
  Clock,
  Smartphone,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Mock data for history table
const mockHistory = [
  {
    id: '1',
    date: '2024-12-18T14:30:00',
    channel: 'whatsapp',
    audience: 'Inadimplentes',
    contactsCount: 45,
    status: 'enviado',
  },
  {
    id: '2',
    date: '2024-12-17T10:00:00',
    channel: 'email',
    audience: 'Simples Nacional',
    contactsCount: 128,
    status: 'enviado',
  },
  {
    id: '3',
    date: '2024-12-16T16:45:00',
    channel: 'whatsapp',
    audience: 'Todos',
    contactsCount: 256,
    status: 'falhou',
  },
  {
    id: '4',
    date: '2024-12-20T09:00:00',
    channel: 'email',
    audience: 'Lucro Presumido',
    contactsCount: 32,
    status: 'pendente',
  },
];

const audienceOptions = [
  { value: 'todos', label: 'Todos os Clientes', count: 256 },
  { value: 'inadimplentes', label: 'Inadimplentes', count: 45 },
  { value: 'simples_nacional', label: 'Simples Nacional', count: 128 },
  { value: 'lucro_presumido', label: 'Lucro Presumido', count: 32 },
  { value: 'lucro_real', label: 'Lucro Real', count: 18 },
  { value: 'mei', label: 'MEI', count: 33 },
];

const variables = [
  { key: '{{nome_cliente}}', label: 'Nome do Cliente' },
  { key: '{{vencimento}}', label: 'Data de Vencimento' },
  { key: '{{valor_total}}', label: 'Valor Total' },
];

const channelOptions = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
];

const statusOptions = [
  { value: 'enviado', label: 'Enviado' },
  { value: 'pendente', label: 'Agendado' },
  { value: 'falhou', label: 'Falhou' },
];

const periodOptions = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'enviado':
      return <DsBadge tone="ok">enviado</DsBadge>;
    case 'pendente':
      return <DsBadge tone="warn">agendado</DsBadge>;
    case 'falhou':
      return <DsBadge tone="danger">falhou</DsBadge>;
    default:
      return null;
  }
};

const CrmDispatches = () => {
  const [channel, setChannel] = useState('whatsapp');
  const [audience, setAudience] = useState('todos');
  const [message, setMessage] = useState('Olá {{nome_cliente}}, sua fatura no valor de {{valor_total}} vence em {{vencimento}}. Entre em contato conosco para mais informações.');
  const [scheduleDate, setScheduleDate] = useState<Date>();
  const [composerOpen, setComposerOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');

  const historyRef = useRef<HTMLDivElement>(null);

  const selectedAudience = audienceOptions.find(a => a.value === audience);
  const contactCount = selectedAudience?.count || 0;

  const handleVariableClick = (variable: string) => {
    setMessage(prev => prev + ' ' + variable);
  };

  // Replace variables for preview
  const previewMessage = message
    .replace('{{nome_cliente}}', 'João Silva')
    .replace('{{vencimento}}', '20/12/2024')
    .replace('{{valor_total}}', 'R$ 2.500,00');

  // Indicadores derivados do mesmo histórico exibido na tabela — nada de números fora do dataset real.
  const totalDispatches = mockHistory.length;
  const totalReach = mockHistory.reduce((sum, item) => sum + item.contactsCount, 0);
  const totalFailures = mockHistory.filter((item) => item.status === 'falhou').length;
  const completedCount = mockHistory.filter((item) => item.status !== 'pendente').length;
  const deliveryRate = completedCount > 0 ? ((completedCount - totalFailures) / completedCount) * 100 : 0;

  const latestDispatchTime = Math.max(...mockHistory.map((item) => new Date(item.date).getTime()));

  const filteredHistory = useMemo(() => {
    return mockHistory.filter((item) => {
      if (search && !item.audience.toLowerCase().includes(search.toLowerCase())) return false;
      if (channelFilter !== 'all' && item.channel !== channelFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (periodFilter !== 'all') {
        const days = Number(periodFilter);
        const diffDays = (latestDispatchTime - new Date(item.date).getTime()) / 86_400_000;
        if (diffDays > days) return false;
      }
      return true;
    });
  }, [search, channelFilter, statusFilter, periodFilter, latestDispatchTime]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/tech · crm"
        title="Centro de disparos."
        subtitle="Campanhas de WhatsApp e e-mail para a carteira."
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              <RefreshCw className="h-4 w-4" /> Histórico
            </Button>
            <Button onClick={() => setComposerOpen(true)}>
              <Send className="h-4 w-4" /> Novo disparo
            </Button>
          </>
        }
      />

      <StatCardRow
        items={[
          { label: 'Disparos no mês', value: totalDispatches, hint: 'WhatsApp e e-mail' },
          { label: 'Alcance', value: totalReach.toLocaleString('pt-BR'), hint: 'clientes impactados' },
          {
            label: 'Falhas',
            value: totalFailures,
            hint: 'disparos com falha',
            emphasis: totalFailures > 0 ? 'warm' : 'none',
          },
          {
            label: 'Taxa de entrega',
            value: `${deliveryRate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
            hint: 'sobre os disparos concluídos',
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por audiência ou conteúdo..."
          wrapperClassName="min-w-[240px] flex-1"
        />
        <SearchableSelect
          value={channelFilter}
          onChange={setChannelFilter}
          options={channelOptions}
          placeholder="Canal"
          allLabel="Todos os canais"
          width="w-auto"
        />
        <SearchableSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          placeholder="Status"
          allLabel="Todos os status"
          width="w-auto"
        />
        <SearchableSelect
          value={periodFilter}
          onChange={setPeriodFilter}
          options={periodOptions}
          placeholder="Período"
          allLabel="Todo o período"
          width="w-auto"
        />
      </div>

      <div ref={historyRef} className="rounded-lg border border-line bg-paper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data e hora</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Audiência</TableHead>
              <TableHead className="text-right">Clientes</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHistory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-ink">
                  Nenhum disparo encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            ) : (
              filteredHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-ink">
                    {format(new Date(item.date), 'dd/MM/yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="text-ink">
                    {item.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
                  </TableCell>
                  <TableCell className="font-semibold text-ink">{item.audience}</TableCell>
                  <TableCell className="text-right text-ink">{item.contactsCount}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-t border-line px-5 py-3.5 text-meta text-muted-ink">
          {filteredHistory.length} de {mockHistory.length} disparos
        </div>
      </div>

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Novo disparo</DialogTitle>
            <DialogDescription>
              Configure a audiência, o canal e a mensagem da campanha.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Configuration */}
            <div className="space-y-4">
              {/* Audience Config */}
              <Card className="border-border/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Configurar Audiência
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Selecionar Público</Label>
                    <Select value={audience} onValueChange={setAudience}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha o público-alvo" />
                      </SelectTrigger>
                      <SelectContent>
                        {audienceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <span className="flex items-center justify-between w-full">
                              {option.label}
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {option.count}
                              </Badge>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label>Canal de Envio</Label>
                    <RadioGroup value={channel} onValueChange={setChannel} className="grid grid-cols-2 gap-3">
                      <Label
                        htmlFor="whatsapp"
                        className={cn(
                          "flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all",
                          channel === 'whatsapp'
                            ? "border-ok bg-ok/10"
                            : "border-border hover:border-ok/50"
                        )}
                      >
                        <RadioGroupItem value="whatsapp" id="whatsapp" className="sr-only" />
                        <MessageSquare className={cn(
                          "h-6 w-6 mb-2",
                          channel === 'whatsapp' ? "text-ok" : "text-muted-foreground"
                        )} />
                        <span className={cn(
                          "text-sm font-medium",
                          channel === 'whatsapp' ? "text-ok" : "text-muted-foreground"
                        )}>WhatsApp</span>
                      </Label>

                      <Label
                        htmlFor="email"
                        className={cn(
                          "flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all",
                          channel === 'email'
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-border hover:border-blue-500/50"
                        )}
                      >
                        <RadioGroupItem value="email" id="email" className="sr-only" />
                        <Mail className={cn(
                          "h-6 w-6 mb-2",
                          channel === 'email' ? "text-blue-500" : "text-muted-foreground"
                        )} />
                        <span className={cn(
                          "text-sm font-medium",
                          channel === 'email' ? "text-blue-500" : "text-muted-foreground"
                        )}>E-mail</span>
                      </Label>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>

              {/* Impact Summary */}
              <Card className={cn(
                "border-2",
                channel === 'whatsapp' ? "border-ok/30 bg-ok/5" : "border-blue-500/30 bg-blue-500/5"
              )}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-3 rounded-full",
                      channel === 'whatsapp' ? "bg-ok/20" : "bg-blue-500/20"
                    )}>
                      <Users className={cn(
                        "h-5 w-5",
                        channel === 'whatsapp' ? "text-ok" : "text-blue-500"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Clientes impactados</p>
                      <p className="text-h3-section">{contactCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card className="border-border/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Agendamento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Programar para depois</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !scheduleDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduleDate ? format(scheduleDate, "PPP 'às' HH:mm", { locale: ptBR }) : "Enviar agora"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduleDate}
                          onSelect={setScheduleDate}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <Button className="w-full" size="lg">
                    <Send className="h-4 w-4 mr-2" />
                    {scheduleDate ? 'Agendar Disparo' : 'Simular Disparo'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Center/Right Panel - Message Editor & Preview */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-border/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Editor de Mensagem
                  </CardTitle>
                  <CardDescription>
                    Clique nas variáveis abaixo para inserir no texto
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Variables */}
                  <div className="flex flex-wrap gap-2">
                    {variables.map((v) => (
                      <Button
                        key={v.key}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs bg-primary/5 hover:bg-primary/10 border-primary/20"
                        onClick={() => handleVariableClick(v.key)}
                      >
                        <code className="text-primary">{v.key}</code>
                      </Button>
                    ))}
                  </div>

                  {/* Message Input */}
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Digite sua mensagem aqui..."
                    className="min-h-[180px] resize-none"
                  />

                  <p className="text-xs text-muted-foreground text-right">
                    {message.length} caracteres
                  </p>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card className="border-border/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    Preview da Mensagem
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-[#0b141a] rounded-xl p-4 max-w-sm mx-auto">
                    {/* Phone mockup header */}
                    <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                      <div className="w-10 h-10 rounded-full bg-ok/20 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-ok" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">Sua Empresa</p>
                        <p className="text-white/50 text-xs">online</p>
                      </div>
                    </div>

                    {/* Message bubble */}
                    <div className="mt-4 space-y-2">
                      <div className="bg-[#005c4b] rounded-lg rounded-tl-none p-3 max-w-[85%]">
                        <p className="text-white text-sm whitespace-pre-wrap">{previewMessage}</p>
                        <p className="text-white/50 text-[10px] text-right mt-1">
                          {format(new Date(), 'HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CrmDispatches;
