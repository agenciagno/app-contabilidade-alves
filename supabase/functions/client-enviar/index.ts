// Enviar ao cliente (Gestão 360°, rodada 1). Um ponto só para o que a equipe manda ao cliente: e-mail, WhatsApp ou texto copiado,
// com ou sem documentos guardados. Substitui o "avisar" solto de cada tela; tudo cai em client_envios.
//
//   listar   { contact_id }   documentos já guardados do cliente (só PDF que existe de fato no bucket privado)
//   guardar_relatorio { contact_id, tipo: situacao|faturamento, periodo?, pdf_base64, resumo? }  guarda o PDF gerado pela tela (relatório para o cliente)
//   zip      { contact_ids: [...], tipos: [...], competencia?: "AAAA-MM", ano?: AAAA }   (Monitoramento, 09/10/2026)
//            junta num ZIP os PDFs JÁ GUARDADOS dos clientes (pasta por cliente) e devolve um link de 10 min. Não chama o Serpro.
//            Documento com período (DAS, recibos, guias, comprovantes) filtra pela competência ou ano; Situação Fiscal leva o último.
//   enviar   { contact_id, canal: email|whatsapp|copiar, mensagem, assunto?, documentos?: [{tipo, id}], origem, referencia? }
//            monta os links assinados (7 dias), manda o e-mail por aqui (API de e-mail da Hostinger) ou devolve o texto
//            final para a tela abrir o WhatsApp / copiar. O cliente nunca recebe caminho de bucket, só o link com validade.
//
// A tela nunca manda caminho de arquivo: manda (tipo, id do registro) e a função confere que o registro é do cliente.
// Não chama o Serpro e não custa nada: só lê o que já foi guardado.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { zipSync } from 'npm:fflate@0.8.2';
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
  /** Coluna de período para o ZIP em lote: data do 1º dia do mês, ano inteiro ou texto AAAAMM. Sem ela, vai o mais recente. */
  periodo?: { coluna: string; formato: 'mes' | 'ano' | 'aaaamm' };
}

// Um tipo por coluna de PDF que o sistema já guarda. Bucket = o mesmo da função que gravou.
const DOCS: Record<string, Spec> = {
  sitfis: { tabela: 'serpro_sitfis', coluna: 'pdf_path', bucket: 'serpro-sitfis', extra: 'gerado_em', ordem: 'gerado_em',
    rotulo: (r) => `Situação fiscal (relatório de ${dataBR(r.gerado_em)})`, data: (r) => String(r.gerado_em ?? '') },
  pgdasd_recibo: { tabela: 'serpro_pgdasd_declaracoes', coluna: 'recibo_path', bucket: 'serpro-pgdasd', extra: 'periodo_apuracao', ordem: 'periodo_apuracao',
    rotulo: (r) => `Recibo do PGDAS-D ${mesAno(r.periodo_apuracao)}`, data: (r) => String(r.periodo_apuracao ?? ''), periodo: { coluna: 'periodo_apuracao', formato: 'mes' } },
  pgdasd_declaracao: { tabela: 'serpro_pgdasd_declaracoes', coluna: 'declaracao_path', bucket: 'serpro-pgdasd', extra: 'periodo_apuracao', ordem: 'periodo_apuracao',
    rotulo: (r) => `Declaração do PGDAS-D ${mesAno(r.periodo_apuracao)}`, data: (r) => String(r.periodo_apuracao ?? ''), periodo: { coluna: 'periodo_apuracao', formato: 'mes' } },
  pgdasd_das: { tabela: 'serpro_pgdasd_das', coluna: 'das_path', bucket: 'serpro-pgdasd', extra: 'periodo_apuracao', ordem: 'periodo_apuracao',
    rotulo: (r) => `DAS ${mesAno(r.periodo_apuracao)}`, data: (r) => String(r.periodo_apuracao ?? ''), periodo: { coluna: 'periodo_apuracao', formato: 'mes' } },
  dctfweb_recibo: { tabela: 'serpro_dctfweb', coluna: 'recibo_path', bucket: 'serpro-dctfweb', extra: 'competencia', ordem: 'competencia',
    rotulo: (r) => `Recibo da DCTFWeb ${mesAno(r.competencia)}`, data: (r) => String(r.competencia ?? ''), periodo: { coluna: 'competencia', formato: 'mes' } },
  dctfweb_guia: { tabela: 'serpro_dctfweb_guias', coluna: 'pdf_path', bucket: 'serpro-dctfweb', extra: 'competencia,emitido_em', ordem: 'emitido_em',
    rotulo: (r) => `Guia da DCTFWeb ${mesAno(r.competencia)}`, data: (r) => String(r.emitido_em ?? ''), periodo: { coluna: 'competencia', formato: 'mes' } },
  defis_recibo: { tabela: 'serpro_defis', coluna: 'recibo_path', bucket: 'serpro-pgdasd', extra: 'ano_calendario', ordem: 'ano_calendario',
    rotulo: (r) => `Recibo da DEFIS ${r.ano_calendario}`, data: (r) => `${r.ano_calendario}-12-31`, periodo: { coluna: 'ano_calendario', formato: 'ano' } },
  defis_declaracao: { tabela: 'serpro_defis', coluna: 'declaracao_path', bucket: 'serpro-pgdasd', extra: 'ano_calendario', ordem: 'ano_calendario',
    rotulo: (r) => `Declaração da DEFIS ${r.ano_calendario}`, data: (r) => `${r.ano_calendario}-12-31`, periodo: { coluna: 'ano_calendario', formato: 'ano' } },
  comprovante: { tabela: 'serpro_pagamentos', coluna: 'comprovante_path', bucket: 'serpro-comprovantes', extra: 'periodo_apuracao,tipo_sigla,comprovante_emitido_em', ordem: 'comprovante_emitido_em',
    rotulo: (r) => `Comprovante de pagamento ${r.tipo_sigla ? `${r.tipo_sigla} ` : ''}${mesAno(r.periodo_apuracao)}`.trim(), data: (r) => String(r.comprovante_emitido_em ?? r.periodo_apuracao ?? ''), periodo: { coluna: 'periodo_apuracao', formato: 'mes' } },
  relatorio_situacao: { tabela: 'client_relatorios', coluna: 'path', bucket: 'client-relatorios', extra: 'tipo,gerado_em', ordem: 'gerado_em', onde: ['tipo', 'situacao'],
    rotulo: (r) => `Relatório Completo da Empresa (gerado em ${dataBR(r.gerado_em)})`, data: (r) => String(r.gerado_em ?? '') },
  relatorio_faturamento: { tabela: 'client_relatorios', coluna: 'path', bucket: 'client-relatorios', extra: 'tipo,gerado_em,periodo', ordem: 'gerado_em', onde: ['tipo', 'faturamento'],
    rotulo: (r) => `Relatório de Faturamento dos últimos 12 meses (até ${mesAno(r.periodo ? `${r.periodo}-01` : r.gerado_em)})`, data: (r) => String(r.gerado_em ?? '') },
  parcela_guia: { tabela: 'serpro_parcelas_guias', coluna: 'pdf_path', bucket: 'serpro-parcelamentos', extra: 'modalidade,parcela,gerado_em', ordem: 'gerado_em',
    rotulo: (r) => `Guia da parcela ${String(r.parcela ?? '').replace(/^(\d{4})(\d{2})$/, '$2/$1')} (${r.modalidade ?? ''})`, data: (r) => String(r.gerado_em ?? ''),
    periodo: { coluna: 'parcela', formato: 'aaaamm' } },
  dctfweb_declaracao: { tabela: 'serpro_dctfweb', coluna: 'declaracao_path', bucket: 'serpro-dctfweb', extra: 'competencia', ordem: 'competencia',
    rotulo: (r) => `Declaração completa da DCTFWeb ${mesAno(r.competencia)}`, data: (r) => String(r.competencia ?? ''), periodo: { coluna: 'competencia', formato: 'mes' } },
  mei_das: { tabela: 'serpro_mei_das', coluna: 'pdf_path', bucket: 'serpro-mei', extra: 'periodo,emitido_em', ordem: 'emitido_em',
    rotulo: (r) => `DAS do MEI ${mesAno(r.periodo)}`, data: (r) => String(r.emitido_em ?? ''), periodo: { coluna: 'periodo', formato: 'mes' } },
  mei_ccmei: { tabela: 'serpro_mei_ccmei', coluna: 'pdf_path', bucket: 'serpro-mei', extra: 'emitido_em', ordem: 'emitido_em',
    rotulo: (r) => `Certificado da Condição de MEI (${dataBR(r.emitido_em)})`, data: (r) => String(r.emitido_em ?? '') },
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

// ---------- ZIP em lote (só o que já está guardado; não chama o Serpro)
const ZIP_MAX_CLIENTES = 300;
const ZIP_MAX_ARQUIVOS = 600;
const ZIP_MAX_BYTES = 90 * 1024 * 1024;

async function zipLote(payload: Record<string, unknown>, perfil: { company_id: string; is_super_admin: boolean }) {
  const ids = Array.isArray(payload.contact_ids) ? [...new Set((payload.contact_ids as unknown[]).map(String))].slice(0, ZIP_MAX_CLIENTES) : [];
  const tipos = Array.isArray(payload.tipos) ? (payload.tipos as unknown[]).map(String).filter((t) => DOCS[t]) : [];
  if (!ids.length || !tipos.length) return json({ error: 'Escolha clientes e tipos de documento' }, 400);
  const competencia = typeof payload.competencia === 'string' && /^\d{4}-\d{2}$/.test(payload.competencia) ? payload.competencia : null;
  const ano = Number(payload.ano) || (competencia ? Number(competencia.slice(0, 4)) : null);

  const { data: contatos } = await admin.from('contacts').select('id, company_id, name, display_name, document').in('id', ids);
  const meus = (contatos ?? []).filter((c) => perfil.is_super_admin || c.company_id === perfil.company_id);
  if (!meus.length) return json({ error: 'Clientes não encontrados' }, 404);
  const companyId = meus[0].company_id as string;
  const pasta = new Map(meus.map((c) => [c.id as string, `${slug(String(c.display_name || c.name || 'Cliente'))} - ${String(c.document ?? '').replace(/\D/g, '')}`]));

  const arquivos: { contactId: string; tipo: string; bucket: string; path: string; nome: string }[] = [];
  for (const tipo of tipos) {
    if (tipo === 'relatorio_faturamento' && !(await faturamentoLiberado(companyId))) continue;
    const s = DOCS[tipo];
    let q = admin.from(s.tabela).select(`id, contact_id, ${s.coluna}, ${s.extra}`).in('contact_id', [...pasta.keys()]).eq('company_id', companyId).not(s.coluna, 'is', null);
    if (s.onde) q = q.eq(s.onde[0], s.onde[1]);
    if (s.periodo && competencia && s.periodo.formato === 'mes') q = q.eq(s.periodo.coluna, `${competencia}-01`);
    if (s.periodo && competencia && s.periodo.formato === 'aaaamm') q = q.eq(s.periodo.coluna, competencia.replace('-', ''));
    if (s.periodo && ano && s.periodo.formato === 'ano') q = q.eq(s.periodo.coluna, ano);
    const { data } = await q.order(s.ordem, { ascending: false }).limit(2000);
    const vistos = new Set<string>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const cid = String(r.contact_id);
      // Sem período (Situação Fiscal): só o mais recente de cada cliente.
      if (!s.periodo && vistos.has(cid)) continue;
      vistos.add(cid);
      arquivos.push({ contactId: cid, tipo, bucket: s.bucket, path: String(r[s.coluna]), nome: `${slug(s.rotulo(r))}.pdf` });
    }
  }
  if (!arquivos.length) return json({ ok: false, error: 'Nenhum documento guardado para os clientes e tipos escolhidos.' });
  if (arquivos.length > ZIP_MAX_ARQUIVOS) return json({ ok: false, error: `São ${arquivos.length} arquivos; o limite é ${ZIP_MAX_ARQUIVOS} por ZIP. Escolha menos clientes ou tipos.` });

  const conteudo: Record<string, Uint8Array> = {};
  let bytes = 0;
  let falhas = 0;
  for (let i = 0; i < arquivos.length; i += 8) {
    const parte = arquivos.slice(i, i + 8);
    const baixados = await Promise.all(parte.map(async (a) => {
      const { data, error } = await admin.storage.from(a.bucket).download(a.path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    }));
    parte.forEach((a, k) => {
      const b = baixados[k];
      if (!b) { falhas++; return; }
      let nome = `${pasta.get(a.contactId)}/${a.nome}`;
      for (let n = 2; conteudo[nome]; n++) nome = `${pasta.get(a.contactId)}/${a.nome.replace(/\.pdf$/, '')} (${n}).pdf`;
      conteudo[nome] = b;
      bytes += b.length;
    });
    if (bytes > ZIP_MAX_BYTES) return json({ ok: false, error: 'O ZIP passou de 90 MB. Escolha menos clientes ou tipos.' });
  }
  const zip = zipSync(conteudo, { level: 0 });
  const path = `${companyId}/lotes/documentos-${Date.now()}.zip`;
  const up = await admin.storage.from('client-relatorios').upload(path, zip, { contentType: 'application/zip', upsert: false });
  if (up.error) return json({ error: 'Não foi possível montar o ZIP' }, 500);
  const nomeZip = `documentos${competencia ? `-${competencia}` : ano ? `-${ano}` : ''}.zip`;
  const { data: ass } = await admin.storage.from('client-relatorios').createSignedUrl(path, 600, { download: nomeZip });
  if (!ass?.signedUrl) return json({ error: 'Não foi possível gerar o link do ZIP' }, 500);
  const comArquivo = new Set(arquivos.map((a) => a.contactId));
  return json({ ok: true, url: ass.signedUrl, arquivos: Object.keys(conteudo).length, clientes: comArquivo.size, semDocumento: pasta.size - comArquivo.size, falhas });
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
    if (payload.action === 'zip') return await zipLote(payload, perfil);
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
