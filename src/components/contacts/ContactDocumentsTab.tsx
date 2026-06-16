import { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  FileSpreadsheet,
  FileImage,
  File,
  Folder,
  Eye,
  ArrowLeft,
  FileSignature,
  Receipt,
  Users,
  FileCheck,
  Plus,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { 
  useContactDocuments, 
  ContactDocument, 
  DocumentCategory, 
  DOCUMENT_CATEGORIES 
} from '@/hooks/useContactDocuments';
import { DocumentPreviewDialog } from './DocumentPreviewDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactDocumentsTabProps {
  contactId: string;
}

const getCategoryIcon = (category: DocumentCategory) => {
  const icons: Record<DocumentCategory, JSX.Element> = {
    atos_constitutivos: <FileSignature className="h-8 w-8" />,
    impostos_guias: <Receipt className="h-8 w-8" />,
    fiscal: <FileSpreadsheet className="h-8 w-8" />,
    dp_rh: <Users className="h-8 w-8" />,
    certidoes: <FileCheck className="h-8 w-8" />,
  };
  return icons[category];
};

const getFileIcon = (fileType: string | null) => {
  const type = fileType?.toLowerCase();
  if (type === 'pdf') return <FileText className="h-4 w-4 text-red-500" />;
  if (['xls', 'xlsx', 'csv'].includes(type || '')) return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type || '')) return <FileImage className="h-4 w-4 text-blue-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
};

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function ContactDocumentsTab({ contactId }: ContactDocumentsTabProps) {
  const { 
    documents, 
    isLoading, 
    uploadDocument, 
    deleteDocument, 
    downloadDocument,
    getPreviewUrl,
    getDocumentsByCategory,
    getDocumentCounts,
  } = useContactDocuments(contactId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<ContactDocument | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('atos_constitutivos');
  const [previewDocument, setPreviewDocument] = useState<ContactDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const documentCounts = getDocumentCounts();
  const categoryDocuments = selectedCategory ? getDocumentsByCategory(selectedCategory) : [];
  const selectedCategoryLabel = DOCUMENT_CATEGORIES.find(c => c.value === selectedCategory)?.label;

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    for (const file of Array.from(files)) {
      await uploadDocument.mutateAsync({ 
        file, 
        contactId, 
        category: selectedCategory || uploadCategory 
      });
    }
    setUploadSuccess(true);
    setTimeout(() => setUploadSuccess(false), 2000);
    setUploadDialogOpen(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFileSelect(e.dataTransfer.files);
  };

  const handleConfirmDelete = async () => {
    if (documentToDelete) {
      await deleteDocument.mutateAsync(documentToDelete);
      setDocumentToDelete(null);
    }
  };

  const handlePreview = async (doc: ContactDocument) => {
    setPreviewDocument(doc);
    const url = await getPreviewUrl(doc);
    setPreviewUrl(url);
  };

  const handleClosePreview = () => {
    setPreviewDocument(null);
    setPreviewUrl(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Breadcrumb and Upload Button */}
      <div className="flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {selectedCategory ? (
                <BreadcrumbLink 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); setSelectedCategory(null); }}
                  className="flex items-center gap-1.5"
                >
                  <Folder className="h-4 w-4" />
                  Documentos
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="flex items-center gap-1.5">
                  <Folder className="h-4 w-4" />
                  Documentos
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {selectedCategory && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{selectedCategoryLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <Button onClick={() => setUploadDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Upload
        </Button>
      </div>

      {/* Category Grid or File List */}
      {!selectedCategory ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {DOCUMENT_CATEGORIES.map((category) => (
            <Card 
              key={category.value}
              className="cursor-pointer hover:bg-muted/50 transition-colors border-border/50"
              onClick={() => setSelectedCategory(category.value)}
            >
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="p-3 bg-primary/10 rounded-xl mb-3 text-primary">
                  {getCategoryIcon(category.value)}
                </div>
                <h3 className="font-medium text-sm">{category.label}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {documentCounts[category.value]} arquivo{documentCounts[category.value] !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setSelectedCategory(null)}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          {/* Dropzone */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
          />
          <div
            onClick={() => !uploadDocument.isPending && !uploadSuccess && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-all duration-300
              ${uploadDocument.isPending ? 'cursor-not-allowed border-border bg-muted/30' :
                uploadSuccess ? 'cursor-default border-emerald-500/50 bg-emerald-500/5' :
                isDragging ? 'cursor-pointer border-primary bg-primary/5' : 
                'cursor-pointer border-border hover:border-primary/50 hover:bg-muted/50'
              }
            `}
          >
            {uploadDocument.isPending ? (
              <>
                <Loader2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground animate-spin" />
                <p className="text-sm font-medium text-muted-foreground">Realizando upload...</p>
              </>
            ) : uploadSuccess ? (
              <>
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 animate-bounce" />
                <p className="text-sm font-medium text-emerald-500">Upload concluído!</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Arraste arquivos aqui ou clique para fazer upload
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, DOC, XLS, PNG, JPG (máx. 10MB) - Categoria: {selectedCategoryLabel}
                </p>
              </>
            )}
          </div>

          {/* Files Table */}
          <Card className="border-border/50">
            <CardContent className="p-0">
              {categoryDocuments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Data Upload</TableHead>
                      <TableHead>Tamanho</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryDocuments.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getFileIcon(doc.file_type)}
                            <span className="font-medium truncate max-w-[200px]" title={doc.file_name}>
                              {doc.file_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {format(new Date(doc.uploaded_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFileSize(doc.file_size)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePreview(doc)}
                              title="Visualizar"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => downloadDocument(doc)}
                              title="Baixar"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDocumentToDelete(doc)}
                              className="text-destructive hover:text-destructive"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum documento nesta categoria</p>
                  <p className="text-sm mt-1">Arraste arquivos ou clique para fazer upload</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Dialog (when clicking from root) */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload de Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Categoria</label>
              <Select 
                value={uploadCategory} 
                onValueChange={(v) => setUploadCategory(v as DocumentCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <input
              type="file"
              id="upload-input"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
            />
            <div
              onClick={() => !uploadDocument.isPending && !uploadSuccess && document.getElementById('upload-input')?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300
                ${uploadDocument.isPending ? 'cursor-not-allowed border-border bg-muted/30' :
                  uploadSuccess ? 'cursor-default border-emerald-500/50 bg-emerald-500/5' :
                  'cursor-pointer border-border hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              {uploadDocument.isPending ? (
                <>
                  <Loader2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground animate-spin" />
                  <p className="text-sm font-medium text-muted-foreground">Realizando upload...</p>
                </>
              ) : uploadSuccess ? (
                <>
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500 animate-bounce" />
                  <p className="text-sm font-medium text-emerald-500">Upload concluído!</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Clique para selecionar arquivos
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOC, XLS, PNG, JPG (máx. 10MB)
                  </p>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <DocumentPreviewDialog
        document={previewDocument}
        previewUrl={previewUrl}
        onClose={handleClosePreview}
        onDownload={downloadDocument}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!documentToDelete} onOpenChange={() => setDocumentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o arquivo "{documentToDelete?.file_name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
