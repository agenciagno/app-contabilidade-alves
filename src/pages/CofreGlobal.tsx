import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Copy, Eye, Loader2, LockKeyhole, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { useCofreGlobal, CofreGlobalRow } from '@/hooks/useCofreGlobal';
import {
  PORTAL_LABELS,
  PortalTipo,
  useRevelarSenha,
} from '@/hooks/useAcessosCliente';

const PORTAL_ORDER: PortalTipo[] = [
  'gov_br',
  'ecac',
  'siare',
  'prefeitura_nfse',
  'sefaz_estadual',
  'certificado_digital',
  'esocial',
  'outros',
];

const PORTAL_SHORT: Record<PortalTipo, string> = {
  gov_br: 'GOV.BR',
  ecac: 'eCac',
  siare: 'SIARE',
  prefeitura_nfse: 'Prefeitura/NFS-e',
  sefaz_estadual: 'SEFAZ',
  certificado_digital: 'Cert. Digital',
  esocial: 'e-Social',
  conectividade_social: 'Conect. Social',
  outros: 'Outros',
};

interface ClienteAgrupado {
  contact_id: string;
  nome_cliente: string;
  acessos: Partial<Record<PortalTipo, CofreGlobalRow>>;
  temAlerta: boolean;
}

export default function CofreGlobal() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const podeAcessar = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (!roleLoading && !podeAcessar) {
      toast.error('Você não tem permissão para acessar esta área.');
      navigate('/');
    }
  }, [roleLoading, podeAcessar, navigate]);

  const { data, isLoading, isError } = useCofreGlobal();
  const revelar = useRevelarSenha();

  const [search, setSearch] = useState('');
  const [portaisSelecionados, setPortaisSelecionados] = useState<PortalTipo[]>(PORTAL_ORDER);
  const [apenasAlertas, setApenasAlertas] = useState(false);
  const [popoverState, setPopoverState] = useState<{ key: string; senha: string } | null>(
    null
  );
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Auto-fechar popover em 5s
  useEffect(() => {
    if (!popoverState) return;
    const t = setTimeout(() => setPopoverState(null), 5000);
    return () => clearTimeout(t);
  }, [popoverState]);

  const clientes = useMemo<ClienteAgrupado[]>(() => {
    if (!data) return [];
    const map = new Map<string, ClienteAgrupado>();
    for (const row of data) {
      let entry = map.get(row.contact_id);
      if (!entry) {
        entry = {
          contact_id: row.contact_id,
          nome_cliente: row.nome_cliente,
          acessos: {},
          temAlerta: false,
        };
        map.set(row.contact_id, entry);
      }
      entry.acessos[row.portal] = row;
      if (row.alerta_vencimento) entry.temAlerta = true;
    }
    return Array.from(map.values());
  }, [data]);

  const clientesFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientes.filter((c) => {
      if (apenasAlertas && !c.temAlerta) return false;
      if (q && !c.nome_cliente.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, search, apenasAlertas]);

  const colunasVisiveis = PORTAL_ORDER.filter((p) => portaisSelecionados.includes(p));

  const handleRevelar = async (row: CofreGlobalRow) => {
    const key = row.acesso_id + ':rev';
    setLoadingAction(key);
    try {
      const senha = await revelar.mutateAsync({ acesso_id: row.acesso_id, acao: 'REVELAR' });
      setPopoverState({ key: row.acesso_id, senha });
    } catch {
      toast.error('Sem permissão ou senha não cadastrada');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopiar = async (row: CofreGlobalRow) => {
    const key = row.acesso_id + ':cp';
    setLoadingAction(key);
    try {
      const senha = await revelar.mutateAsync({ acesso_id: row.acesso_id, acao: 'COPIAR' });
      await navigator.clipboard.writeText(senha);
      toast.success('Senha copiada!');
    } catch {
      toast.error('Sem permissão ou senha não cadastrada');
    } finally {
      setLoadingAction(null);
    }
  };

  const togglePortal = (p: PortalTipo) => {
    setPortaisSelecionados((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]
    );
  };

  if (!podeAcessar) return null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-xl">
          <LockKeyhole className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Acessos</h1>
          <p className="text-sm text-muted-foreground">
            Credenciais de todos os clientes ativos
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Portais ({portaisSelecionados.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Colunas de portais</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PORTAL_ORDER.map((p) => (
              <DropdownMenuCheckboxItem
                key={p}
                checked={portaisSelecionados.includes(p)}
                onCheckedChange={() => togglePortal(p)}
              >
                {PORTAL_LABELS[p]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <Switch
            id="alertas"
            checked={apenasAlertas}
            onCheckedChange={setApenasAlertas}
          />
          <Label htmlFor="alertas" className="text-sm cursor-pointer">
            Apenas com alertas
          </Label>
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar. Tente novamente.
        </div>
      ) : clientesFiltrados.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente ativo com acessos cadastrados.
        </div>
      ) : (
        <TooltipProvider delayDuration={150}>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[220px]">
                    Cliente
                  </TableHead>
                  {colunasVisiveis.map((p) => (
                    <TableHead key={p} className="text-center min-w-[120px]">
                      {PORTAL_SHORT[p]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesFiltrados.map((c) => (
                  <TableRow key={c.contact_id}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium">
                      <Link
                        to={`/crm/cliente/${c.contact_id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {c.nome_cliente}
                      </Link>
                    </TableCell>
                    {colunasVisiveis.map((p) => {
                      const acc = c.acessos[p];
                      if (!acc) {
                        return (
                          <TableCell key={p} className="text-center text-muted-foreground/50">
                            —
                          </TableCell>
                        );
                      }
                      const alerta = acc.alerta_vencimento;
                      const isOpen = popoverState?.key === acc.acesso_id;
                      return (
                        <TableCell
                          key={p}
                          className={cn(
                            'text-center',
                            alerta && 'bg-destructive/10'
                          )}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center gap-1">
                                {alerta && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                )}
                                <Popover
                                  open={isOpen}
                                  onOpenChange={(o) => !o && setPopoverState(null)}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      disabled={loadingAction === acc.acesso_id + ':rev'}
                                      onClick={() => handleRevelar(acc)}
                                    >
                                      {loadingAction === acc.acesso_id + ':rev' ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Eye className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-3" align="center">
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground">
                                        Senha (fecha em 5s)
                                      </p>
                                      <p className="font-mono text-sm select-all">
                                        {popoverState?.senha}
                                      </p>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  disabled={loadingAction === acc.acesso_id + ':cp'}
                                  onClick={() => handleCopiar(acc)}
                                >
                                  {loadingAction === acc.acesso_id + ':cp' ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div>Login: {acc.login ?? '—'}</div>
                                {alerta && acc.validade_certificado && (
                                  <div className="text-destructive">
                                    Certificado vence em{' '}
                                    {new Date(
                                      acc.validade_certificado + 'T00:00:00'
                                    ).toLocaleDateString('pt-BR')}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
