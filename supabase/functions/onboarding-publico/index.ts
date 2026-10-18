// Link do cliente (onboarding, 17/10/2026). Página pública /c/<token>, sem login: tudo passa por aqui, com service role,
// e cada ação confere o token. Deploy SEM verificação de JWT (o cliente não tem sessão).
//
//   ver        { token }                                          dados da página: documentos pedidos e, se liberada, as boas-vindas
//   upload     { token, documento_id, nome, tipo, tamanho }       URL assinada para o navegador subir o arquivo direto no bucket privado
//   confirmar  { token, documento_id, caminho, nome, tamanho }    registra o arquivo enviado e marca o documento como "enviado"
//
// O cliente só vê o próprio nome, a lista e o que a equipe escreveu. Nunca recebe caminho de outro cliente nem dado de cadastro.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = 'onboarding-documentos';
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ARQUIVOS_POR_DOC = 10;
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'arquivo';

const REGIME_ROTULO: Record<string, string> = {
  simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real',
  mei: 'MEI', imune: 'Imune', isento: 'Isento',
};
const CANAL_ROTULO: Record<string, string> = { whatsapp: 'WhatsApp', email: 'e-mail', impresso: 'impresso', whatsapp_email: 'WhatsApp e e-mail' };

/** "day_20" → "todo dia 20"; "bday_5" → "5º dia útil"; "last_business_day" → "último dia útil". */
function vencimento(regra: string | null): string | null {
  if (!regra) return null;
  let m = regra.match(/^day_(\d+)$/);
  if (m) return `todo dia ${m[1]}`;
  m = regra.match(/^bday_(\d+)$/);
  if (m) return `${m[1]}º dia útil`;
  if (regra === 'last_business_day') return 'último dia útil';
  return null;
}

interface Link {
  id: string; company_id: string; contact_id: string; prazo_envio: string | null; boas_vindas_liberada: boolean; criado_por: string | null;
}

async function linkDoToken(token: unknown): Promise<Link | null> {
  if (typeof token !== 'string' || !/^[a-f0-9]{32,80}$/.test(token)) return null;
  const { data } = await admin
    .from('onboarding_links')
    .select('id, company_id, contact_id, prazo_envio, boas_vindas_liberada, criado_por, revogado_em')
    .eq('token', token)
    .maybeSingle();
  if (!data || data.revogado_em) return null;
  return data as Link;
}

const envioAberto = (l: Link) => !l.prazo_envio || l.prazo_envio >= hojeBR();

async function ver(link: Link) {
  const [{ data: contato }, { data: docs }, { data: textos }] = await Promise.all([
    admin.from('contacts')
      .select('name, display_name, nome_fantasia, tax_regime, boleto_value, boleto_due_day, canal_entrega, recebe_das_ca, recebe_guia_dctfweb_ca, responsible_id, dp_responsible_id, financeiro_responsible_id, contabil_responsible_id')
      .eq('id', link.contact_id).single(),
    admin.from('onboarding_documentos')
      .select('id, titulo, descricao, status, observacao, ordem, onboarding_documento_arquivos(nome, enviado_em)')
      .eq('contact_id', link.contact_id).neq('status', 'dispensado').order('ordem'),
    admin.from('onboarding_textos').select('chave, conteudo').eq('company_id', link.company_id),
  ]);
  if (!contato) return json({ error: 'Link inválido' }, 404);
  const texto: Record<string, string> = Object.fromEntries((textos ?? []).map(t => [t.chave, t.conteudo]));

  let boasVindas = null;
  if (link.boas_vindas_liberada) {
    const regime = contato.tax_regime as string | null;
    const setores: [string, string | null][] = [
      ['Fiscal', contato.responsible_id], ['Departamento Pessoal', contato.dp_responsible_id],
      ['Financeiro', contato.financeiro_responsible_id], ['Contábil', contato.contabil_responsible_id],
    ];
    const ids = setores.map(([, id]) => id).filter(Boolean) as string[];
    const [{ data: pessoas }, { data: obrigacoes }] = await Promise.all([
      ids.length ? admin.from('profiles').select('id, full_name').in('id', ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      admin.from('client_obligations')
        .select('fiscal_obligations_catalog(name, due_rule, active)')
        .eq('contact_id', link.contact_id).eq('active', true),
    ]);
    const nome = new Map((pessoas ?? []).map(p => [p.id, p.full_name]));
    const chaveImposto = regime && ['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei'].includes(regime) ? regime : 'outros';
    boasVindas = {
      regime: regime ? REGIME_ROTULO[regime] ?? null : null,
      time: setores.filter(([, id]) => id && nome.get(id)).map(([setor, id]) => ({ setor, nome: nome.get(id!) })),
      obrigacoes: (obrigacoes ?? [])
        .map((o: any) => o.fiscal_obligations_catalog)
        .filter((c: any) => c && c.active !== false)
        .map((c: any) => ({ nome: c.name, vencimento: vencimento(c.due_rule) }))
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome)),
      guias: [contato.recebe_das_ca ? 'DAS' : null, contato.recebe_guia_dctfweb_ca ? 'Guia da DCTFWeb (INSS)' : null].filter(Boolean),
      canal: contato.canal_entrega ? CANAL_ROTULO[contato.canal_entrega] ?? null : null,
      honorario: contato.boleto_value ? { valor: Number(contato.boleto_value), dia: contato.boleto_due_day ?? null } : null,
      imposto: texto[`imposto_${chaveImposto}`] ?? null,
      reforma: regime ? texto[`rt_${regime}`] ?? null : null,
    };
  }

  return json({
    cliente: { nome: (contato.display_name || contato.nome_fantasia || contato.name || '').trim() },
    textos: {
      pre_intro: texto.pre_intro ?? '', pos_intro: texto.pos_intro ?? '', contato_escritorio: texto.contato_escritorio ?? '',
      pos_o_que_mandar: texto.pos_o_que_mandar ?? '', pos_honorario: texto.pos_honorario ?? '',
    },
    envio: { aberto: envioAberto(link), prazo: link.prazo_envio },
    documentos: (docs ?? []).map((d: any) => ({
      id: d.id, titulo: d.titulo, descricao: d.descricao, status: d.status, observacao: d.observacao,
      arquivos: (d.onboarding_documento_arquivos ?? []).map((a: any) => ({ nome: a.nome, enviado_em: a.enviado_em })),
    })),
    boas_vindas: boasVindas,
  });
}

async function documentoDoLink(link: Link, documentoId: unknown) {
  if (typeof documentoId !== 'string') return null;
  const { data } = await admin.from('onboarding_documentos').select('id, status, titulo')
    .eq('id', documentoId).eq('contact_id', link.contact_id).maybeSingle();
  return data;
}

async function upload(link: Link, p: Record<string, unknown>) {
  if (!envioAberto(link)) return json({ error: 'O prazo para envio terminou. Fale com a gente pelo WhatsApp.' }, 400);
  const doc = await documentoDoLink(link, p.documento_id);
  if (!doc) return json({ error: 'Documento não encontrado' }, 404);
  if (doc.status === 'aprovado' || doc.status === 'dispensado') return json({ error: 'Este documento já foi recebido.' }, 400);
  const tamanho = Number(p.tamanho);
  if (!tamanho || tamanho > MAX_BYTES) return json({ error: 'Arquivo grande demais (máximo 15 MB).' }, 400);
  if (!TIPOS.includes(String(p.tipo))) return json({ error: 'Envie PDF ou foto (JPG, PNG, HEIC).' }, 400);
  const { count } = await admin.from('onboarding_documento_arquivos').select('id', { count: 'exact', head: true }).eq('documento_id', doc.id);
  if ((count ?? 0) >= MAX_ARQUIVOS_POR_DOC) return json({ error: 'Limite de arquivos para este documento.' }, 400);

  const caminho = `${link.company_id}/${link.contact_id}/${doc.id}/${Date.now()}-${slug(String(p.nome || 'arquivo'))}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error || !data) return json({ error: 'Não foi possível preparar o envio. Tente de novo.' }, 500);
  return json({ caminho, token: data.token });
}

async function confirmar(link: Link, p: Record<string, unknown>) {
  const doc = await documentoDoLink(link, p.documento_id);
  if (!doc) return json({ error: 'Documento não encontrado' }, 404);
  const caminho = String(p.caminho || '');
  const pasta = `${link.company_id}/${link.contact_id}/${doc.id}/`;
  if (!caminho.startsWith(pasta) || caminho.includes('..')) return json({ error: 'Arquivo inválido' }, 400);
  const nomeArquivo = caminho.slice(pasta.length);
  const { data: lista } = await admin.storage.from(BUCKET).list(pasta.slice(0, -1), { search: nomeArquivo, limit: 5 });
  if (!lista?.some(o => o.name === nomeArquivo)) return json({ error: 'O arquivo não chegou. Tente enviar de novo.' }, 400);

  const { error } = await admin.from('onboarding_documento_arquivos').upsert({
    company_id: link.company_id, documento_id: doc.id, caminho,
    nome: String(p.nome || nomeArquivo).slice(0, 200), tamanho: Number(p.tamanho) || null,
  }, { onConflict: 'caminho', ignoreDuplicates: true });
  if (error) return json({ error: 'Não foi possível registrar o arquivo.' }, 500);
  await admin.from('onboarding_documentos')
    .update({ status: 'enviado', enviado_em: new Date().toISOString(), observacao: null, updated_at: new Date().toISOString() })
    .eq('id', doc.id).in('status', ['pendente', 'enviado']);

  // Aviso no sino de quem gerou o link (um por cliente a cada 30 minutos, para não encher com 10 fotos seguidas).
  if (link.criado_por) {
    const desde = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true })
      .eq('type', 'onboarding_documento').eq('reference_id', link.contact_id).gte('created_at', desde);
    if (!count) {
      const { data: c } = await admin.from('contacts').select('name, display_name').eq('id', link.contact_id).single();
      await admin.from('notifications').insert({
        user_id: link.criado_por, company_id: link.company_id, type: 'onboarding_documento',
        title: `${(c?.display_name || c?.name || 'Cliente').trim()} enviou documentos`,
        body: `Chegou: ${doc.titulo}. Confira no Super Perfil, em Link do cliente.`,
        action_url: `/crm/cliente/${link.contact_id}?aba=link`, reference_type: 'contact', reference_id: link.contact_id,
      });
    }
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const p = await req.json().catch(() => ({})) as Record<string, unknown>;
    const link = await linkDoToken(p.token);
    if (!link) return json({ error: 'Link inválido ou desativado. Fale com a Contabilidade Alves.' }, 404);
    switch (p.action) {
      case 'ver': return await ver(link);
      case 'upload': return await upload(link, p);
      case 'confirmar': return await confirmar(link, p);
      default: return json({ error: 'Ação desconhecida' }, 400);
    }
  } catch (e) {
    console.error('onboarding-publico', e);
    return json({ error: 'Erro inesperado. Tente de novo em instantes.' }, 500);
  }
});
