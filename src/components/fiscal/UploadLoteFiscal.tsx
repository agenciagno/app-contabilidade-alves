import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { DsAlert, DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useContacts } from '@/hooks/useContacts';
import {
  baixarPlanilhaLote, useClassifyBatch, useFiscalClassificationBatches,
} from '@/hooks/useFiscalClassification';
import { getContactDisplayName } from '@/lib/contact-display';

const STATUS_LABEL: Record<string, string> = {
  processando: 'Processando',
  concluido: 'Concluído',
  erro: 'Erro',
};

async function baixarArquivo(path: string, nomeArquivo: string) {
  const url = await baixarPlanilhaLote(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
}

export function UploadLoteFiscal() {
  const { toast } = useToast();
  const { contacts } = useContacts();
  const classificarLote = useClassifyBatch();
  const { lotes, isLoading: carregandoLotes } = useFiscalClassificationBatches();

  const [contactId, setContactId] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [colDescricao, setColDescricao] = useState('');
  const [colNcm, setColNcm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clientes = useMemo(
    () => contacts.filter((c) => c.is_active && c.type === 'cliente'),
    [contacts],
  );
  const podeProcessar = contactId && colDescricao && rows.length > 0 && !classificarLote.isPending;

  const handleFile = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    if (!parsedRows.length) {
      toast({ title: 'Planilha sem dados', variant: 'destructive' });
      return;
    }

    setNomeArquivo(file.name);
    setHeaders(Object.keys(parsedRows[0]));
    setRows(parsedRows);
    setColDescricao('');
    setColNcm('');
  };

  const processar = () => {
    const itens = rows.map((row) => ({
      descricao: colDescricao ? String(row[colDescricao] ?? '').trim() || undefined : undefined,
      ncm: colNcm ? String(row[colNcm] ?? '').trim() || undefined : undefined,
      linha_original: row,
    }));

    classificarLote.mutate(
      { contactId, itens },
      {
        onSuccess: (r) => {
          toast({
            title: 'Lote processado',
            description: `${r.resolvidos_automaticamente} de ${r.total_itens} resolvidos automaticamente.`,
          });
        },
        onError: (e: Error) =>
          toast({ title: 'Erro ao processar lote', description: e.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Classificar planilha de estoque</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{getContactDisplayName(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Planilha (.xlsx ou .csv)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {nomeArquivo || 'Escolher arquivo'}
            </Button>
          </div>

          {rows.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Qual coluna tem a descrição do produto?</Label>
                  <Select value={colDescricao} onValueChange={setColDescricao}>
                    <SelectTrigger><SelectValue placeholder="Selecione a coluna" /></SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Qual coluna já tem o NCM? (opcional)</Label>
                  <Select value={colNcm} onValueChange={setColNcm}>
                    <SelectTrigger><SelectValue placeholder="Nenhuma / não tem" /></SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-meta text-muted-ink-2">{rows.length} produtos encontrados na planilha.</p>

              {classificarLote.isPending && (
                <DsAlert tone="info" title="Processando..." description="Pode levar alguns minutos para planilhas grandes." />
              )}

              <Button onClick={processar} disabled={!podeProcessar}>
                {classificarLote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Processar {rows.length} produtos
              </Button>
            </>
          )}

          {classificarLote.data && (
            <DsAlert
              tone="ok"
              title={`${classificarLote.data.resolvidos_automaticamente} de ${classificarLote.data.total_itens} resolvidos automaticamente`}
              description={
                classificarLote.data.precisam_revisao > 0
                  ? `${classificarLote.data.precisam_revisao} produtos precisam de revisão manual — marcados na planilha.`
                  : undefined
              }
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => baixarArquivo(classificarLote.data!.arquivo_resultado_path, `classificacao-${classificarLote.data!.batch_id}.xlsx`)}
                >
                  <Download className="h-4 w-4" /> Baixar planilha
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-3 text-ui-strong text-ink">Lotes processados</h3>
        <div className="overflow-hidden rounded-lg border border-line bg-paper">
          {carregandoLotes ? (
            <Skeleton className="h-40 w-full" />
          ) : lotes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lote processado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotes.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{getContactDisplayName(l.contacts) || '—'}</TableCell>
                    <TableCell className="text-sm">{l.total_itens}</TableCell>
                    <TableCell>
                      <DsBadge tone={l.status === 'concluido' ? 'ok' : l.status === 'erro' ? 'danger' : 'neutral'}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </DsBadge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(l.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.arquivo_resultado_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Baixar planilha"
                          onClick={() => baixarArquivo(l.arquivo_resultado_path!, `classificacao-${l.id}.xlsx`)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
