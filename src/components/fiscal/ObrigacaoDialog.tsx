import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Database } from '@/integrations/supabase/types';
import { OBLIGATION_DEPARTMENTS, type ObligationDepartment } from '@/constants/obligationDepartments';
import { salvarMapeamento, useMapeamentoObrigacao, type OrigemData } from '@/hooks/useObrigacoesResumo';

export type FiscalObligationCatalog =
  Database['public']['Tables']['fiscal_obligations_catalog']['Row'];

interface ObrigacaoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  obligation?: FiscalObligationCatalog | null;
  companyId: string;
  onSuccess: () => void;
}

const REGIME_OPTIONS: { value: string; label: string }[] = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'mei', label: 'MEI' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
];

const ALL_REGIMES = REGIME_OPTIONS.map((r) => r.value);

type Category = 'fiscal' | 'recorrente';
type DueRuleType = 'day' | 'bday' | 'last';

function extractDueRule(due_rule: string | undefined | null): {
  type: DueRuleType;
  value: string;
} {
  if (!due_rule) return { type: 'day', value: '' };
  if (due_rule === 'last_business_day' || due_rule === 'last_day_of_month') return { type: 'last', value: '' };
  const bday = due_rule.match(/^bday_(\d+)$/);
  if (bday) return { type: 'bday', value: bday[1] };
  const day = due_rule.match(/^day_(\d+)$/);
  if (day) return { type: 'day', value: day[1] };
  return { type: 'day', value: '' };
}

export function ObrigacaoDialog({
  open,
  onOpenChange,
  obligation,
  companyId,
  onSuccess,
}: ObrigacaoDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState<ObligationDepartment>('fiscal');
  // Setor substitui o antigo campo "Tipo": só o Departamento Fiscal varia por
  // regime tributário (DAS/ICMS/etc.); os demais setores — incl. Geral, que
  // assume o papel do que era "Tarefa recorrente" — aplicam a todas as empresas.
  const category: Category = department === 'fiscal' ? 'fiscal' : 'recorrente';
  const [selectedRegimes, setSelectedRegimes] = useState<string[]>([]);
  const [dueRuleType, setDueRuleType] = useState<DueRuleType>('day');
  const [dueDay, setDueDay] = useState('');
  const [requiresEmployees, setRequiresEmployees] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<'federal' | 'estadual' | 'municipal'>('federal');
  // De onde vem a data: regra do sistema (padrão) ou uma linha da planilha oficial da Receita.
  const [origemTipo, setOrigemTipo] = useState<OrigemData>('regra');
  const [origemValor, setOrigemValor] = useState('');
  const [saving, setSaving] = useState(false);
  const mapeamento = useMapeamentoObrigacao(open ? obligation?.id : null);

  useEffect(() => {
    if (!open) return;
    if (obligation) {
      const dueRule = extractDueRule(obligation.due_rule);
      setName(obligation.name ?? '');
      setDescription(obligation.description ?? '');
      setDepartment((obligation.department as ObligationDepartment) ?? 'fiscal');
      setSelectedRegimes(obligation.applies_to ?? []);
      setDueRuleType(dueRule.type);
      setDueDay(dueRule.value);
      setRequiresEmployees(!!obligation.requires_employees);
      setJurisdiction((((obligation as any).jurisdiction as string) || 'federal') as 'federal' | 'estadual' | 'municipal');
    } else {
      setName('');
      setDescription('');
      setDepartment('fiscal');
      setSelectedRegimes([]);
      setDueRuleType('day');
      setDueDay('');
      setRequiresEmployees(false);
      setJurisdiction('federal');
      setOrigemTipo('regra');
      setOrigemValor('');
    }
  }, [open, obligation]);

  useEffect(() => {
    if (open && obligation && mapeamento.data) {
      setOrigemTipo(mapeamento.data.tipo);
      setOrigemValor(mapeamento.data.valor);
    }
  }, [open, obligation, mapeamento.data]);

  const toggleRegime = (value: string) => {
    setSelectedRegimes((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
  };

  const handleSave = async () => {
    if (name.trim().length < 3) {
      toast.error('Informe um nome com ao menos 3 caracteres.');
      return;
    }
    if (category === 'fiscal' && selectedRegimes.length === 0) {
      toast.error('Selecione ao menos um regime.');
      return;
    }
    const dayNum = parseInt(dueDay, 10);
    const maxDay = dueRuleType === 'bday' ? 23 : 31;
    if (dueRuleType !== 'last' && (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > maxDay)) {
      toast.error(
        dueRuleType === 'bday'
          ? 'Nº do dia útil deve ser entre 1 e 23.'
          : 'Dia de vencimento deve ser entre 1 e 31.',
      );
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      category,
      department,
      applies_to: category === 'recorrente' ? ALL_REGIMES : selectedRegimes,
      frequency: 'monthly',
      due_rule: dueRuleType === 'last' ? 'last_business_day' : dueRuleType === 'bday' ? `bday_${dayNum}` : `day_${dayNum}`,
      holiday_adjustment: 'advance',
      requires_employees: requiresEmployees,
      active: true,
      is_custom: true,
      company_id: companyId,
      source: 'manual',
      jurisdiction,
    };

    if (origemTipo !== 'regra' && !origemValor.trim()) {
      toast.error(origemTipo === 'declaracao' ? 'Informe como o nome da declaração começa na planilha da Receita.' : 'Informe ao menos um código de receita.');
      return;
    }

    setSaving(true);
    try {
      let obligationId = obligation?.id;
      if (obligationId) {
        const { error } = await supabase
          .from('fiscal_obligations_catalog')
          .update(payload)
          .eq('id', obligationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('fiscal_obligations_catalog')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        obligationId = data.id;
      }
      // Origem da data: grava só quando muda (ou na obrigação nova que escolheu a Receita).
      const origemAtual = obligation ? (mapeamento.data ?? { tipo: 'regra' as OrigemData, valor: '' }) : { tipo: 'regra' as OrigemData, valor: '' };
      if (obligationId && (origemTipo !== origemAtual.tipo || origemValor.trim() !== origemAtual.valor.trim())) {
        await salvarMapeamento(obligationId, origemTipo, origemValor.trim());
      }
      toast.success('Obrigação salva com sucesso.');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {obligation ? 'Editar obrigação' : 'Nova obrigação'}
          </DialogTitle>
          <DialogDescription>
            Defina o setor, o regime (quando aplicável), o vencimento e os ajustes da obrigação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob-name">Nome *</Label>
            <Input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: DAS Simples Nacional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-desc">Descrição (opcional)</Label>
            <Textarea
              id="ob-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Setor *</Label>
            <Select value={department} onValueChange={(v) => setDepartment(v as ObligationDepartment)}>
              <SelectTrigger id="ob-department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBLIGATION_DEPARTMENTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {department === 'fiscal'
                ? 'Declaração/obrigação fiscal, vinculada a regime(s) tributário(s). Define o responsável que recebe a tarefa gerada e agrupa num card próprio no Kanban de Tarefas.'
                : 'Aplicada a todas as empresas elegíveis, sem depender de regime. Define o responsável que recebe a tarefa gerada e agrupa num card próprio no Kanban de Tarefas.'}
            </p>
          </div>

          {category === 'fiscal' && (
            <div className="space-y-2">
              <Label>Regime(s) *</Label>
              <div className="grid grid-cols-2 gap-2">
                {REGIME_OPTIONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedRegimes.includes(r.value)}
                      onCheckedChange={() => toggleRegime(r.value)}
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Vencimento *</Label>
            <div className="flex items-center gap-2">
              <Select
                value={dueRuleType}
                onValueChange={(v) => setDueRuleType(v as DueRuleType)}
              >
                <SelectTrigger id="ob-due-type" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia fixo do mês</SelectItem>
                  <SelectItem value="bday">Nº dia útil do mês</SelectItem>
                  <SelectItem value="last">Último dia útil do mês</SelectItem>
                </SelectContent>
              </Select>
              {dueRuleType !== 'last' && (
              <Input
                id="ob-day"
                type="number"
                min={1}
                max={dueRuleType === 'bday' ? 23 : 31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-24"
                placeholder={dueRuleType === 'bday' ? 'Ex: 5' : 'Ex: 20'}
              />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {dueRuleType === 'last'
                ? 'Vence no último dia útil de cada mês (ex.: MIT, DCTFWeb, IRPJ/CSLL).'
                : dueRuleType === 'bday'
                ? 'Ex: "5" = 5º dia útil de cada mês, já calculado automaticamente.'
                : 'Ajuste automático para último dia útil anterior se cair em fim de semana.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Esfera</Label>
            <Select value={jurisdiction} onValueChange={(v) => setJurisdiction(v as 'federal' | 'estadual' | 'municipal')}>
              <SelectTrigger id="ob-esfera"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="federal">Federal</SelectItem>
                <SelectItem value="estadual">Estadual</SelectItem>
                <SelectItem value="municipal">Municipal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>De onde vem a data</Label>
            <Select value={origemTipo} onValueChange={(v) => setOrigemTipo(v as OrigemData)}>
              <SelectTrigger id="ob-origem"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="regra">Regra do vencimento acima</SelectItem>
                <SelectItem value="declaracao">Planilha da Receita · declaração</SelectItem>
                <SelectItem value="codigos">Planilha da Receita · código(s) de receita</SelectItem>
              </SelectContent>
            </Select>
            {origemTipo !== 'regra' && (
              <Input
                value={origemValor}
                onChange={(e) => setOrigemValor(e.target.value)}
                placeholder={origemTipo === 'declaracao' ? 'Como o nome começa na planilha. Ex.: EFD-Reinf' : 'Códigos separados por vírgula. Ex.: 8109, 2172'}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {origemTipo === 'regra'
                ? 'Estadual e municipal seguem a regra. Federal pode vir da agenda oficial da Receita, que tem prioridade quando há linha para o mês.'
                : 'Quando a Receita publicar a agenda do mês, esta data vem da linha correspondente; sem linha, vale a regra acima.'}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="ob-emp" className="cursor-pointer">
                Requer funcionários
              </Label>
              <p className="text-xs text-muted-foreground">
                Aplica-se apenas a empresas com funcionários.
              </p>
            </div>
            <Switch
              id="ob-emp"
              checked={requiresEmployees}
              onCheckedChange={setRequiresEmployees}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
