import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, X, FileText, Image, File, Loader2 } from 'lucide-react';
import { TransactionAttachment } from '@/hooks/useTransactionAttachments';
import { abrirDocumentoViaEdge } from '@/lib/documento-baixar';


interface AttachmentUploadProps {
  attachments: TransactionAttachment[];
  pendingFiles: File[];
  onAddFiles: (files: File[]) => void;
  onRemovePendingFile: (index: number) => void;
  onDeleteAttachment: (attachment: TransactionAttachment) => void;
  isUploading?: boolean;
  compact?: boolean;
}

function getFileIcon(type: string | null) {
  if (!type) return <File className="w-4 h-4" />;
  if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
  if (type.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
  return <FileText className="w-4 h-4" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentUpload({
  attachments,
  pendingFiles,
  onAddFiles,
  onRemovePendingFile,
  onDeleteAttachment,
  isUploading,
  compact = false,
}: AttachmentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onAddFiles(files);
    }
  }, [onAddFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onAddFiles(files);
    }
    e.target.value = '';
  }, [onAddFiles]);

  const totalFiles = pendingFiles.length + attachments.length;

  // Compact version for inline display
  if (compact) {
    return (
      <div className="space-y-1">
        <div className="relative">
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2 h-10"
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
            {totalFiles > 0 ? `${totalFiles} arquivo(s)` : 'Anexar'}
          </Button>
        </div>
        
        {/* Compact file list */}
        {totalFiles > 0 && (
          <div className="space-y-1 max-h-20 overflow-y-auto">
            {pendingFiles.map((file, index) => (
              <div
                key={`pending-${index}`}
                className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1"
              >
                {getFileIcon(file.type)}
                <span className="flex-1 truncate">{file.name}</span>
                {isUploading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-destructive"
                    onClick={() => onRemovePendingFile(index)}
                  />
                )}
              </div>
            ))}
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1"
              >
                {getFileIcon(attachment.file_type)}
                <button
                  type="button"
                  onClick={() => abrirDocumentoViaEdge('transaction-attachments', attachment.file_url)}
                  className="flex-1 truncate text-left hover:text-primary"
                >
                  {attachment.file_name}
                </button>

                <X
                  className="w-3 h-3 cursor-pointer hover:text-destructive"
                  onClick={() => onDeleteAttachment(attachment)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full version (original)
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">Anexos</label>
      
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
      >
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center gap-2">
          <Paperclip className="w-6 h-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Arraste arquivos ou clique para anexar
          </p>
        </div>
      </div>

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Arquivos para enviar:</p>
          {pendingFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
            >
              {getFileIcon(file.type)}
              <span className="flex-1 text-sm truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onRemovePendingFile(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Existing attachments */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Arquivos anexados:</p>
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg"
            >
              {getFileIcon(attachment.file_type)}
              <a
                href={attachment.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm truncate hover:text-primary transition-colors"
              >
                {attachment.file_name}
              </a>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(attachment.file_size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => onDeleteAttachment(attachment)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
