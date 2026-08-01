// Alíquotas de referência de CBS/IBS, direto da API oficial da Receita Federal/Serpro.
//
// Por que uma edge function e não fetch do navegador:
//  1. O piloto (piloto-cbs.tributos.gov.br) não manda cabeçalho de CORS.
//  2. O ambiente bloqueia rajada de chamadas de forma silenciosa — devolve HTTP 200 com
//     uma página HTML de rejeição em vez de 429. Só olhar o status engana; é preciso
//     conferir o corpo. Centralizar aqui permite cache e uma única origem de chamadas.
//  3. Sendo piloto sem SLA, o front nunca pode ficar refém dele: falhou, cai no teto legal.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE = 'https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api';

// Teto legal da soma CBS+IBS (art. 18 da LC 214/2025) e a divisão de trabalho usada
// quando a API não responde. Só o teto é lei — o split ainda depende do Senado.
const FALLBACK = { cbs: 8.8, ibs: 17.7, fonte: 'teto_legal' as const };

const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 6 * 60 * 60 * 1000;

/** O piloto responde 200 com HTML quando bloqueia — status sozinho não basta. */
async function getJson(url: string) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const limpo = texto.trimStart();
  if (limpo.startsWith('<')) throw new Error('bloqueado pelo WAF (resposta HTML)');
  return JSON.parse(texto);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Exige usuário autenticado — a função não é aberta ao mundo.
    const auth = req.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'não autenticado' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      return new Response(JSON.stringify({ error: 'não autenticado' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const data: string = body.data ?? '2027-01-01';
    const chave = `aliq:${data}`;

    const emCache = cache.get(chave);
    if (emCache && Date.now() - emCache.at < TTL_MS) {
      return new Response(JSON.stringify(emCache.payload), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    let payload: Record<string, unknown>;
    try {
      // Uma chamada de cada vez, com respiro entre elas: o piloto pune rajada.
      const uniao = await getJson(`${BASE}/calculadora/dados-abertos/aliquota-uniao?data=${data}`);
      await new Promise((r) => setTimeout(r, 400));

      const cbs = Number(uniao?.aliquotaReferencia);
      if (!Number.isFinite(cbs)) throw new Error('resposta sem aliquotaReferencia');

      // A alíquota de IBS por UF/município do piloto ainda reflete a fase de transição
      // (valores simbólicos para 2027), então ela não serve como estimativa de carga.
      // Usamos o teto legal menos a CBS oficial: é o cenário máximo previsto em lei.
      const ibs = Math.max(0, 26.5 - cbs);

      payload = {
        cbs,
        ibs,
        fonte: 'api_oficial',
        data,
        aviso:
          'CBS obtida na API oficial da Receita Federal (ambiente piloto, valores ainda simulados). IBS estimado pelo teto legal de 26,5% (art. 18, LC 214/2025) menos a CBS.',
        consultadoEm: new Date().toISOString(),
      };
    } catch (e) {
      payload = {
        ...FALLBACK,
        data,
        aviso: `API oficial indisponível (${(e as Error).message}). Usando o teto legal de 26,5% da LC 214/2025 como cenário.`,
        consultadoEm: new Date().toISOString(),
      };
    }

    cache.set(chave, { at: Date.now(), payload });
    return new Response(JSON.stringify(payload), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ...FALLBACK, aviso: `Erro interno: ${(e as Error).message}` }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
