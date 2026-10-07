import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// --- Parsers por API ---

function parseCnpjWs(raw: any) {
  return {
    razao_social: raw.razao_social || null,
    nome_fantasia: raw.estabelecimento?.nome_fantasia || null,
    natureza_juridica: raw.natureza_juridica?.descricao || null,
    situacao_cadastral: raw.estabelecimento?.situacao_cadastral || null,
    data_abertura_receita: raw.estabelecimento?.data_inicio_atividade || null,
    cnae_principal: raw.estabelecimento?.atividade_principal
      ? {
          codigo: raw.estabelecimento.atividade_principal.id || raw.estabelecimento.atividade_principal.subclasse,
          descricao: raw.estabelecimento.atividade_principal.descricao,
        }
      : null,
    cnaes_secundarios: raw.estabelecimento?.atividades_secundarias?.map((a: any) => ({
      codigo: a.id || a.subclasse,
      descricao: a.descricao,
    })) || null,
    address: raw.estabelecimento?.logradouro || null,
    address_number: raw.estabelecimento?.numero || null,
    complemento: raw.estabelecimento?.complemento || null,
    neighborhood: raw.estabelecimento?.bairro || null,
    city: raw.estabelecimento?.cidade?.nome || null,
    state: raw.estabelecimento?.estado?.sigla || null,
    cep: raw.estabelecimento?.cep || null,
    phone: raw.estabelecimento?.ddd1 && raw.estabelecimento?.telefone1
      ? `(${raw.estabelecimento.ddd1}) ${raw.estabelecimento.telefone1}`
      : null,
    email: raw.estabelecimento?.email || null,
  };
}

function parseReceitaWs(raw: any) {
  return {
    razao_social: raw.nome || null,
    nome_fantasia: raw.fantasia || null,
    natureza_juridica: raw.natureza_juridica || null,
    situacao_cadastral: raw.situacao || null,
    data_abertura_receita: raw.abertura || null,
    cnae_principal: raw.atividade_principal
      ? {
          codigo: raw.atividade_principal.split(' - ')[0]?.trim(),
          descricao: raw.atividade_principal.split(' - ').slice(1).join(' - ')?.trim(),
        }
      : null,
    cnaes_secundarios: raw.atividades_secundarias?.map((a: any) => ({
      codigo: a.code,
      descricao: a.text,
    })) || null,
    address: raw.logradouro || null,
    address_number: raw.numero || null,
    complemento: raw.complemento || null,
    neighborhood: raw.bairro || null,
    city: raw.municipio || null,
    state: raw.uf || null,
    cep: raw.cep?.replace(/[^\d]/g, '') || null,
    phone: raw.telefone || null,
    email: raw.email || null,
  };
}

function parseBrasilApi(raw: any) {
  const cnaePrincipal = raw.cnae_fiscal_descricao
    ? { codigo: String(raw.cnae_fiscal), descricao: raw.cnae_fiscal_descricao }
    : null;

  const cnaesSecundarios = raw.cnaes_secundarios?.map((a: any) => ({
    codigo: String(a.codigo),
    descricao: a.descricao,
  })) || null;

  const situacaoMap: Record<number, string> = {
    1: 'Nula', 2: 'Ativa', 3: 'Suspensa', 4: 'Inapta',
    5: 'Baixada', 8: 'Baixada',
  };

  return {
    razao_social: raw.razao_social || null,
    nome_fantasia: raw.nome_fantasia || null,
    natureza_juridica: raw.natureza_juridica || null,
    situacao_cadastral: situacaoMap[raw.situacao_cadastral] || String(raw.situacao_cadastral) || null,
    data_abertura_receita: raw.data_inicio_atividade || null,
    cnae_principal: cnaePrincipal,
    cnaes_secundarios: cnaesSecundarios,
    address: raw.logradouro || null,
    address_number: raw.numero || null,
    complemento: raw.complemento || null,
    neighborhood: raw.bairro || null,
    city: raw.municipio || null,
    state: raw.uf || null,
    cep: raw.cep ? String(raw.cep).replace(/[^\d]/g, '') : null,
    phone: raw.ddd_telefone_1
      ? `(${raw.ddd_telefone_1.substring(0, 2)}) ${raw.ddd_telefone_1.substring(2)}`
      : null,
    email: raw.email || null,
  };
}

// --- Providers ---

interface ProviderResult {
  data: any;
  source: string;
}

async function tryCnpjWs(cnpj: string): Promise<ProviderResult | null> {
  const res = await fetchWithTimeout(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  return { data: parseCnpjWs(raw), source: 'cnpj.ws' };
}

async function tryReceitaWs(cnpj: string): Promise<ProviderResult | null> {
  const res = await fetchWithTimeout(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  if (raw.status === 'ERROR') return null;
  return { data: parseReceitaWs(raw), source: 'receitaws' };
}

async function tryBrasilApi(cnpj: string): Promise<ProviderResult | null> {
  const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  return { data: parseBrasilApi(raw), source: 'brasilapi' };
}

// --- Handler ---

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { cnpj } = await req.json();

    if (!cnpj || typeof cnpj !== 'string') {
      return new Response(
        JSON.stringify({ error: 'CNPJ é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Remove apenas pontuação (mantém letras — CNPJ alfanumérico a partir de 31/07/2026, IN RFB 2.229/2024)
    const cnpjLimpo = cnpj.replace(/[.\-/\s]/g, '').toUpperCase();

    if (cnpjLimpo.length !== 14) {
      return new Response(
        JSON.stringify({ error: 'CNPJ deve ter 14 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const providers = [
      { name: 'cnpj.ws', fn: tryCnpjWs },
      { name: 'receitaws', fn: tryReceitaWs },
      { name: 'brasilapi', fn: tryBrasilApi },
    ];

    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const result = await provider.fn(cnpjLimpo);
        if (result) {
          return new Response(
            JSON.stringify({ ...result.data, _source: result.source }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        errors.push(`${provider.name}: CNPJ não encontrado`);
      } catch (e) {
        const msg = e instanceof DOMException && e.name === 'AbortError'
          ? `${provider.name}: timeout (${TIMEOUT_MS / 1000}s)`
          : `${provider.name}: ${String(e)}`;
        errors.push(msg);
      }
    }

    return new Response(
      JSON.stringify({
        error: 'Não foi possível consultar o CNPJ. Todas as APIs falharam.',
        details: errors,
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
