import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, MapPin, FileText, Building2, Pencil, Calendar, Users, Receipt } from 'lucide-react';
import { Contact } from '@/hooks/useContacts';
import { supabase } from '@/integrations/supabase/client';
import { ContactEditSheet } from './ContactEditSheet';
import { ContactBillingCard } from './ContactBillingCard';

type Section = 'contato' | 'endereco' | 'fiscal' | 'observacoes' | 'empresariais' | 'datas-esfera' | 'departamento-pessoal';

interface ContactDetailsTabProps {
  contact: Contact;
}

const taxRegimeLabels: Record<string, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  nao_aplica: 'Pessoa Física',
};

const fmt = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v));
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    return new Date(d.length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};
const fmtBool = (b: boolean | null | undefined) => (b ? 'Sim' : 'Não');
const fmtCnae = (c: any): string => {
  if (!c) return '—';
  if (typeof c === 'string') return c;
  if (typeof c === 'object') {
    const code = c.codigo ?? c.code ?? '';
    const desc = c.descricao ?? c.description ?? c.descricao_cnae ?? '';
    const result = [code, desc].filter(Boolean).join(' - ');
    return result || '—';
  }
  return '—';
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-foreground">—</span>;
  const map: Record<string, string> = {
    Ativo: 'bg-green-500/15 text-green-600',
    Inativo: 'bg-red-500/15 text-red-600',
    Prospect: 'bg-yellow-500/15 text-yellow-600',
    'Em Processo de Abertura': 'bg-blue-500/15 text-blue-600',
  };
  const cls = map[status] || 'bg-muted text-foreground';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <p className="text-foreground">{children}</p>
    </div>
  );
}

export function ContactDetailsTab({ contact }: ContactDetailsTabProps) {
  const [editSection, setEditSection] = useState<Section | null>(null);

  const { data: profiles } = useQuery({
    queryKey: ['profiles-active-for-contact'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('status_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const responsibleName = contact.responsible_id
    ? profiles?.find((p) => p.id === contact.responsible_id)?.full_name
    : null;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Card 1 — Dados Empresariais */}
      <Card className="bg-card border-border/50 md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Dados Empresariais
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditSection('empresariais')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Razão Social">{fmt(contact.razao_social)}</Field>
          <Field label="Nome Fantasia">{fmt(contact.nome_fantasia)}</Field>
          <Field label="CNPJ">{fmt(contact.document)}</Field>
          <Field label="CNAE Principal">{fmtCnae(contact.cnae_principal)}</Field>
          <Field label="Natureza Jurídica">{fmt(contact.natureza_juridica)}</Field>
          <Field label="Situação Cadastral">{fmt(contact.situacao_cadastral)}</Field>
          <Field label="Porte">{fmt(contact.porte)}</Field>
          <Field label="Data Abertura RF">{fmtDate(contact.data_abertura_receita)}</Field>
          <Field label="Tipo Estabelecimento">{fmt(contact.tipo_estabelecimento)}</Field>
          <Field label="Status do Cliente">
            <StatusBadge status={contact.status_cliente} />
          </Field>
          <Field label="Tipo de Cliente">{fmt(contact.tipo_cliente)}</Field>
          <Field label="Grupo do Escritório">{fmt(contact.grupo_escritorio)}</Field>
          <Field label="Data Início Contrato">{fmtDate(contact.data_inicio_contrato)}</Field>
          <Field label="Data Saída do Cliente">{fmtDate(contact.data_saida_cliente)}</Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-xs text-muted-foreground">Categorias</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {contact.categorias && contact.categorias.length > 0 ? (
                contact.categorias.map((cat) => (
                  <Badge key={cat} variant="secondary" className="capitalize">
                    {cat}
                  </Badge>
                ))
              ) : (
                <p className="text-foreground">—</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Contato */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Contato
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditSection('contato')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Nome">{fmt(contact.name)}</Field>
          <Field label="E-mail">{fmt(contact.email)}</Field>
          <Field label="Segundo E-mail">{fmt(contact.segundo_email_contato)}</Field>
          <Field label="Telefone">{fmt(contact.phone)}</Field>
          <Field label="WhatsApp">{fmt(contact.whatsapp)}</Field>
          <Field label="Representante Legal">{fmt(contact.representative_legal)}</Field>
        </CardContent>
      </Card>

      {/* Card 3 — Endereço */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Endereço
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditSection('endereco')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="CEP">{fmt(contact.cep)}</Field>
          <Field label="Logradouro">{fmt(contact.address)}</Field>
          <Field label="Número">{fmt(contact.address_number)}</Field>
          <Field label="Complemento">{fmt(contact.complemento)}</Field>
          <Field label="Bairro">{fmt(contact.neighborhood)}</Field>
          <Field label="Cidade">{fmt(contact.city)}</Field>
          <Field label="Estado">{fmt(contact.state)}</Field>
        </CardContent>
      </Card>

      {/* Card 4 — Dados Fiscais */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Dados Fiscais
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditSection('fiscal')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Regime Tributário">
            {contact.tax_regime ? taxRegimeLabels[contact.tax_regime] || contact.tax_regime : '—'}
          </Field>
          <Field label="Inscrição Estadual">{fmt(contact.ie)}</Field>
          <Field label="Inscrição Municipal">{fmt(contact.im)}</Field>
          <Field label="Regime de Apuração">{fmt(contact.regime_apuracao)}</Field>
          <Field label="Nº Alvará">{fmt(contact.numero_alvara)}</Field>
          <Field label="Validade Alvará">{fmtDate(contact.validade_alvara)}</Field>
          <Field label="Status">{contact.is_active ? 'Ativo' : 'Inativo'}</Field>
          <Field label="Colaborador Responsável">{responsibleName || '—'}</Field>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
            <Field label="Registro de Entradas">{fmtBool(contact.registro_entradas)}</Field>
            <Field label="Registro de Saídas">{fmtBool(contact.registro_saidas)}</Field>
            <Field label="Registro ICMS">{fmtBool(contact.registro_icms)}</Field>
            <Field label="Inventário">{fmtBool(contact.inventario)}</Field>
          </div>
        </CardContent>
      </Card>

      {/* Configurações de Cobrança */}
      <ContactBillingCard contact={contact} />

      {/* Card 5 — Datas por Esfera */}
      <Card className="bg-card border-border/50 md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Datas por Esfera
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditSection('datas-esfera')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Esfera</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Abertura</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Encerramento</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Junta Comercial', open: contact.data_abertura_junta, close: contact.data_encerramento_junta },
                  { label: 'Receita Federal', open: contact.data_abertura_rf, close: contact.data_encerramento_rf },
                  { label: 'Prefeitura', open: contact.data_abertura_prefeitura, close: contact.data_encerramento_prefeitura },
                  { label: 'Estado', open: contact.data_abertura_estado, close: contact.data_encerramento_estado },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-border/30 last:border-0">
                    <td className="py-2 px-3 text-foreground">{row.label}</td>
                    <td className="py-2 px-3 text-foreground">{fmtDate(row.open)}</td>
                    <td className="py-2 px-3 text-foreground">{fmtDate(row.close)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Card 6 — Departamento Pessoal */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Departamento Pessoal
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditSection('departamento-pessoal')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Possui Funcionários">{fmtBool(contact.possui_funcionarios)}</Field>
          {contact.possui_funcionarios && (
            <Field label="Nº Funcionários">{fmt(contact.numero_funcionarios)}</Field>
          )}
          <Field label="Tipo Cartão Ponto">{fmt(contact.tipo_cartao_ponto)}</Field>
          <Field label="Medicina do Trabalho">{fmtBool(contact.medicina_trabalho)}</Field>
          <Field label="Grupo CIPA">{fmt(contact.grupo_cipa)}</Field>
        </CardContent>
      </Card>

      {/* Card 7 — Observações */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Observações
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditSection('observacoes')}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-foreground whitespace-pre-wrap">
            {contact.notes || 'Nenhuma observação cadastrada'}
          </p>
        </CardContent>
      </Card>

      {editSection && (
        <ContactEditSheet
          contact={contact}
          section={editSection}
          open={!!editSection}
          onOpenChange={(open) => !open && setEditSection(null)}
        />
      )}
    </div>
  );
}
