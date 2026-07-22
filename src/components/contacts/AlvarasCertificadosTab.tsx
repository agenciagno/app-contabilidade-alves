import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInDays, format } from 'date-fns';
import { Plus, Upload, Loader2, Download, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { abrirDocumentoViaEdge } from '@/lib/documento-baixar';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  contactId: string;
}

function ValidadeBadge({ data }: { data: string }) {
  const dias = differenceInDays(new Date(data + 'T00:00:00'), new Date());
  if (dias < 30) return <Badge variant="destructive">⚠ Vence em {dias} dias</Badge>;
  if (dias <= 60) return (
    <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
      Vence em {dias} dias
    </Badge>
  );
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
      {format(new Date(data + 'T00:00:00'), 'dd/MM/yyyy')}
    </Badge>
  );
}

// ===================== ALVARÁS =====================
interface Alvara {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_at: string;
}

export function AlvarasSection({ contactId }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Alvara | null>(null);
  const [form, setForm] = useState({
    rotulo: '', validade: '', observacao: '', file: null as File | null,
  });
  const [uploading, setUploading] = useState(false);

  const { data: alvaras, isLoading } = useQuery({
    queryKey: ['contact-alvaras', contactId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contact_documents')
        .select('*')
        .eq('contact_id', contactId)
        .eq('category', 'alvara')
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!form.file) throw new Error('Selecione um arquivo');
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('company_id')
        .eq('user_id', user!.id).single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const fileName = `${contactId}/alvara-${Date.now()}-${form.file.name}`;
      const { error: upErr } = await supabase.storage
        .from('contact-documents').upload(fileName, form.file);
      if (upErr) throw upErr;

      const displayName = form.rotulo || form.file.name;
      const ext = form.file.name.split('.').pop()?.toUpperCase() || null;

      const { error } = await (supabase as any)
        .from('contact_documents')
        .insert({
          company_id: profile.company_id,
          contact_id: contactId,
          file_name: form.validade
            ? `${displayName} [validade:${form.validade}]${form.observacao ? ` [obs:${form.observacao}]` : ''}`
            : `${displayName}${form.observacao ? ` [obs:${form.observacao}]` : ''}`,
          file_url: fileName,
          file_type: ext,
          file_size: form.file.size,
          category: 'alvara',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-alvaras', contactId] });
      toast.success('Alvará adicionado');
      setDialogOpen(false);
      setForm({ rotulo: '', validade: '', observacao: '', file: null });
    },
    onError: (e: any) => toast.error(e?.message || 'Falha ao enviar alvará'),
    onSettled: () => setUploading(false),
  });

  const remove = useMutation({
    mutationFn: async (a: Alvara) => {
      await supabase.storage.from('contact-documents').remove([a.file_url]);
      const { error } = await (supabase as any)
        .from('contact_documents').delete().eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-alvaras', contactId] });
      toast.success('Alvará removido');
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Falha ao excluir'),
  });

  const download = async (a: Alvara) => {
    await abrirDocumentoViaEdge('contact-documents', a.file_url);
  };


  const parseMeta = (name: string) => {
    const validadeMatch = name.match(/\[validade:(\d{4}-\d{2}-\d{2})\]/);
    const obsMatch = name.match(/\[obs:([^\]]+)\]/);
    const clean = name.replace(/\s*\[validade:[^\]]+\]/, '').replace(/\s*\[obs:[^\]]+\]/, '').trim();
    return { rotulo: clean, validade: validadeMatch?.[1], obs: obsMatch?.[1] };
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Alvarás
        </CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar Alvará
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !alvaras || alvaras.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum alvará cadastrado.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rótulo</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alvaras.map((a: any) => {
                  const meta = parseMeta(a.file_name);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{meta.rotulo}</TableCell>
                      <TableCell>
                        {meta.validade ? <ValidadeBadge data={meta.validade} /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {meta.obs || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => download(a)} title="Baixar">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setToDelete(a)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar Alvará</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Rótulo / descrição</Label>
                <Input value={form.rotulo} onChange={(e) => setForm({ ...form, rotulo: e.target.value })} placeholder="Ex: Alvará de Funcionamento 2025" />
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea rows={3} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Anexo (PDF ou imagem)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                />
                <Button variant="outline" type="button" className="w-full" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {form.file ? form.file.name : 'Selecionar arquivo'}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => { setUploading(true); upload.mutate(); }}
                disabled={uploading || !form.file}
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir alvará?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => toDelete && remove.mutate(toDelete)}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
