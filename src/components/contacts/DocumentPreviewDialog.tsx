import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X, FileText, FileSpreadsheet, File } from 'lucide-react';
import { ContactDocument } from '@/hooks/useContactDocuments';

interface DocumentPreviewDialogProps {
  document: ContactDocument | null;
  previewUrl: string | null;
  onClose: () => void;
  onDownload: (doc: ContactDocument) => void;
}

const isPreviewable = (fileType: string | null) => {
  const type = fileType?.toLowerCase();
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type || '');
};

const isImage = (fileType: string | null) => {
  const type = fileType?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type || '');
};

const getFileIcon = (fileType: string | null) => {
  const type = fileType?.toLowerCase();
  if (type === 'pdf') return <FileText className="h-16 w-16 text-red-500" />;
  if (['xls', 'xlsx', 'csv'].includes(type || '')) return <FileSpreadsheet className="h-16 w-16 text-emerald-500" />;
  return <File className="h-16 w-16 text-muted-foreground" />;
};

export function DocumentPreviewDialog({ 
  document, 
  previewUrl, 
  onClose, 
  onDownload 
}: DocumentPreviewDialogProps) {
  if (!document) return null;

  const canPreview = isPreviewable(document.file_type);
  const isImageFile = isImage(document.file_type);

  return (
    <Dialog open={!!document} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[85vh] max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate pr-4">{document.file_name}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(document)}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden rounded-lg bg-muted/50">
          {canPreview && previewUrl ? (
            isImageFile ? (
              <div className="h-full w-full flex items-center justify-center p-4">
                <img
                  src={previewUrl}
                  alt={document.file_name}
                  className="max-h-full max-w-full object-contain rounded-lg"
                />
              </div>
            ) : (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title={document.file_name}
              />
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              {getFileIcon(document.file_type)}
              <p className="mt-4 text-lg font-medium">{document.file_name}</p>
              <p className="text-muted-foreground mt-2">
                Preview não disponível para este tipo de arquivo
              </p>
              <Button
                variant="default"
                className="mt-4"
                onClick={() => onDownload(document)}
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar arquivo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
