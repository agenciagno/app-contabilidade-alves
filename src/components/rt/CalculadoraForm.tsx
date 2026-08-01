import { useEffect, useMemo, useState } from 'react';
import { Calculator, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Contact } from '@/hooks/useContacts';
import { extrairCnae, setorPorCnae, sugereAnexoIV } from '@/lib/rt/cnae';
import { REDUCOES_SETORIAIS, SETOR_LABEL, type RegimeAtual, type Setor } from '@/lib/rt/tabelas';
import type { DiagnosticoInput } from '@/lib/rt/types';

export interface FormState {
  contactId: string;
  nomeReferencia: string;
  setor: Setor;
  regimeAtual: RegimeAtual;
  faturamento12m: string;
  folha12m: string;
  comprasComCredito12m: string;
  atividadeAnexoIV: boolean;
  aliquotaIcms: string;
  aliquotaIss: string;
  margemLucro: string;
  pctB2B: string;
  reducaoSetorial: string;
}

const INICIAL: FormState = {
  contactId: '',
  nomeReferencia: '',
  setor: 'servico',
  regimeAtual: 'simples_nacional',
  faturamento12m: '',
  folha12m: '',
  comprasComCredito12m: '',
  atividadeAnexoIV: false,
  aliquotaIcms: '18',
  aliquotaIss: '5',
  margemLucro: '',
  pctB2B: '',
  reducaoSetorial: 'nenhuma',
};

/** Aceita "1.234,56" e "1234.56" — o usuário digita como quiser. */
function paraNumero(v: string): number | undefined {
  if (!v?.trim()) return undefined;
  const limpo = v.replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

const Dica = ({ children }: { children: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help align-middle text-muted-foreground">
          <Info className="ml-1 h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface Props {
  contacts: Contact[];
  aliquotaCbs: number;
  aliquotaIbs: number;
  carregandoAliquotas: boolean;
  onCalcular: (
    input: DiagnosticoInput,
    meta: { contactId: string | null; nomeReferencia: string | null; uf: string | null; municipio: string | null; cnae: { codigo?: string; descricao?: string } | null }
  ) => void;
}

export function CalculadoraForm({
  contacts, aliquotaCbs, aliquotaIbs, carregandoAliquotas, onCalcular,
}: Props) {
  const [form, setForm] = useState<FormState>(INICIAL);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const clientes = useMemo(
    () => contacts.filter((c) => c.is_active && (c.type === 'cliente' || c.type === 'ambos')),
    [contacts]
  );
  const selecionado = clientes.find((c) => c.id === form.contactId) ?? null;
  const cnae = selecionado ? extrairCnae(selecionado.cnae_principal) : null;

  // Ao escolher um cliente, puxa o que o cadastro já sabe. O usuário ainda pode trocar
  // tudo — o cadastro é ponto de partida, não camisa de força.
  useEffect(() => {
    if (!selecionado) return;
    const c = extrairCnae(selecionado.cnae_principal);
    const setorSugerido = setorPorCnae(c?.codigo);
    const regime = selecionado.tax_regime;
    setForm((f) => ({
      ...f,
      setor: setorSugerido ?? f.setor,
      regimeAtual:
        regime === 'simples_nacional' || regime === 'lucro_presumido' || regime === 'lucro_real'
          ? regime
          : f.regimeAtual,
      atividadeAnexoIV: sugereAnexoIV(c?.codigo),
    }));
  }, [selecionado]);

  const faturamento = paraNumero(form.faturamento12m);
  const podeCalcular = !!faturamento && faturamento > 0;
  const ehSimples = form.regimeAtual === 'simples_nacional';
  const ehServico = form.setor === 'servico';

  const submeter = () => {
    if (!faturamento) return;
    const input: DiagnosticoInput = {
      setor: form.setor,
      regimeAtual: form.regimeAtual,
      faturamento12m: faturamento,
      folha12m: paraNumero(form.folha12m),
      comprasComCredito12m: paraNumero(form.comprasComCredito12m),
      atividadeAnexoIV: form.atividadeAnexoIV,
      aliquotaIcms: paraNumero(form.aliquotaIcms),
      aliquotaIss: paraNumero(form.aliquotaIss),
      margemLucro: paraNumero(form.margemLucro),
      pctB2B: paraNumero(form.pctB2B),
      reducaoSetorial: form.reducaoSetorial,
      aliquotaCbs: aliquotaCbs / 100,
      aliquotaIbs: aliquotaIbs / 100,
    };
    onCalcular(input, {
      contactId: form.contactId || null,
      nomeReferencia: form.contactId ? null : form.nomeReferencia || null,
      uf: selecionado?.state ?? null,
      municipio: selecionado?.city ?? null,
      cnae,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dados da empresa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select
              value={form.contactId || 'avulso'}
              onValueChange={(v) => set('contactId', v === 'avulso' ? '' : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="avulso">Simulação avulsa (não é cliente ainda)</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cnae?.descricao && (
              <p className="text-xs text-muted-foreground">
                CNAE {cnae.codigo} — {cnae.descricao}
              </p>
            )}
          </div>

          {!form.contactId && (
            <div className="space-y-1.5">
              <Label>Nome de referência</Label>
              <Input
                value={form.nomeReferencia}
                onChange={(e) => set('nomeReferencia', e.target.value)}
                placeholder="Para identificar esta simulação depois"
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Setor de atuação</Label>
            <Select value={form.setor} onValueChange={(v) => set('setor', v as Setor)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SETOR_LABEL) as Setor[]).map((s) => (
                  <SelectItem key={s} value={s}>{SETOR_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Regime tributário atual</Label>
            <Select
              value={form.regimeAtual}
              onValueChange={(v) => set('regimeAtual', v as RegimeAtual)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                <SelectItem value="lucro_real">Lucro Real</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Faturamento dos últimos 12 meses (R$)
              <Dica>É o RBT12. Se a empresa tem menos de 12 meses, use a média mensal multiplicada por 12.</Dica>
            </Label>
            <Input
              inputMode="decimal"
              value={form.faturamento12m}
              onChange={(e) => set('faturamento12m', e.target.value)}
              placeholder="600.000,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Compras e despesas com direito a crédito (R$)
              <Dica>Compras de mercadoria, insumos, energia, aluguel e serviços tomados com nota fiscal. É o campo que mais muda o resultado da reforma: quase tudo com nota vira crédito.</Dica>
            </Label>
            <Input
              inputMode="decimal"
              value={form.comprasComCredito12m}
              onChange={(e) => set('comprasComCredito12m', e.target.value)}
              placeholder="Opcional, mas recomendado"
            />
          </div>
        </div>

        {ehServico && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Folha de pagamento 12 meses (R$)
                <Dica>Salários + encargos, incluindo pró-labore e CPP, sem FGTS. Define o Fator R: 28% ou mais leva ao Anexo III, que é mais barato que o Anexo V.</Dica>
              </Label>
              <Input
                inputMode="decimal"
                value={form.folha12m}
                onChange={(e) => set('folha12m', e.target.value)}
                placeholder="Sem isso, assumimos o Anexo V"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.atividadeAnexoIV}
                  onCheckedChange={(v) => set('atividadeAnexoIV', v === true)}
                />
                Construção, vigilância, limpeza ou advocacia (Anexo IV)
              </label>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {ehServico ? (
            <div className="space-y-1.5">
              <Label>ISS do município (%)</Label>
              <Input
                inputMode="decimal"
                value={form.aliquotaIss}
                onChange={(e) => set('aliquotaIss', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Entre 2% e 5%.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>ICMS do estado (%)</Label>
              <Input
                inputMode="decimal"
                value={form.aliquotaIcms}
                onChange={(e) => set('aliquotaIcms', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Confira a alíquota interna do estado.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              Margem de lucro (%)
              <Dica>Só é usada para comparar com o Lucro Real, onde o imposto incide sobre o lucro e não sobre o faturamento.</Dica>
            </Label>
            <Input
              inputMode="decimal"
              value={form.margemLucro}
              onChange={(e) => set('margemLucro', e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Redução setorial</Label>
            <Select
              value={form.reducaoSetorial}
              onValueChange={(v) => set('reducaoSetorial', v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REDUCOES_SETORIAIS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {ehSimples && (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <Label>
              Quanto das vendas vai para outras empresas (%)
              <Dica>Vendas para clientes PJ do regime regular. É a informação que decide entre continuar no DAS unificado ou apurar IBS/CBS por fora — quem vende para consumidor final não aproveita crédito.</Dica>
            </Label>
            <Input
              className="mt-1.5 max-w-[200px]"
              inputMode="decimal"
              value={form.pctB2B}
              onChange={(e) => set('pctB2B', e.target.value)}
              placeholder="Ex.: 70"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Sem esse número não conseguimos recomendar entre regime unificado e regime regular —
              a decisão da janela de setembro depende dele.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {carregandoAliquotas
              ? 'Consultando alíquotas de referência…'
              : `Cenário com CBS de ${aliquotaCbs.toFixed(2).replace('.', ',')}% e IBS de ${aliquotaIbs.toFixed(2).replace('.', ',')}%.`}
          </p>
          <Button onClick={submeter} disabled={!podeCalcular || carregandoAliquotas}>
            {carregandoAliquotas ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="mr-2 h-4 w-4" />
            )}
            Gerar diagnóstico
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
