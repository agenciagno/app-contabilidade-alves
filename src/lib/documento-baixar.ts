import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BaixarBucket = 'contact-documents' | 'transaction-attachments';

/**
 * Extrai o path (dentro do bucket) a partir de um valor que pode ser:
 * - Já o path (ex: "<contactId>/arquivo.pdf")
 * - Uma URL pública/assinada do Supabase Storage
 */
export function extractStoragePath(bucket: BaixarBucket, fileUrlOrPath: string): string {
  if (!fileUrlOrPath) return fileUrlOrPath;
  const marker = `/${bucket}/`;
  const idx = fileUrlOrPath.indexOf(marker);
  if (idx >= 0) {
    const rest = fileUrlOrPath.substring(idx + marker.length);
    // remove querystring de signed URL
    const q = rest.indexOf('?');
    return q >= 0 ? rest.substring(0, q) : rest;
  }
  return fileUrlOrPath;
}

/**
 * Chama a edge function `documento-baixar` que auditará o acesso e retornará
 * uma signed URL (60s). Retorna a URL em caso de sucesso, ou null.
 */
export async function baixarDocumentoUrl(
  bucket: BaixarBucket,
  pathOrUrl: string
): Promise<string | null> {
  const path = extractStoragePath(bucket, pathOrUrl);
  try {
    const { data, error } = await supabase.functions.invoke('documento-baixar', {
      body: { bucket, path },
    });
    if (error) {
      const msg = (error as any)?.message || 'Falha ao baixar documento';
      toast.error(msg);
      return null;
    }
    if (!data?.success || !data?.url) {
      const msg = (data as any)?.error || 'Falha ao baixar documento';
      toast.error(msg);
      return null;
    }
    return data.url as string;
  } catch (e: any) {
    toast.error(e?.message || 'Falha ao baixar documento');
    return null;
  }
}

/**
 * Baixa o arquivo via edge e abre a URL assinada em uma nova aba.
 */
export async function abrirDocumentoViaEdge(
  bucket: BaixarBucket,
  pathOrUrl: string
): Promise<void> {
  const url = await baixarDocumentoUrl(bucket, pathOrUrl);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
