import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, User, Mail, Phone, Copy, Users, X, FileText, LayoutGrid, List, Pencil, Trash2, Building2, CalendarDays, FolderOpen } from 'lucide-react';
import { useContacts, Contact, ContactInsert, TAX_REGIME_LABELS } from '@/hooks/useContacts';
import { useTransactions } from '@/hooks/useTransactions';
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog';
import { ContactBulkEditDialog } from '@/components/contacts/ContactBulkEditDialog';
import { useToast } from '@/hooks/use-toast';
import { NewClients2026Tab } from '@/components/contacts/NewClients2026Tab';
import { useUserRole } from '@/hooks/useUserRole';
import { maskPhone } from '@/lib/utils';
import { getContactDisplayName } from '@/lib/contact-display';
import { useAllFiscalProfiles } from '@/hooks/useCollaboratorCoverage';
import { EmpresaCard } from '@/components/contacts/EmpresaCard';
import { PageHeader } from '@/components/ds';


type ViewMode = 'card' | 'list';

/** Contador da linha de resumo: ponto + número + o que ele conta. */
function Contador({ tom, valor, label }: { tom: string; valor: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-[7px] w-[7px] shrink-0 rounded-pill ${tom}`} />
      <span className="text-ui-strong text-ink">{valor}</span>
      <span className="text-meta text-muted-ink">{label}</span>
    </span>
  );
}

const ARCHIVED_STATUSES = ['Encerrado', 'Ex-cliente'];
const isArchivedContact = (c: Contact) => ARCHIVED_STATUSES.includes(((c as any).status_cliente || '').toString());

export default function Contacts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin, isAdmin } = useUserRole();
  const { contacts, isLoading, createContact, updateContact, deleteContact } = useContacts();
  const { transactions } = useTransactions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatusCliente, setFilterStatusCliente] = useState('all');
  const [filterCategoria, setFilterCategoria] = useState('all');
  const [filterRegime, setFilterRegime] = useState('all');
  const [filterResponsible, setFilterResponsible] = useState('all');
  const { data: fiscalProfiles = [] } = useAllFiscalProfiles();

  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const canBulkAction = isSuperAdmin || isAdmin;

  const getFinancialStatus = (contactId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const contactTransactions = transactions.filter(t => t.contact_id === contactId);
    // O card mostra "3 títulos vencidos", não só devendo/em dia — mesma regra de
    // antes (não pago e vencido), só que contada em vez de reduzida a booleano.
    const vencidos = contactTransactions.filter(t => !t.is_paid && t.due_date && t.due_date < today).length;
    return { isInadimplente: vencidos > 0, titulosVencidos: vencidos };
  };

  const summaryStats = useMemo(() => {
    const total = contacts.length;
    let adimplentes = 0;
    let inadimplentes = 0;
    contacts.forEach(contact => {
      const { isInadimplente } = getFinancialStatus(contact.id);
      if (isInadimplente) inadimplentes++;
      else adimplentes++;
    });
    return { total, adimplentes, inadimplentes };
  }, [contacts, transactions]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        (getContactDisplayName(c) || '').toLowerCase().includes(q) ||
        (c.razao_social || '').toLowerCase().includes(q) ||
        (c.nome_fantasia || '').toLowerCase().includes(q) ||
        (c.document || '').toLowerCase().includes(q);
      let matchesStatusCliente = true;
      if (filterStatusCliente !== 'all') {
        matchesStatusCliente = (c.status_cliente || '') === filterStatusCliente;
      }
      let matchesCategoria = true;
      if (filterCategoria !== 'all') {
        const cats = (c.categorias || []).map(x => (x || '').toLowerCase());
        matchesCategoria = cats.includes(filterCategoria);
      }
      let matchesRegime = true;
      if (filterRegime !== 'all') {
        const regime = ((c as any).tax_regime || '').toString().toLowerCase().trim();
        if (filterRegime === 'ausente') {
          matchesRegime = regime === '';
        } else if (filterRegime === 'nao_aplica') {
          matchesRegime = regime === 'nao_aplica' || regime === 'isento';
        } else {
          matchesRegime = regime === filterRegime;
        }
      }

      let matchesResponsible = true;
      if (filterResponsible !== 'all') {
        const rid = (c as any).responsible_id ?? null;
        matchesResponsible = filterResponsible === 'none' ? !rid : rid === filterResponsible;
      }

      return matchesSearch && matchesStatusCliente && matchesCategoria && matchesRegime && matchesResponsible && !isArchivedContact(c);
    }).sort((a, b) => getContactDisplayName(a).localeCompare(getContactDisplayName(b), 'pt-BR', { sensitivity: 'base' }));
  }, [contacts, searchTerm, filterStatusCliente, filterCategoria, filterRegime, filterResponsible, transactions]);

  const archivedContacts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return contacts.filter(c => {
      if (!isArchivedContact(c)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (getContactDisplayName(c) || '').toLowerCase().includes(q) ||
        (c.razao_social || '').toLowerCase().includes(q) ||
        (c.nome_fantasia || '').toLowerCase().includes(q) ||
        (c.document || '').toLowerCase().includes(q)
      );
    }).sort((a, b) => getContactDisplayName(a).localeCompare(getContactDisplayName(b), 'pt-BR', { sensitivity: 'base' }));
  }, [contacts, searchTerm]);

  const activeContacts = filteredContacts.filter(c => c.is_active);
  const inactiveContacts = filteredContacts.filter(c => !c.is_active);
  const hasActiveFilters = searchTerm || filterStatusCliente !== 'all' || filterCategoria !== 'all' || filterRegime !== 'all' || filterResponsible !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatusCliente('all');
    setFilterCategoria('all');
    setFilterRegime('all');
    setFilterResponsible('all');
  };


  const toggleSelectContact = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredContacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredContacts.map(c => c.id));
    }
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      deleteContact.mutate(id);
    }
    setSelectedIds([]);
    setBulkDeleteOpen(false);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copiado!`, duration: 2000 });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const handleSubmit = (data: ContactInsert) => {
    if (editingContact) {
      updateContact.mutate({ id: editingContact.id, originalContact: editingContact, ...data }, {
        onSuccess: () => { setDialogOpen(false); setEditingContact(undefined); }
      });
    } else {
      createContact.mutate(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleNew = () => { setEditingContact(undefined); setDialogOpen(true); };
  const goToProfile = (contact: Contact) => navigate(`/crm/cliente/${contact.id}`);

  if (isLoading) {
    return <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
    </div>;
  }

  const categoriaBadgeClass: Record<string, string> = {
    cliente: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/15',
    fornecedor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/15',
    colaborador: 'bg-ok/10 text-ok dark:text-ok border-ok/20 hover:bg-ok/15',
    outros: 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
  };
  const categoriaLabel: Record<string, string> = {
    cliente: 'Cliente',
    fornecedor: 'Fornecedor',
    colaborador: 'Colaborador',
    outros: 'Outros',
  };

  const CategoryBadges = ({ contact }: { contact: Contact }) => {
    const cats = (contact.categorias || []).map(x => (x || '').toLowerCase()).filter(c => categoriaLabel[c]);
    if (cats.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {cats.map(c => (
          <Badge key={c} variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-medium ${categoriaBadgeClass[c]}`}>
            {categoriaLabel[c]}
          </Badge>
        ))}
      </div>
    );
  };

  const ContactCard = ({ contact }: { contact: Contact }) => {
    const responsavel = fiscalProfiles.find(p => p.id === contact.responsible_id)?.full_name;
    return (
      <EmpresaCard
        nome={getContactDisplayName(contact)}
        razaoSocial={contact.razao_social}
        documento={contact.document}
        regime={contact.tax_regime ? TAX_REGIME_LABELS[contact.tax_regime] ?? contact.tax_regime : null}
        porte={contact.porte}
        responsavel={responsavel}
        status={contact.status_cliente}
        inativo={!contact.is_active}
        onAbrir={() => goToProfile(contact)}
        onNomeClick={(e) => {
          e.stopPropagation();
          copyToClipboard(getContactDisplayName(contact), 'Nome');
        }}
      />
    );
  };

  const ContactTableSection = ({ contacts: list, label, showCheckbox = true }: { contacts: Contact[]; label: string; showCheckbox?: boolean }) => (
    <>
      <TableRow className="hover:bg-transparent border-0">
        <TableCell colSpan={canBulkAction && showCheckbox ? 6 : 5} className="py-2 px-4">
          <span className="text-xs font-medium text-muted-foreground">{label} ({list.length})</span>
        </TableCell>
      </TableRow>
      {list.map(contact => {
        const { isInadimplente } = getFinancialStatus(contact.id);
        return (
          <TableRow
            key={contact.id}
            className={`cursor-pointer hover:bg-muted/40 ${!contact.is_active ? 'opacity-60' : ''}`}
            onClick={() => goToProfile(contact)}
          >
            {canBulkAction && showCheckbox && (
              <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.includes(contact.id)}
                  onCheckedChange={() => toggleSelectContact(contact.id)}
                />
              </TableCell>
            )}
            <TableCell className="font-medium">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(getContactDisplayName(contact), 'Nome'); }}
                  className="group flex items-center gap-2 hover:text-primary transition-colors text-left"
                >
                  <span>{getContactDisplayName(contact)}</span>
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                </button>
                <CategoryBadges contact={contact} />
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {contact.document ? (
                <button onClick={(e) => { e.stopPropagation(); copyToClipboard(contact.document!, 'CPF/CNPJ'); }} className="group flex items-center gap-1 hover:text-primary transition-colors">
                  {contact.document}
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : <span className="text-muted-foreground/30">—</span>}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {contact.phone ? (
                <button onClick={(e) => { e.stopPropagation(); copyToClipboard(contact.phone!, 'Telefone'); }} className="group flex items-center gap-1 hover:text-primary transition-colors">
                  {maskPhone(contact.phone)}
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : <span className="text-muted-foreground/30">—</span>}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {contact.email ? (
                <button onClick={(e) => { e.stopPropagation(); copyToClipboard(contact.email!, 'E-mail'); }} className="group flex items-center gap-1 hover:text-primary transition-colors">
                  {contact.email}
                  <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : <span className="text-muted-foreground/30">—</span>}
            </TableCell>
            <TableCell>
              <div
                className={`h-2.5 w-2.5 rounded-full ${isInadimplente ? 'bg-destructive' : 'bg-ok'}`}
                title={isInadimplente ? 'Inadimplente' : 'Adimplente'}
              />
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );

  return (
    <div className="space-y-6">
      {/*
        Título "Empresas." vem do Figma e resolve uma divergência que existia:
        o menu já dizia "Empresas" enquanto a tela dizia "Clientes & Fornecedores".
      */}
      <PageHeader
        kicker="~/cadastros"
        title="Empresas."
        subtitle={`${summaryStats.total} contatos · ${summaryStats.adimplentes} adimplentes · ${summaryStats.inadimplentes} com título vencido.`}
      />

      <Tabs defaultValue="clientes" className="space-y-4">
        {/* Abas com underline e ícone, como no protótipo — não pills */}
        <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-line bg-transparent p-0">
          <TabsTrigger
            value="clientes"
            className="h-11 gap-[7px] rounded-none border-b-2 border-transparent px-3.5 text-nav text-muted-ink data-[state=active]:border-ink data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-none"
          >
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
            Contatos
          </TabsTrigger>
          <TabsTrigger
            value="entrada-2026"
            className="h-11 gap-[7px] rounded-none border-b-2 border-transparent px-3.5 text-nav text-muted-ink data-[state=active]:border-ink data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-none"
          >
            <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
            Entrada de clientes 2026
          </TabsTrigger>
          <TabsTrigger
            value="arquivados"
            className="h-11 gap-[7px] rounded-none border-b-2 border-transparent px-3.5 text-nav text-muted-ink data-[state=active]:border-ink data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-none"
          >
            <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
            Arquivados ({archivedContacts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clientes">
          <div className="space-y-6">
            <div className="flex items-center justify-end gap-2">
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)} className="border border-border rounded-md p-0.5">
                <ToggleGroupItem value="card" className="h-8 w-8 p-0" title="Visualização em cards">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" className="h-8 w-8 p-0" title="Visualização em lista">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <Button className="gap-2" onClick={handleNew}>
                <Plus className="w-4 h-4" />
                Novo Cliente/Fornecedor
              </Button>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou CNPJ..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 bg-card border-border"
                />
              </div>
              <Select value={filterStatusCliente} onValueChange={setFilterStatusCliente}>
                <SelectTrigger className="w-[140px] h-9 bg-card border-border">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Suspenso">Suspenso</SelectItem>
                  <SelectItem value="Inativo">Inativa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="w-[160px] h-9 bg-card border-border">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  <SelectItem value="cliente">Clientes</SelectItem>
                  <SelectItem value="fornecedor">Fornecedores</SelectItem>
                  <SelectItem value="colaborador">Colaboradores</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRegime} onValueChange={setFilterRegime}>
                <SelectTrigger className="w-[180px] h-9 bg-card border-border">
                  <SelectValue placeholder="Regime Tributário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os regimes</SelectItem>
                  <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  <SelectItem value="mei">MEI</SelectItem>
                  <SelectItem value="nao_aplica">Isento / Não contribuinte</SelectItem>
                  <SelectItem value="ausente">Ausente / Não informado</SelectItem>

                </SelectContent>
              </Select>
              <Select value={filterResponsible} onValueChange={setFilterResponsible}>
                <SelectTrigger className="w-[200px] h-9 bg-card border-border">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos responsáveis</SelectItem>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {fiscalProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                  Limpar
                </Button>
              )}
            </div>

            {/* Linha de contadores do protótipo: rótulo + número + o que ele conta */}
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-kicker uppercase text-muted-ink-2">Ativos</span>
              <Contador tom="bg-muted-ink-2" valor={summaryStats.total} label="total" />
              <Contador tom="bg-ok" valor={summaryStats.adimplentes} label="adimplentes" />
              <Contador tom="bg-danger" valor={summaryStats.inadimplentes} label="inadimplentes" />
            </div>

            {/* Card View */}
            {viewMode === 'card' && (
              <>
                {activeContacts.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {activeContacts.map(contact => <ContactCard key={contact.id} contact={contact} />)}
                  </div>
                )}
                {inactiveContacts.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">Inativos ({inactiveContacts.length})</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {inactiveContacts.map(contact => <ContactCard key={contact.id} contact={contact} />)}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Bulk Action Bar */}
            {canBulkAction && selectedIds.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <span className="text-sm font-medium text-foreground">{selectedIds.length} selecionado(s)</span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkEditOpen(true)}>
                  <Pencil className="w-3.5 h-3.5" />
                  Editar Selecionados
                </Button>
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Selecionados
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && filteredContacts.length > 0 && (
              <Card className="bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canBulkAction && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedIds.length === filteredContacts.length && filteredContacts.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                      )}
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead className="w-10">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeContacts.length > 0 && (
                      <ContactTableSection contacts={activeContacts} label="Ativos" />
                    )}
                    {inactiveContacts.length > 0 && (
                      <ContactTableSection contacts={inactiveContacts} label="Inativos" />
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}

            {filteredContacts.length === 0 && (
              <Card className="bg-card">
                <CardContent className="text-muted-foreground text-center py-16">
                  {hasActiveFilters ? 'Nenhum cliente/fornecedor encontrado com os filtros aplicados' : 'Nenhum cliente/fornecedor cadastrado ainda'}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="entrada-2026">
          <NewClients2026Tab contacts={contacts} />
        </TabsContent>

        <TabsContent value="arquivados">
          <div className="space-y-6">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 bg-card border-border"
              />
            </div>

            {archivedContacts.length === 0 ? (
              <Card className="bg-card">
                <CardContent className="text-muted-foreground text-center py-16">
                  Nenhum contato arquivado (status Encerrado ou Ex-cliente)
                </CardContent>
              </Card>
            ) : viewMode === 'card' ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {archivedContacts.map(contact => <ContactCard key={contact.id} contact={contact} />)}
              </div>
            ) : (
              <Card className="bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead className="w-10">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <ContactTableSection contacts={archivedContacts} label="Arquivados" showCheckbox={false} />
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ContactFormDialog open={dialogOpen} onOpenChange={setDialogOpen} contact={editingContact} onSubmit={handleSubmit} isLoading={createContact.isPending || updateContact.isPending} />

      {/* Bulk Edit Dialog */}
      <ContactBulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedIds={selectedIds}
        onDone={() => setSelectedIds([])}
      />

      {/* Bulk Delete Confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.length} cliente(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os clientes selecionados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">
              Excluir {selectedIds.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
