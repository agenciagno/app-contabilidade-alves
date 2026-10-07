// Um login pode ter vários acessos — uma linha de `profiles` por empresa
// (migração 20261007110000). Com a service role, buscar o perfil por user_id
// devolve TODAS as linhas da pessoa (e `.single()` quebra); o acesso que vale
// é o ATIVO da sessão de quem chama.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Resultado<T> = { data: T | null; error: Error | null };

/**
 * Perfil do acesso ativo de quem chama. Lê com o token do próprio usuário:
 * o RLS de `profiles` só devolve a linha da empresa ativa da sessão.
 * `token` aceita "Bearer xxx" ou só o jwt.
 */
export async function perfilAtivo<T = any>(token: string, userId: string, colunas: string): Promise<Resultado<T>> {
  const jwt = (token ?? "").replace(/^Bearer\s+/i, "");
  const select = colunas.replace(/\s+/g, "");
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=${encodeURIComponent(select)}&user_id=eq.${encodeURIComponent(userId)}`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, Accept: "application/json" } },
    );
    if (!res.ok) return { data: null, error: new Error(`Perfil: HTTP ${res.status}`) };
    const linhas = (await res.json()) as T[];
    if (linhas.length !== 1) {
      return { data: null, error: new Error(linhas.length ? "Mais de um acesso ativo." : "Perfil não encontrado.") };
    }
    return { data: linhas[0], error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

/** Todas as linhas de acesso de uma pessoa (cliente com service role). */
export async function acessosDe<T = { company_id: string }>(
  admin: any,
  userId: string,
  colunas = "company_id",
): Promise<T[]> {
  const { data, error } = await admin.from("profiles").select(colunas).eq("user_id", userId);
  if (error) throw new Error("Falha ao ler acessos: " + error.message);
  return (data ?? []) as T[];
}

/**
 * Empresa do acesso a alterar: a informada; senão a única que a pessoa tem.
 * Com mais de um acesso e sem empresa informada, devolve null (quem chama
 * pede a empresa) — nunca escolhe sozinho.
 */
export function empresaDoAlvo(acessos: { company_id: string }[], informada?: string | null): string | null {
  if (informada) return acessos.some((a) => a.company_id === informada) ? informada : null;
  return acessos.length === 1 ? acessos[0].company_id : null;
}
