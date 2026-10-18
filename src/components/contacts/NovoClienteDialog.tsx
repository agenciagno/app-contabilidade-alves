import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, FilePlus2, Loader2, Truck, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompany } from '@/contexts/CompanyContext';
import { useContacts } from '@/hooks/useContacts';
import { lookupCnpj, CnpjLookupResult } from '@/lib/cnpj-lookup';
import { maskCPF, maskCPFCNPJ, maskPhone, unmaskPhone } from '@/lib/utils';
import { iniciarOnboardingCadastro, FluxoCadastro } from '@/hooks/useOnboardingCadastro';

type Modo = 'escolha' | 'cnpj' | 'abertura';

const soDocumento = (v: string | null | undefined) => (v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

function cpfValido(valor: string) {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/**
 * "Novo cliente" (17/10/2026): uma pergunta antes de tudo. Empresa com CNPJ (obrigatório; a Receita preenche o resto) ou abertura
 * de empresa (só o CPF do sócio, que vai para o Quadro Societário: CPF no campo do cliente o transformaria em Pessoa Física).
 * Cria o cliente na hora e abre o Super Perfil em modo assistente. Fornecedor e outros seguem no formulário simples.
 */
/** Dados de um interessado que fechou (aba Interessados): o cadastro já começa preenchido, sem digitar de novo. */
export interface PrefillCliente {
  nome: string;
  whatsapp?: string | null;
  documento?: string | null;
  regime?: string | null;
  honorario?: number | null;
  responsavelId?: string | null;
  indicadoPor?: string | null;
}

export function NovoClienteDialog({ open, onOpenChange, onOutroContato, prefill, onCriado }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOutroContato?: () => void;
  prefill?: PrefillCliente;
  onCriado?: (contactId: string) => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const { activeCompanyId } = useActiveCompany();
  const { contacts, createContact } = useContacts();

  const [modo, setModo] = useState<Modo>('escolha');
  const [salvando, setSalvando] = useState(false);

  // Com CNPJ
  const [cnpj, setCnpj] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [receita, setReceita] = useState<CnpjLookupResult | null>(null);
  const [falhaBusca, setFalhaBusca] = useState(false);
  const [nomeManual, setNomeManual] = useState('');

  // Abertura
  const [nomeCliente, setNomeCliente] = useState('');
  const [nomeSocio, setNomeSocio] = useState('');
  const [cpfSocio, setCpfSocio] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    if (!open) return;
    setModo('escolha'); setSalvando(false);
    setCnpj(''); setReceita(null); setFalhaBusca(false); setNomeManual('');
    setNomeCliente(''); setNomeSocio(''); setCpfSocio(''); setWhatsapp('');
    if (prefill) {
      const doc = soDocumento(prefill.documento);
      setWhatsapp(prefill.whatsapp ? maskPhone(prefill.whatsapp) : '');
      if (doc.length === 14) {
        setModo('cnpj'); setCnpj(maskCPFCNPJ(doc)); setNomeManual(prefill.nome);
      } else {
        setModo('abertura'); setNomeCliente(prefill.nome); setNomeSocio(prefill.nome);
        if (doc.length === 11) setCpfSocio(maskCPF(doc));
      }
    }
  }, [open, prefill]);

  const cnpjLimpo = soDocumento(cnpj);
  const cnpjCompleto = cnpjLimpo.length === 14;

  // Busca na Receita assim que o CNPJ fica completo
  useEffect(() => {
    if (modo !== 'cnpj' || !cnpjCompleto) { setReceita(null); setFalhaBusca(false); return; }
    let cancelado = false;
    setBuscando(true); setFalhaBusca(false);
    lookupCnpj(cnpjLimpo)
      .then(r => { if (!cancelado) setReceita(r); })
      .catch(() => { if (!cancelado) { setReceita(null); setFalhaBusca(true); } })
      .finally(() => { if (!cancelado) setBuscando(false); });
    return () => { cancelado = true; };
  }, [modo, cnpjLimpo, cnpjCompleto]);

  const jaCadastrado = useMemo(
    () => (cnpjCompleto ? contacts.find(c => soDocumento(c.document) === cnpjLimpo) : undefined),
    [contacts, cnpjCompleto, cnpjLimpo],
  );

  const nomeEmpresa = receita?.nome_fantasia || receita?.razao_social || nomeManual.trim();
  const cpfOk = cpfValido(cpfSocio);
  const podeCriar = modo === 'cnpj'
    ? cnpjCompleto && !buscando && !jaCadastrado && !!nomeEmpresa
    : !!nomeCliente.trim() && !!nomeSocio.trim() && cpfOk;

  const criar = async () => {
    if (!podeCriar || !activeCompanyId) return;
    setSalvando(true);
    const fluxo: FluxoCadastro = modo === 'cnpj' ? 'cnpj_existente' : 'abertura';
    const base = {
      type: 'cliente', categorias: ['cliente'], is_active: true,
      tax_regime: prefill?.regime ?? null,
      // Vindo de um interessado: honorário proposto, responsável comercial e quem indicou já entram no cadastro.
      ...(prefill ? {
        boleto_value: prefill.honorario ?? null,
        comercial_responsible_id: prefill.responsavelId ?? null,
        notes: prefill.indicadoPor ? `Indicado por: ${prefill.indicadoPor}` : null,
        whatsapp: unmaskPhone(whatsapp) || null,
      } : {}),
    };
    const payload = modo === 'cnpj'
      ? {
          ...base,
          name: nomeEmpresa,
          document: cnpj.trim(),
          tipo_cliente: 'Empresa existente',
          razao_social: receita?.razao_social ?? null,
          nome_fantasia: receita?.nome_fantasia ?? null,
          natureza_juridica: receita?.natureza_juridica ?? null,
          situacao_cadastral: receita?.situacao_cadastral ?? null,
          data_abertura_receita: receita?.data_abertura_receita ?? null,
          email: receita?.email ?? null,
          phone: receita?.phone ? unmaskPhone(receita.phone) : null,
          cep: receita?.cep ?? null,
          address: receita?.address ?? null,
          address_number: receita?.address_number ?? null,
          complemento: receita?.complemento ?? null,
          neighborhood: receita?.neighborhood ?? null,
          city: receita?.city ?? null,
          state: receita?.state ?? null,
          cnae_principal: receita?.cnae_principal ?? null,
          cnaes_secundarios: receita?.cnaes_secundarios ?? null,
        }
      : {
          ...base,
          name: nomeCliente.trim(),
          document: null,
          tipo_cliente: 'Em processo de abertura',
          whatsapp: unmaskPhone(whatsapp) || null,
        };

    let novoId: string;
    try {
      const criado = await createContact.mutateAsync(payload as any);
      novoId = criado.id;
    } catch {
      setSalvando(false);
      return; // o hook já mostra o erro
    }

    try {
      if (modo === 'abertura') {
        const { error } = await supabase.from('contact_partners').insert({
          company_id: activeCompanyId,
          contact_id: novoId,
          name: nomeSocio.trim(),
          cpf: cpfSocio,
          whatsapp: unmaskPhone(whatsapp) || null,
          participation_percentage: 100,
        });
        if (error) throw error;
      }
      await iniciarOnboardingCadastro(activeCompanyId, novoId, fluxo);
      await onCriado?.(novoId);
    } catch (e: any) {
      toast.error('Cliente criado, mas faltou uma parte', { description: e?.message || 'Confira o Societário no perfil.' });
    }

    onOpenChange(false);
    navigate(`/crm/cliente/${novoId}?assistente=1`);
  };

  const Opcao = ({ icone: Icone, titulo, texto, onClick }: { icone: typeof Building2; titulo: string; texto: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-line bg-paper p-4 text-left transition-colors hover:border-action hover:bg-action-tint"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-action-tint text-action">
        <Icone className="h-5 w-5" />
      </span>
      <span className="space-y-0.5">
        <span className="block text-[15px] font-semibold text-ink">{titulo}</span>
        <span className="block text-[13px] text-muted-ink">{texto}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {modo === 'escolha' ? 'Novo cadastro' : modo === 'cnpj' ? 'Novo cliente com CNPJ' : 'Novo cliente: abertura de empresa'}
          </DialogTitle>
          <DialogDescription>
            {modo === 'escolha'
              ? 'Escolha o tipo. Depois o cadastro segue em etapas, e dá para pular o que ainda não tiver.'
              : modo === 'cnpj'
                ? 'Digite o CNPJ: os dados da Receita entram sozinhos.'
                : 'Ainda sem CNPJ. O CPF do sócio fica no Quadro Societário; o CNPJ entra quando a empresa sair.'}
          </DialogDescription>
        </DialogHeader>

        {modo === 'escolha' && (
          <div className="space-y-2">
            <Opcao icone={Building2} titulo="Cliente que já tem CNPJ" texto="Troca de contador ou empresa já aberta." onClick={() => setModo('cnpj')} />
            <Opcao icone={FilePlus2} titulo="Cliente que vai abrir empresa" texto="Só com o CPF do sócio, por enquanto." onClick={() => setModo('abertura')} />
            {onOutroContato && (
              <Opcao icone={Truck} titulo="Fornecedor ou outro contato" texto="Cadastro simples, sem etapas." onClick={() => { onOpenChange(false); onOutroContato(); }} />
            )}
          </div>
        )}

        {modo === 'cnpj' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="novo-cnpj">CNPJ *</Label>
              <div className="relative">
                <Input
                  id="novo-cnpj"
                  autoFocus
                  value={cnpj}
                  onChange={e => setCnpj(maskCPFCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
                {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-ink" />}
              </div>
              {cnpjLimpo.length === 11 && <p className="text-meta text-danger">Isso é um CPF. Para abertura de empresa, volte e escolha "vai abrir empresa".</p>}
            </div>

            {jaCadastrado && (
              <div className="flex items-start gap-2 rounded-md border border-warn bg-warn-soft p-3 text-[13px] text-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <span>
                  Este CNPJ já está cadastrado como <strong>{jaCadastrado.display_name || jaCadastrado.name}</strong>.{' '}
                  <button type="button" className="font-semibold text-action underline" onClick={() => { onOpenChange(false); navigate(`/crm/cliente/${jaCadastrado.id}`); }}>
                    Abrir cadastro
                  </button>
                </span>
              </div>
            )}

            {receita && !jaCadastrado && (
              <div className="space-y-1 rounded-md border border-line bg-bg p-3 text-[13px]">
                <p className="font-semibold text-ink">{receita.razao_social}</p>
                {receita.nome_fantasia && <p className="text-muted-ink">{receita.nome_fantasia}</p>}
                <p className="text-muted-ink">
                  {[receita.city && receita.state ? `${receita.city}/${receita.state}` : null, receita.situacao_cadastral].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}

            {falhaBusca && !jaCadastrado && (
              <div className="space-y-1.5">
                <p className="text-meta text-muted-ink">Não achamos esse CNPJ na Receita agora. Digite o nome; o resto dá para completar depois.</p>
                <Label htmlFor="novo-nome">Nome da empresa *</Label>
                <Input id="novo-nome" value={nomeManual} onChange={e => setNomeManual(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {modo === 'abertura' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ab-nome">Nome do cliente *</Label>
              <Input id="ab-nome" autoFocus value={nomeCliente} onChange={e => setNomeCliente(e.target.value)} placeholder="Nome do futuro negócio ou do cliente" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ab-socio">Nome do sócio *</Label>
                <Input id="ab-socio" value={nomeSocio} onChange={e => setNomeSocio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ab-cpf">CPF do sócio *</Label>
                <Input id="ab-cpf" value={cpfSocio} onChange={e => setCpfSocio(maskCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
                {cpfSocio.replace(/\D/g, '').length === 11 && !cpfOk && <p className="text-meta text-danger">CPF inválido.</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ab-whats">WhatsApp</Label>
              <Input id="ab-whats" value={whatsapp} onChange={e => setWhatsapp(maskPhone(e.target.value))} placeholder="(31) 90000-0000" />
            </div>
          </div>
        )}

        {modo !== 'escolha' && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button type="button" variant="ghost" className="gap-1.5" onClick={() => setModo('escolha')} disabled={salvando}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button type="button" onClick={criar} disabled={!podeCriar || salvando} className="gap-2">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar e continuar o cadastro
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
