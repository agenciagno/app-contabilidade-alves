// Enviar ao cliente (Gestão 360°, rodada 1). Um ponto só para o que a equipe manda ao cliente: e-mail, WhatsApp ou texto copiado,
// com ou sem documentos guardados. Substitui o "avisar" solto de cada tela; tudo cai em client_envios.
//
//   listar   { contact_id }   documentos já guardados do cliente (só PDF que existe de fato no bucket privado)
//   guardar_relatorio { contact_id, tipo: situacao|faturamento, periodo?, pdf_base64, resumo? }  guarda o PDF gerado pela tela (relatório para o cliente)
//   enviar   { contact_id, canal: email|whatsapp|copiar, mensagem, assunto?, documentos?: [{tipo, id}], origem, referencia? }
//            monta os links assinados (7 dias), manda o e-mail por aqui (API de e-mail da Hostinger) ou devolve o texto
//            final para a tela abrir o WhatsApp / copiar. O cliente nunca recebe caminho de bucket, só o link com validade.
//
// A tela nunca manda caminho de arquivo: manda (tipo, id do registro) e a função confere que o registro é do cliente.
// Não chama o Serpro e não custa nada: só lê o que já foi guardado.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { perfilAtivo } from "../_shared/acesso.ts";

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

const VALIDADE_LINK_S = 7 * 24 * 3600;
const MAX_DOCUMENTOS = 8;
const POR_TIPO = 12;

const dataBR = (iso: unknown) => String(iso ?? '').slice(0, 10).split('-').reverse().join('/');
const mesAno = (iso: unknown) => { const s = String(iso ?? ''); return /^\d{4}-\d{2}/.test(s) ? `${s.slice(5, 7)}/${s.slice(0, 4)}` : s; };
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

interface Spec {
  tabela: string;
  coluna: string;
  bucket: string;
  /** colunas de data/competência para ordenar e dar nome */
  extra: string;
  /** filtro fixo (coluna, valor): vários tipos podem morar na mesma tabela */
  onde?: [string, string];
  ordem: string;
  rotulo: (r: Record<string, unknown>) => string;
  data: (r: Record<string, unknown>) => string;
}

// Um tipo por coluna de PDF que o sistema já guarda. Bucket = o mesmo da função que gravou.
const DOCS: Record<string, Spec> = {
  sitfis: { tabela: 'serpro_sitfis', coluna: 'pdf_path', bucket: 'serpro-sitfis', extra: 'gerado_em', ordem: 'gerado_em',
    rotulo: (r) => `Situação fiscal (relatório de ${dataBR(r.gerado_em)})`, data: (r) => String(r.gerado_em ?? '') },
  pgdasd_recibo: { tabela: 'serpro_pgdasd_declaracoes', coluna: 'recibo_path', bucket: 'serpro-pgdasd', extra: 'periodo_apuracao', ordem: 'periodo_apuracao',
    rotulo: (r) => `Recibo do PGDAS-D ${mesAno(r.periodo_apuracao)}`, data: (r) => String(r.periodo_apuracao ?? '') },
  pgdasd_declaracao: { tabela: 'serpro_pgdasd_declaracoes', coluna: 'declaracao_path', bucket: 'serpro-pgdasd', extra: 'periodo_apuracao', ordem: 'periodo_apuracao',
    rotulo: (r) => `Declaração do PGDAS-D ${mesAno(r.periodo_apuracao)}`, data: (r) => String(r.periodo_apuracao ?? '') },
  pgdasd_das: { tabela: 'serpro_pgdasd_das', coluna: 'das_path', bucket: 'serpro-pgdasd', extra: 'periodo_apuracao', ordem: 'periodo_apuracao',
    rotulo: (r) => `DAS ${mesAno(r.periodo_apuracao)}`, data: (r) => String(r.periodo_apuracao ?? '') },
  dctfweb_recibo: { tabela: 'serpro_dctfweb', coluna: 'recibo_path', bucket: 'serpro-dctfweb', extra: 'competencia', ordem: 'competencia',
    rotulo: (r) => `Recibo da DCTFWeb ${mesAno(r.competencia)}`, data: (r) => String(r.competencia ?? '') },
  defis_recibo: { tabela: 'serpro_defis', coluna: 'recibo_path', bucket: 'serpro-pgdasd', extra: 'ano_calendario', ordem: 'ano_calendario',
    rotulo: (r) => `Recibo da DEFIS ${r.ano_calendario}`, data: (r) => `${r.ano_calendario}-12-31` },
  defis_declaracao: { tabela: 'serpro_defis', coluna: 'declaracao_path', bucket: 'serpro-pgdasd', extra: 'ano_calendario', ordem: 'ano_calendario',
    rotulo: (r) => `Declaração da DEFIS ${r.ano_calendario}`, data: (r) => `${r.ano_calendario}-12-31` },
  comprovante: { tabela: 'serpro_pagamentos', coluna: 'comprovante_path', bucket: 'serpro-comprovantes', extra: 'periodo_apuracao,tipo_sigla,comprovante_emitido_em', ordem: 'comprovante_emitido_em',
    rotulo: (r) => `Comprovante de pagamento ${r.tipo_sigla ? `${r.tipo_sigla} ` : ''}${mesAno(r.periodo_apuracao)}`.trim(), data: (r) => String(r.comprovante_emitido_em ?? r.periodo_apuracao ?? '') },
  relatorio_situacao: { tabela: 'client_relatorios', coluna: 'path', bucket: 'client-relatorios', extra: 'tipo,gerado_em', ordem: 'gerado_em', onde: ['tipo', 'situacao'],
    rotulo: (r) => `Relatório de Situação Fiscal (gerado em ${dataBR(r.gerado_em)})`, data: (r) => String(r.gerado_em ?? '') },
  relatorio_faturamento: { tabela: 'client_relatorios', coluna: 'path', bucket: 'client-relatorios', extra: 'tipo,gerado_em,periodo', ordem: 'gerado_em', onde: ['tipo', 'faturamento'],
    rotulo: (r) => `Relatório de Faturamento dos últimos 12 meses (até ${mesAno(r.periodo ? `${r.periodo}-01` : r.gerado_em)})`, data: (r) => String(r.gerado_em ?? '') },
  darf: { tabela: 'serpro_darfs', coluna: 'pdf_path', bucket: 'serpro-darf', extra: 'codigo_receita,data_pa,created_at', ordem: 'created_at',
    rotulo: (r) => `DARF ${r.codigo_receita ?? ''} ${r.data_pa ?? ''}`.trim(), data: (r) => String(r.created_at ?? '') },
};

async function equipeDe(req: Request) {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(bearer);
  if (!u?.user) return null;
  const { data: perfil } = await perfilAtivo(bearer, u.user.id, 'id, role, is_super_admin, company_id');
  if (!perfil) return null;
  const equipe = perfil.is_super_admin === true || perfil.role === 'admin' || perfil.role === 'colaborador';
  return equipe ? perfil : null;
}

async function contatoDaEquipe(perfil: { company_id: string; is_super_admin: boolean }, id: unknown) {
  const { data } = await admin.from('contacts').select('id, company_id, email, whatsapp, phone').eq('id', String(id ?? '')).maybeSingle();
  if (!data) return null;
  if (!perfil.is_super_admin && data.company_id !== perfil.company_id) return null;
  return data;
}

/** O Relatório de Faturamento leva a assinatura do contador: só sai para o cliente com o modelo validado (decisão de Gabriel, 01/10/2026). */
async function faturamentoLiberado(companyId: string): Promise<boolean> {
  const { data } = await admin.from('relatorio_config').select('faturamento_validado').eq('company_id', companyId).maybeSingle();
  return data?.faturamento_validado === true;
}

async function listar(contato: { id: string; company_id: string }) {
  const docs: { tipo: string; id: string; rotulo: string; data: string }[] = [];
  const liberado = await faturamentoLiberado(contato.company_id);
  await Promise.all(Object.entries(DOCS).map(async ([tipo, s]) => {
    if (tipo === 'relatorio_faturamento' && !liberado) return;
    let q = admin.from(s.tabela).select(`id, ${s.coluna}, ${s.extra}`)
      .eq('contact_id', contato.id).eq('company_id', contato.company_id).not(s.coluna, 'is', null);
    if (s.onde) q = q.eq(s.onde[0], s.onde[1]);
    const { data } = await q.order(s.ordem, { ascending: false }).limit(POR_TIPO);
    for (const r of (data ?? []) as Record<string, unknown>[]) docs.push({ tipo, id: String(r.id), rotulo: s.rotulo(r), data: s.data(r) });
  }));
  docs.sort((a, b) => b.data.localeCompare(a.data));
  return json({ ok: true, documentos: docs });
}

async function enviar(payload: Record<string, unknown>, perfil: { id: string }, contato: { id: string; company_id: string; email: string | null; whatsapp: string | null; phone: string | null }) {
  const canal = String(payload.canal ?? '');
  if (!['email', 'whatsapp', 'copiar'].includes(canal)) return json({ error: 'Canal inválido' }, 400);
  const texto = String(payload.mensagem ?? '').trim().slice(0, 4000);
  if (!texto) return json({ error: 'Escreva a mensagem ao cliente' }, 400);
  const origem = String(payload.origem ?? '').trim().slice(0, 40) || 'manual';
  const pedidos = Array.isArray(payload.documentos) ? (payload.documentos as { tipo?: unknown; id?: unknown }[]).slice(0, MAX_DOCUMENTOS) : [];

  // Documentos: o registro precisa ser do cliente; o link assinado vale 7 dias.
  const anexos: { tipo: string; rotulo: string; bucket: string; path: string; url: string }[] = [];
  for (const p of pedidos) {
    const spec = DOCS[String(p.tipo ?? '')];
    if (!spec) return json({ error: 'Tipo de documento inválido' }, 400);
    const { data: r } = await admin.from(spec.tabela).select(`id, contact_id, company_id, ${spec.coluna}, ${spec.extra}`).eq('id', String(p.id ?? '')).maybeSingle();
    const linha = r as Record<string, unknown> | null;
    if (!linha || linha.contact_id !== contato.id || linha.company_id !== contato.company_id || !linha[spec.coluna] || (spec.onde && linha[spec.onde[0]] !== spec.onde[1])) {
      return json({ error: 'Documento não encontrado para este cliente' }, 404);
    }
    if (String(p.tipo) === 'relatorio_faturamento' && !(await faturamentoLiberado(contato.company_id))) {
      return json({ error: 'O Relatório de Faturamento só pode ser enviado depois que o contador validar o modelo.' }, 403);
    }
    const rotulo = spec.rotulo(linha);
    const path = String(linha[spec.coluna]);
    const { data: ass, error } = await admin.storage.from(spec.bucket).createSignedUrl(path, VALIDADE_LINK_S, { download: `${slug(rotulo)}.pdf` });
    if (error || !ass?.signedUrl) return json({ error: `Não foi possível gerar o link de "${rotulo}"` }, 500);
    anexos.push({ tipo: String(p.tipo), rotulo, bucket: spec.bucket, path, url: ass.signedUrl });
  }

  const final = anexos.length
    ? `${texto}\n\nDocumentos (os links valem por 7 dias):\n${anexos.map((a) => `- ${a.rotulo}: ${a.url}`).join('\n')}`
    : texto;

  let destino: string | null = null;
  let whatsapp: string | null = null;
  const assunto = String(payload.assunto ?? '').trim().slice(0, 200) || 'Contabilidade Alves';

  if (canal === 'email') {
    destino = contato.email ?? null;
    if (!destino) return json({ error: 'Cliente não tem e-mail cadastrado.' }, 400);
    const token = Deno.env.get('HOSTINGER_MAIL_API_TOKEN');
    const resourceId = Deno.env.get('HOSTINGER_MAIL_RESOURCE_ID');
    if (!token || !resourceId) return json({ error: 'E-mail não configurado (faltam os segredos da Hostinger).' }, 500);
    const res = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${resourceId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: [destino], subject: assunto, text: final }),
    });
    if (!res.ok) return json({ error: `Falha ao enviar e-mail (HTTP ${res.status})` }, 502);
  } else if (canal === 'whatsapp') {
    const d = String(contato.whatsapp || contato.phone || '').replace(/\D/g, '');
    if (d.length < 10) return json({ error: 'Cliente sem WhatsApp ou telefone cadastrado.' }, 400);
    whatsapp = d.length <= 11 ? `55${d}` : d; // com DDD e sem país → prefixa 55
    destino = whatsapp;
  }

  const referencia = payload.referencia && typeof payload.referencia === 'object' ? payload.referencia as Record<string, unknown> : null;
  const { error: logErr } = await admin.from('client_envios').insert({
    company_id: contato.company_id, contact_id: contato.id, canal, origem, assunto: canal === 'email' ? assunto : null, mensagem: texto, destino,
    documentos: anexos.map(({ tipo, rotulo, bucket, path }) => ({ tipo, nome: rotulo, bucket, path })), referencia, enviado_por: perfil.id,
  });

  // Aviso a partir de uma ausência: anota "cliente avisado" se ainda não havia acompanhamento (nunca sobrescreve o que a equipe escreveu).
  if (origem === 'ausencia' && referencia && typeof referencia.obrigacao === 'string' && typeof referencia.competencia === 'string') {
    await admin.from('ausencia_acompanhamento').upsert({
      company_id: contato.company_id, contact_id: contato.id, obrigacao: referencia.obrigacao, competencia: referencia.competencia,
      situacao: 'cliente_avisado', atualizado_por: perfil.id,
    }, { onConflict: 'company_id,contact_id,obrigacao,competencia', ignoreDuplicates: true });
  }

  return json({ ok: true, texto: final, whatsapp, destino, aviso: logErr ? 'Enviado, mas o histórico não foi gravado.' : undefined });
}

const RELATORIOS = ['situacao', 'faturamento'];
const MAX_PDF_BYTES = 4 * 1024 * 1024;

async function guardarRelatorio(payload: Record<string, unknown>, perfil: { id: string }, contato: { id: string; company_id: string }) {
  const tipo = String(payload.tipo ?? '');
  if (!RELATORIOS.includes(tipo)) return json({ error: 'Tipo de relatório inválido' }, 400);
  if (tipo === 'faturamento' && !(await faturamentoLiberado(contato.company_id))) {
    return json({ error: 'O Relatório de Faturamento só pode ser guardado e enviado depois que o contador validar o modelo.' }, 403);
  }
  const b64 = String(payload.pdf_base64 ?? '').replace(/\s/g, '');
  if (!b64 || b64.length > Math.ceil((MAX_PDF_BYTES * 4) / 3) + 8) return json({ error: 'PDF ausente ou grande demais' }, 400);
  let bytes: Uint8Array;
  try { const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); } catch { return json({ error: 'PDF inválido' }, 400); }
  if (bytes.length < 100 || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') return json({ error: 'O arquivo não é um PDF' }, 400);
  const periodo = typeof payload.periodo === 'string' && /^\d{4}-\d{2}$/.test(payload.periodo) ? payload.periodo : null;
  const path = `${contato.company_id}/${contato.id}/${tipo}-${Date.now()}.pdf`;
  const up = await admin.storage.from('client-relatorios').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (up.error) return json({ error: 'Não foi possível guardar o PDF' }, 500);
  const resumo = payload.resumo && typeof payload.resumo === 'object' ? payload.resumo : {};
  const { data, error } = await admin.from('client_relatorios').insert({
    company_id: contato.company_id, contact_id: contato.id, tipo, periodo, path, resumo, gerado_por: perfil.id,
  }).select('id').single();
  if (error || !data) return json({ error: 'O PDF foi guardado, mas o registro falhou' }, 500);
  return json({ ok: true, id: data.id, tipo: `relatorio_${tipo}` });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const perfil = await equipeDe(req);
    if (!perfil) return json({ error: 'Sem permissão' }, 403);
    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const contato = await contatoDaEquipe(perfil, payload.contact_id);
    if (!contato) return json({ error: 'Cliente não encontrado' }, 404);
    switch (payload.action) {
      case 'listar': return await listar(contato);
      case 'enviar': return await enviar(payload, perfil, contato);
      case 'guardar_relatorio': return await guardarRelatorio(payload, perfil, contato);
      default: return json({ error: 'action inválida (listar | enviar | guardar_relatorio)' }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
