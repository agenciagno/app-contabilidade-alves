import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Pencil, Trash2, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWhatsappChannels, useInvalidateWhatsappChannels, type WhatsappChannelRow } from '@/hooks/useSupportTickets';
import { PageHeader } from '@/components/ds';

const VISIBILIDADE_LABEL: Record<string, string> = {
  geral: 'Geral · todo cliente vê',
  carteira: 'Carteira CA · só cliente vinculado a um contato real',
};

export default function TechSuporteCanais() {
  const { isSuperAdmin, isLoading } = useUserRole();
  const { data: canais, isLoading: loadingCanais } = useWhatsappChannels();
  const invalidate = useInvalidateWhatsappChannels();

  const [editId, setEditId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [visibility, setVisibility] = useState('geral');
  const [sortOrder, setSortOrder] = useState('0');
  const [salvando, setSalvando] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WhatsappChannelRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (isLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const resetForm = () => {
    setEditId(null);
    setLabel('');
    setPhone('');
    setVisibility('geral');
    setSortOrder('0');
  };

  const editar = (c: WhatsappChannelRow) => {
    setEditId(c.id);
    setLabel(c.label);
    setPhone(c.phone);
    setVisibility(c.visibility);
    setSortOrder(String(c.sort_order));
  };

  const salvar = async () => {
    const labelTrim = label.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (!labelTrim) { toast.error('Informe o rótulo do canal.'); return; }
    if (phoneDigits.length < 10) { toast.error('Informe um número de WhatsApp válido, com DDI e DDD.'); return; }
    setSalvando(true);
    try {
      const payload = {
        label: labelTrim,
        phone: phoneDigits,
        visibility,
        sort_order: Number(sortOrder) || 0,
      };
      if (editId) {
        const { error } = await supabase
          .from('support_whatsapp_channels')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editId);
        if (error) throw error;
        toast.success('Canal atualizado.');
      } else {
        const { error } = await supabase.from('support_whatsapp_channels').insert(payload);
        if (error) throw error;
        toast.success('Canal criado.');
      }
      resetForm();
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar canal.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('support_whatsapp_channels').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Canal excluído.');
      if (editId === deleteTarget.id) resetForm();
      invalidate();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir canal.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/tech · suporte"
        title="Canais de WhatsApp."
        subtitle="Números que aparecem na tela de Suporte do cliente."
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editId ? 'Editar canal' : 'Novo canal'}</CardTitle>
            <CardDescription>
              "Carteira CA" só aparece pra quem tem empresa vinculada a um contato real da base
              contábil (<code className="text-xs">companies.contact_id</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="canal-label">Rótulo</Label>
              <Input
                id="canal-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Suporte, Fiscal, Financeiro"
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canal-phone">Número (com DDI e DDD)</Label>
              <Input
                id="canal-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5531999999999"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Visibilidade</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral · todo cliente vê</SelectItem>
                  <SelectItem value="carteira">Carteira CA · só cliente vinculado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="canal-ordem">Ordem</Label>
              <Input
                id="canal-ordem"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                inputMode="numeric"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editId ? 'Salvar alterações' : 'Salvar canal'}
              </Button>
              {editId && (
                <Button variant="outline" onClick={resetForm} disabled={salvando}>
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Canais cadastrados</CardTitle>
            <CardDescription>{canais?.length ?? 0} canal(is).</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCanais ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !canais || canais.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-6 w-6" />
                Nenhum canal cadastrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rótulo</TableHead>
                      <TableHead>Número</TableHead>
                      <TableHead>Visibilidade</TableHead>
                      <TableHead className="text-right">Ordem</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {canais.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.label}</TableCell>
                        <TableCell className="tabular-nums">{c.phone}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {VISIBILIDADE_LABEL[c.visibility] ?? c.visibility}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.sort_order}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => editar(c)} title="Editar canal">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(c)} title="Excluir canal">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir canal?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.label}</strong> da tela de Suporte de todo mundo que o vê.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
