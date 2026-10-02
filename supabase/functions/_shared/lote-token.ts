// Chave de uso curto para RODADAS ÚNICAS aprovadas por Gabriel (ex.: rodada de atualização antes da primeira rodada agendada).
// Só o hash SHA-256 fica no banco (serpro_config.lote_token_hash, com validade em lote_token_expira); a chave em si é criada por quem tem acesso
// ao banco, vai no cabeçalho x-lote-token e é apagada depois da rodada. Sem chave válida, nada acontece.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function loteTokenValido(supabase: SupabaseClient, companyId: string, req: Request): Promise<boolean> {
  const token = req.headers.get("x-lote-token");
  if (!token) return false;
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token))))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: cfg } = await supabase.from("serpro_config").select("lote_token_hash,lote_token_expira").eq("company_id", companyId).maybeSingle();
  return !!cfg?.lote_token_hash && cfg.lote_token_hash === hash && !!cfg.lote_token_expira && Date.parse(cfg.lote_token_expira) > Date.now();
}
