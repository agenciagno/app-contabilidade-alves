import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Loader2, MessageCircle, ThumbsDown, Trash2, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import { TAX_REGIMES } from '@/constants/taxRegimes';
import { maskCPFCNPJ, maskPhone, unmaskPhone } from '@/lib/utils';
import {
  ETAPAS_FUNIL, INTERESSE_ROTULO, MOTIVO_PERDA_ROTULO, Interessado, InteressadoForm, MotivoPerda,
  linkWhatsapp, mensagemFollowup, useEventosInteressado,
} from '@/hooks/useInteressados';

const NENHUM = '_nenhum';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{rotulo}</Label>{children}</div>;
}

/**
 * Cadastro e ficha de um interessado (17/10/2026): dados curtos, próximo contato, histórico com anotações e as ações do funil
 * (WhatsApp com texto pronto, Perdido com motivo, Fechou → vira cliente pelo assistente de cadastro).
 */
export function InteressadoDialog({
  open, onOpenChange, interessado, salvando, onSalvar, onPerdido, onFechar, onApagar, onAbrirCliente,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interessado?: Interessado;
  salvando: boolean;
  onSalvar: (form: InteressadoForm) => Promise<void>;
  onPerdido: (motivo: MotivoPerda) => Promise<void>;
  onFechar: () => void;
  onApagar: () => Promise<void>;
  onAbrirCliente: (contactId: string) => void;
}) {
  const { data: equipe = [] } = useTeamProfiles(open);
  const { eventos, registrar } = useEventosInteressado(interessado?.id);
  const [form, setForm] = useState<InteressadoForm>({});
  const [anotacao, setAnotacao] = useState('');
  const [motivo, setMotivo] = useState<MotivoPerda | ''>('');
  const [mostrarPerda, setMostrarPerda] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(interessado ? {
      nome: interessado.nome, whatsapp: interessado.whatsapp ? maskPhone(interessado.whatsapp) : '', email: interessado.email,
      documento: interessado.documento, interesse: interessado.interesse, indicado_por: interessado.indicado_por,
      regime_pretendido: interessado.regime_pretendido, honorario_proposto: interessado.honorario_proposto,
      responsavel_id: interessado.responsavel_id, etapa: interessado.etapa, proximo_contato: interessado.proximo_contato,
    } : { interesse: 'abertura', etapa: 'novo' });
    setAnotacao(''); setMotivo(''); setMostrarPerda(false);
  }, [open, interessado]);

  const set = (k: keyof InteressadoForm, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    await onSalvar({
      ...form,
      nome: (form.nome || '').trim(),
      whatsapp: unmaskPhone(form.whatsapp || '') || null,
      email: form.email?.trim() || null,
      documento: form.documento?.trim() || null,
      indicado_por: form.indicado_por?.trim() || null,
      honorario_proposto: form.honorario_proposto === undefined || form.honorario_proposto === null || String(form.honorario_proposto) === ''
        ? null : Number(form.honorario_proposto),
      proximo_contato: form.proximo_contato || null,
    });
  };

  const enviarWhats = () => {
    if (!interessado) return;
    const texto = mensagemFollowup(interessado);
    const url = linkWhatsapp(interessado.whatsapp, texto);
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    registrar.mutate({ tipo: 'mensagem', texto: 'Mensagem de WhatsApp aberta: ' + texto });
  };

  const ativo = interessado && interessado.etapa !== 'fechou' && interessado.etapa !== 'perdido';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{interessado ? interessado.nome : 'Novo interessado'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome *">
            <Input value={form.nome || ''} onChange={e => set('nome', e.target.value)} autoFocus={!interessado} />
          </Campo>
          <Campo rotulo="WhatsApp">
            <Input value={form.whatsapp || ''} onChange={e => set('whatsapp', maskPhone(e.target.value))} placeholder="(31) 90000-0000" />
          </Campo>
          <Campo rotulo="Interesse">
            <Select value={form.interesse || 'abertura'} onValueChange={v => v && set('interesse', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(INTERESSE_ROTULO).map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Indicado por">
            <Input value={form.indicado_por || ''} onChange={e => set('indicado_por', e.target.value)} placeholder="Quem indicou (cliente, parceiro, Instagram...)" />
          </Campo>
          <Campo rotulo="Próximo contato">
            <Input type="date" value={form.proximo_contato || ''} onChange={e => set('proximo_contato', e.target.value)} />
          </Campo>
          <Campo rotulo="Responsável">
            <Select value={form.responsavel_id || NENHUM} onValueChange={v => v && set('responsavel_id', v === NENHUM ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Ninguém</SelectItem>
                {equipe.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Regime pretendido">
            <Select value={form.regime_pretendido || NENHUM} onValueChange={v => v && set('regime_pretendido', v === NENHUM ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Não sei ainda" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Não sei ainda</SelectItem>
                {TAX_REGIMES.filter(r => r.value !== 'nao_aplica').map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Honorário proposto (R$)">
            <Input type="number" min="0" step="0.01" value={form.honorario_proposto ?? ''} onChange={e => set('honorario_proposto', e.target.value)} />
          </Campo>
          <Campo rotulo="CPF/CNPJ">
            <Input value={form.documento || ''} onChange={e => set('documento', maskCPFCNPJ(e.target.value))} placeholder="Se já tiver" />
          </Campo>
          <Campo rotulo="E-mail">
            <Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
          </Campo>
          {(!interessado || ativo) && (
            <Campo rotulo="Etapa">
              <Select value={form.etapa || 'novo'} onValueChange={v => v && set('etapa', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ETAPAS_FUNIL.filter(e => e.valor !== 'fechou').map(e => <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={salvando || !(form.nome || '').trim()} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {interessado ? 'Salvar alterações' : 'Cadastrar interessado'}
          </Button>
        </div>

        {interessado && (
          <>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {interessado.whatsapp && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={enviarWhats}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp com texto pronto
                </Button>
              )}
              {ativo && (
                <Button size="sm" className="gap-1.5" onClick={onFechar}>
                  <UserCheck className="h-4 w-4" /> Fechou: virar cliente
                </Button>
              )}
              {ativo && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMostrarPerda(v => !v)}>
                  <ThumbsDown className="h-4 w-4" /> Perdido
                </Button>
              )}
              {interessado.etapa === 'perdido' && (
                <Button variant="outline" size="sm" onClick={() => onSalvar({ etapa: 'novo' })}>Reabrir</Button>
              )}
              {interessado.contact_id && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onAbrirCliente(interessado.contact_id!)}>
                  <ExternalLink className="h-4 w-4" /> Abrir cliente
                </Button>
              )}
              <Button
                variant="ghost" size="sm" className="ml-auto gap-1.5 text-danger hover:text-danger"
                onClick={() => { if (window.confirm(`Apagar ${interessado.nome}? O histórico também some.`)) onApagar(); }}
              >
                <Trash2 className="h-4 w-4" /> Apagar
              </Button>
            </div>

            {mostrarPerda && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-line bg-bg p-3">
                <div className="min-w-[220px] flex-1 space-y-1.5">
                  <Label>Por que não fechou?</Label>
                  <Select value={motivo} onValueChange={v => v && setMotivo(v as MotivoPerda)}>
                    <SelectTrigger><SelectValue placeholder="Escolha o motivo" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(MOTIVO_PERDA_ROTULO).map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" disabled={!motivo} onClick={() => motivo && onPerdido(motivo)}>Marcar como perdido</Button>
              </div>
            )}

            <div className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-ink">Histórico</h3>
              <div className="flex gap-2">
                <Textarea value={anotacao} onChange={e => setAnotacao(e.target.value)} rows={2} placeholder="Anotação: o que conversaram, próximo passo..." />
                <Button
                  variant="outline" className="self-end" disabled={!anotacao.trim() || registrar.isPending}
                  onClick={() => registrar.mutate({ texto: anotacao.trim() }, { onSuccess: () => setAnotacao('') })}
                >
                  Anotar
                </Button>
              </div>
              <ol className="space-y-2">
                {eventos.map(ev => (
                  <li key={ev.id} className="rounded-md border border-line p-2.5 text-[13px]">
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-meta text-muted-ink">
                      <span>{ev.tipo === 'etapa' ? 'Etapa' : ev.tipo === 'mensagem' ? 'Mensagem' : 'Anotação'}</span>
                      <span>{format(parseISO(ev.created_at), 'dd/MM/yyyy HH:mm')}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-ink">{ev.texto}</p>
                  </li>
                ))}
                {eventos.length === 0 && <li className="text-[13px] text-muted-ink">Nada registrado ainda.</li>}
              </ol>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
