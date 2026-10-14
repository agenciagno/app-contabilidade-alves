import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DateField, segmentedListClass, segmentedTriggerClass } from '@/components/ds';
import { cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import {
  ProcessoOpcao, ProcessoRow, nomeCliente, useClientesParaProcesso, useSalvarProcesso,
} from '@/hooks/useProcessos';
import { OpcaoCombobox } from '@/components/processos/OpcaoCombobox';
import { HistoricoProcesso } from '@/components/processos/HistoricoProcesso';

type Origem = 'cadastro' | 'avulso';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processo: ProcessoRow | null;
  opcoes: ProcessoOpcao[];
}

const rotulo = 'text-[11.5px] font-medium text-ink-2';

export function ProcessoFormDialog({ open, onOpenChange, processo, opcoes }: Props) {
  const editando = !!processo;
  const { data: clientes = [] } = useClientesParaProcesso();
  const { data: equipe = [] } = useTeamProfiles(open);
  const { profile } = useProfile();
  const salvar = useSalvarProcesso();

  const porTipo = useMemo(() => ({
    status: opcoes.filter((o) => o.tipo === 'status'),
    servico: opcoes.filter((o) => o.tipo === 'servico').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    orgao: opcoes.filter((o) => o.tipo === 'orgao').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }), [opcoes]);
  const mapaOpcoes = useMemo(() => new Map(opcoes.map((o) => [o.id, o])), [opcoes]);
  const statusInicial = porTipo.status.find((o) => o.papel === 'inicial')?.id ?? null;

  const [origem, setOrigem] = useState<Origem>('cadastro');
  const [contactId, setContactId] = useState<string | null>(null);
  const [nomeAvulso, setNomeAvulso] = useState('');
  const [whatsAvulso, setWhatsAvulso] = useState('');
  const [data, setData] = useState('');
  const [statusId, setStatusId] = useState<string | null>(null);
  const [servicoId, setServicoId] = useState<string | null>(null);
  const [orgaoId, setOrgaoId] = useState<string | null>(null);
  const [protocolo, setProtocolo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [clienteOpen, setClienteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrigem(processo && !processo.contact_id ? 'avulso' : 'cadastro');
    setContactId(processo?.contact_id ?? null);
    setNomeAvulso(processo?.nome_avulso ?? '');
    setWhatsAvulso(processo?.whatsapp_avulso ?? '');
    setData(processo?.data_solicitacao ?? format(new Date(), 'yyyy-MM-dd'));
    setStatusId(processo?.status_id ?? statusInicial);
    setServicoId(processo?.servico_id ?? null);
    setOrgaoId(processo?.orgao_id ?? null);
    setProtocolo(processo?.protocolo ?? '');
    setObservacao(processo?.observacao ?? '');
    setResponsavelId(processo?.responsavel_id ?? profile?.id ?? '');
    // O formulário só reinicia ao abrir; status inicial e responsável que chegam depois entram no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, processo]);

  useEffect(() => {
    if (!open || processo) return;
    if (statusInicial) setStatusId((s) => s ?? statusInicial);
    if (profile?.id) setResponsavelId((r) => r || profile.id);
  }, [open, processo, statusInicial, profile?.id]);

  // Cliente inativo (ex.: baixa de um ex-cliente) não está na lista, mas a edição mostra o nome dele.
  const clienteLabel = (() => {
    if (!contactId) return null;
    const c = clientes.find((x) => x.id === contactId);
    if (c) return c.razao_social || c.display_name || c.name;
    return processo?.contact_id === contactId ? nomeCliente(processo) : 'Cliente';
  })();

  const clienteOk = origem === 'cadastro' ? !!contactId : nomeAvulso.trim().length >= 2;
  const podeSalvar = clienteOk && !!data && !!statusId && !!servicoId && !salvar.isPending;

  const handleSalvar = async () => {
    if (!podeSalvar || !statusId || !servicoId) return;
    try {
      await salvar.mutateAsync({
        id: processo?.id,
        contact_id: origem === 'cadastro' ? contactId : null,
        nome_avulso: origem === 'avulso' ? nomeAvulso.trim() : null,
        whatsapp_avulso: origem === 'avulso' ? (whatsAvulso.trim() || null) : null,
        data_solicitacao: data,
        servico_id: servicoId,
        orgao_id: orgaoId,
        status_id: statusId,
        protocolo: protocolo.trim() || null,
        observacao: observacao.trim() || null,
        responsavel_id: responsavelId || null,
      });
      toast.success(editando ? 'Processo atualizado.' : 'Processo cadastrado.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao salvar o processo.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[680px] overflow-y-auto p-0">
        <DialogHeader className="border-b border-line-2 px-6 py-5">
          <DialogTitle className="text-[17px]">{editando ? 'Editar processo' : 'Novo processo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-1.5">
            <Label className={rotulo}>Cliente <span className="text-danger">*</span></Label>
            <Tabs value={origem} onValueChange={(v) => v && setOrigem(v as Origem)}>
              <TabsList className={cn(segmentedListClass, 'w-full')}>
                <TabsTrigger value="cadastro" className={cn(segmentedTriggerClass, 'flex-1')}>Cliente do cadastro</TabsTrigger>
                <TabsTrigger value="avulso" className={cn(segmentedTriggerClass, 'flex-1')}>Ainda sem cadastro (abertura)</TabsTrigger>
              </TabsList>
            </Tabs>
            {origem === 'cadastro' ? (
              <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="flex h-10 w-full items-center justify-between rounded-sm border border-line bg-paper px-3 text-left text-ui">
                    <span className={cn('truncate', clienteLabel ? 'text-ink' : 'text-muted-ink-2')}>{clienteLabel ?? 'Selecione o cliente...'}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-ink-2" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nome ou CNPJ..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        {clientes.map((c) => {
                          const nome = c.razao_social || c.display_name || c.name;
                          return (
                            <CommandItem key={c.id} value={`${nome} ${c.name} ${c.document ?? ''} ${c.id}`} onSelect={() => { setContactId(c.id); setClienteOpen(false); }}>
                              <Check className={cn('mr-2 h-4 w-4 shrink-0', contactId === c.id ? 'opacity-100' : 'opacity-0')} />
                              <span className="truncate">{nome}</span>
                              {c.document && <span className="ml-auto pl-2 font-mono text-meta text-muted-ink-2">{c.document}</span>}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
                <Input value={nomeAvulso} onChange={(e) => setNomeAvulso(e.target.value)} maxLength={160} placeholder="Nome do cliente ou da empresa" autoComplete="off" />
                <Input value={whatsAvulso} onChange={(e) => setWhatsAvulso(e.target.value)} maxLength={30} placeholder="WhatsApp com DDD" inputMode="tel" autoComplete="off" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={rotulo}>Data da solicitação <span className="text-danger">*</span></Label>
              <DateField value={data} onChange={setData} />
            </div>
            <div className="space-y-1.5">
              <Label className={rotulo}>Status <span className="text-danger">*</span></Label>
              <OpcaoCombobox tipo="status" opcoes={porTipo.status} value={statusId} onChange={setStatusId} placeholder="Selecione o status..." />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={rotulo}>Serviço solicitado <span className="text-danger">*</span></Label>
              <OpcaoCombobox tipo="servico" opcoes={porTipo.servico} value={servicoId} onChange={setServicoId} placeholder="Selecione o serviço..." />
            </div>
            <div className="space-y-1.5">
              <Label className={rotulo}>Órgão competente</Label>
              <OpcaoCombobox tipo="orgao" opcoes={porTipo.orgao} value={orgaoId} onChange={setOrgaoId} placeholder="Selecione o órgão..." vazioLabel="Sem órgão" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={rotulo}>Protocolo</Label>
              <Input value={protocolo} onChange={(e) => setProtocolo(e.target.value)} maxLength={200} placeholder="Ex.: MGP2600752208 · 26/594.560-7" className="font-mono" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label className={rotulo}>Responsável</Label>
              <Select value={responsavelId || undefined} onValueChange={(v) => { if (v) setResponsavelId(v); }}>
                <SelectTrigger><SelectValue placeholder="Quem cadastrou" /></SelectTrigger>
                <SelectContent>
                  {equipe.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={rotulo}>Observação</Label>
            <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} placeholder="Ex.: aguardando o cliente pagar a DAE; visita da Vigilância marcada." />
          </div>

          {processo && (
            <div className="space-y-1.5">
              <Label className={rotulo}>Histórico</Label>
              <HistoricoProcesso processoId={processo.id} opcoes={mapaOpcoes} />
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-line-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!podeSalvar}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editando ? 'Salvar alterações' : 'Cadastrar processo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
