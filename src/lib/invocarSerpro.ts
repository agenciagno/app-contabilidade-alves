import { supabase } from '@/integrations/supabase/client';

/**
 * Chama uma edge function do Serpro. Respostas 4xx/5xx chegam sem corpo no `error` do supabase-js:
 * aqui o motivo que o servidor mandou vira a mensagem do erro.
 */
export async function invocarSerpro<T>(funcao: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcao, { body });
  if (error) {
    let motivo = error.message;
    try {
      const corpo = await (error as { context?: Response }).context?.json();
      if (corpo?.error) motivo = corpo.error;
    } catch { /* corpo não é JSON */ }
    throw new Error(motivo);
  }
  return data as T;
}
