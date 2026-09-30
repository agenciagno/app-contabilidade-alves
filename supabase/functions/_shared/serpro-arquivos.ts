// PDFs do Serpro (vêm em base64) guardados em bucket privado; o acesso é só por link assinado de 10 minutos.
// Usado pela função serpro-defis (as funções serpro-pgdasd e serpro-pagamentos ainda têm cópia própria, já testada em produção).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function bytesDeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const ehPdf = (b: Uint8Array) => b.length > 100 && String.fromCharCode(...b.slice(0, 4)) === "%PDF";

/** Guarda um PDF (base64) no bucket. Devolve o caminho, ou null se o arquivo não for um PDF válido. */
export async function guardarPdf(supabase: SupabaseClient, bucket: string, path: string, b64: unknown): Promise<string | null> {
  if (typeof b64 !== "string" || !b64) return null;
  let bytes: Uint8Array;
  try { bytes = bytesDeBase64(b64); } catch { return null; }
  if (!ehPdf(bytes)) return null;
  const up = await supabase.storage.from(bucket).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  return up.error ? null : path;
}

export async function assinar(supabase: SupabaseClient, bucket: string, path: string, nome: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600, { download: nome });
  return error || !data?.signedUrl ? null : data.signedUrl;
}
