import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Copy, Download, ExternalLink, Eye, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { DsBadge } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { abrirDocumentoViaEdge } from '@/lib/documento-baixar';
import {
  CertificateRow, statusVisual, useRevelarSenhaCertificado,
} from '@/hooks/useCertificates';

interface Props {
  contactId: string;
}

/**
 * Certificado digital do cliente dentro da aba Acessos (12/10/2026). Só leitura: o cadastro, a renovação e a exclusão
 * continuam na tela Procurações e Certificados — aqui ficam validade, senha e arquivo à mão, junto dos outros acessos.
 * Traz o e-CNPJ da empresa e os e-CPF dos sócios cadastrados para este cliente.
 */
export function CertificadoDigitalSection({ contactId }: Props) {
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();
  const podeVer = isModuleVisible('cadastro') && isSubItemVisible('cadastro', 'cadastros_certificados');

  const { data: certs, isLoading, isError } = useQuery({
    // Prefixo 'certificates': salvar/renovar na tela de Certificados invalida esta lista junto.
    queryKey: ['certificates', 'contato', contactId],
    enabled: podeVer,
    queryFn: async (): Promise<CertificateRow[]> => {
      const { data, error } = await supabase
        .from('certificates')
        .select('*, contact_partners:partner_id (id, name, cpf)')
        .eq('contact_id', contactId)
        .eq('status', 'ativo')
        .order('data_validade', { ascending: false });
      if (error) throw error;
      // e-CNPJ da empresa primeiro, depois os e-CPF dos sócios.
      return ((data ?? []) as unknown as CertificateRow[]).sort(
        (a, b) => Number(!!a.partner_id) - Number(!!b.partner_id),
      );
    },
  });

  const revelar = useRevelarSenhaCertificado();
  const [revelado, setRevelado] = useState<{ id: string; senha: string | null } | null>(null);
  const [acao, setAcao] = useState<string | null>(null);

  if (!podeVer) return null;

  const handleRevelar = async (c: CertificateRow) => {
    setAcao(`${c.id}:rev`);
    try {
      const senha = await revelar.mutateAsync({ certificate_id: c.id, acao: 'REVELAR' });
      setRevelado({ id: c.id, senha });
      setTimeout(() => setRevelado((cur) => (cur?.id === c.id ? null : cur)), 5000);
    } catch {
      toast.error('Sem permissão ou senha não cadastrada');
    } finally {
      setAcao(null);
    }
  };

  const handleCopiar = async (c: CertificateRow) => {
    setAcao(`${c.id}:cp`);
    try {
      const senha = await revelar.mutateAsync({ certificate_id: c.id, acao: 'COPIAR' });
      if (!senha) { toast.error('Senha não cadastrada'); return; }
      await navigator.clipboard.writeText(senha);
      toast.success('Senha copiada!');
    } catch {
      toast.error('Sem permissão ou senha não cadastrada');
    } finally {
      setAcao(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Certificado Digital
        </CardTitle>
        <Button size="sm" variant="outline" asChild>
          <Link to="/dashboard-federal/procuracoes?aba=certificados">
            <ExternalLink className="h-4 w-4 mr-1" /> Gerenciar certificados
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
            Não foi possível carregar o certificado digital. Tente novamente.
          </div>
        ) : !certs || certs.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum certificado digital cadastrado para este cliente.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titular</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Autoridade</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Senha</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certs.map((c) => {
                  const st = statusVisual(c);
                  const aberta = revelado?.id === c.id;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.partner_id ? (c.contact_partners?.name ?? 'Sócio') : 'Empresa'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.tipo_pessoa === 'PJ' ? 'e-CNPJ' : 'e-CPF'} · {c.modelo}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.autoridade_certificadora ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <DsBadge tone={st.tone}>{format(new Date(`${c.data_validade}T00:00:00`), 'dd/MM/yyyy')}</DsBadge>
                          <span className="text-xs text-muted-foreground">
                            {st.dias < 0 ? `venceu há ${Math.abs(st.dias)} dias` : `vence em ${st.dias} dias`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">
                            {aberta ? (revelado!.senha ?? 'não cadastrada') : '••••••••'}
                          </span>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7" title="Revelar"
                            onClick={() => handleRevelar(c)} disabled={acao === `${c.id}:rev`}
                          >
                            {acao === `${c.id}:rev`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7" title="Copiar"
                            onClick={() => handleCopiar(c)} disabled={acao === `${c.id}:cp`}
                          >
                            {acao === `${c.id}:cp`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.anexo_url ? (
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7" title="Baixar arquivo"
                            onClick={() => abrirDocumentoViaEdge('contact-documents', c.anexo_url!)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
