import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Clock, FileDown, Loader2, Printer, Upload, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Documento {
  id: string;
  titulo: string;
  descricao: string | null;
  status: 'pendente' | 'enviado' | 'aprovado';
  observacao: string | null;
  arquivos: { nome: string; enviado_em: string }[];
}

interface Dados {
  cliente: { nome: string };
  textos: Record<'pre_intro' | 'pos_intro' | 'contato_escritorio' | 'pos_o_que_mandar' | 'pos_honorario', string>;
  envio: { aberto: boolean; prazo: string | null };
  documentos: Documento[];
  boas_vindas: null | {
    regime: string | null;
    time: { setor: string; nome: string }[];
    obrigacoes: { nome: string; vencimento: string | null }[];
    guias: string[];
    canal: string | null;
    honorario: { valor: number; dia: number | null } | null;
    imposto: string | null;
    reforma: string | null;
  };
}

const FUNCAO = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-publico`;
const BUCKET = 'onboarding-documentos';
const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
// Data pura (prazo) fica como está; data e hora (envio) vira o dia no fuso do navegador, senão o envio noturno cai no dia seguinte (UTC).
const dataBR = (iso: string) => format(parseISO(iso.length > 10 ? iso : iso.slice(0, 10)), 'dd/MM/yyyy');

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(corpo),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados?.error || 'Não foi possível carregar. Tente de novo.');
  return dados as T;
}

/** iPhone às vezes entrega foto HEIC sem tipo; o resto vai pelo tipo que o navegador informa. */
function tipoDoArquivo(f: File) {
  if (f.type) return f.type;
  const n = f.name.toLowerCase();
  if (n.endsWith('.heic')) return 'image/heic';
  if (n.endsWith('.heif')) return 'image/heif';
  if (n.endsWith('.pdf')) return 'application/pdf';
  return '';
}

function Bloco({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2 rounded-xl border border-line bg-paper p-4 shadow-sm print:break-inside-avoid print:shadow-none', className)}>
      <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
      <div className="space-y-1.5 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function ItemDocumento({ doc, envioAberto, enviando, onEnviar }: {
  doc: Documento; envioAberto: boolean; enviando: boolean; onEnviar: (arquivos: FileList) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const recebido = doc.status === 'aprovado';
  const enviado = doc.status === 'enviado';
  return (
    <li className="flex flex-wrap items-start gap-3 py-3 print:break-inside-avoid">
      <span className={cn('mt-0.5 shrink-0', recebido || enviado ? 'text-ok' : 'text-muted-ink')}>
        {recebido || enviado ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
      </span>
      <div className="min-w-[200px] flex-1 space-y-0.5">
        <p className="text-[15px] font-medium text-ink">{doc.titulo}</p>
        {doc.descricao && <p className="text-[13px] text-muted-ink">{doc.descricao}</p>}
        {doc.observacao && doc.status === 'pendente' && (
          <p className="flex items-center gap-1 text-[13px] font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" /> {doc.observacao}</p>
        )}
        {doc.arquivos.length > 0 && (
          <p className="text-meta text-muted-ink">
            {recebido ? 'Recebido pela Contabilidade Alves' : 'Enviado'} · {doc.arquivos.length} arquivo(s), último em {dataBR(doc.arquivos[doc.arquivos.length - 1].enviado_em)}
          </p>
        )}
      </div>
      {!recebido && envioAberto && (
        <div className="shrink-0 print:hidden">
          <input
            ref={input} type="file" multiple className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={e => { if (e.target.files?.length) onEnviar(e.target.files); e.target.value = ''; }}
          />
          <Button size="sm" variant={enviado ? 'outline' : 'default'} className="gap-1.5" disabled={enviando} onClick={() => input.current?.click()}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {enviando ? 'Enviando...' : enviado ? 'Enviar mais' : 'Enviar'}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Página do cliente (17/10/2026), pública e sem login: /c/<token>. Antes, a lista de documentos com envio pelo celular; depois que a
 * equipe libera, as boas-vindas (quem cuida, impostos do regime, o que fazemos todo mês, honorário, Reforma). "Baixar em PDF" imprime.
 */
export default function PaginaCliente() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await chamar<Dados>({ action: 'ver', token }));
      setErro(null);
    } catch (e: any) {
      setErro(e.message);
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    document.title = 'Contabilidade Alves';
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  const enviar = async (doc: Documento, arquivos: FileList) => {
    setEnviando(doc.id); setAviso(null);
    let enviados = 0;
    try {
      for (const f of Array.from(arquivos)) {
        const tipo = tipoDoArquivo(f);
        const prep = await chamar<{ caminho: string; token: string }>({ action: 'upload', token, documento_id: doc.id, nome: f.name, tipo, tamanho: f.size });
        const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(prep.caminho, prep.token, f, { contentType: tipo });
        if (error) throw new Error('O envio do arquivo falhou. Tente de novo.');
        await chamar({ action: 'confirmar', token, documento_id: doc.id, caminho: prep.caminho, nome: f.name, tamanho: f.size });
        enviados++;
      }
      setAviso({ tipo: 'ok', texto: `Recebemos ${enviados} arquivo(s) de "${doc.titulo}". Obrigado!` });
    } catch (e: any) {
      setAviso({ tipo: 'erro', texto: enviados ? `${enviados} arquivo(s) chegaram, mas: ${e.message}` : e.message });
    } finally {
      setEnviando(null);
      carregar();
    }
  };

  if (erro) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <Logo className="h-10" />
        <p className="max-w-sm text-[15px] text-ink">{erro}</p>
      </main>
    );
  }
  if (!dados) {
    return <main className="flex min-h-screen items-center justify-center bg-bg"><Loader2 className="h-6 w-6 animate-spin text-muted-ink" /></main>;
  }

  const bv = dados.boas_vindas;
  const docs = dados.documentos;
  const recebidos = docs.filter(d => d.status !== 'pendente').length;
  const faltam = docs.length - recebidos;

  return (
    <main className="min-h-screen bg-bg print:bg-white">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <Logo className="h-9" />
          <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Baixar em PDF
          </Button>
        </header>

        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-tight text-ink">Olá, {dados.cliente.nome}!</h1>
          <p className="text-[15px] leading-relaxed text-ink-2">{bv ? dados.textos.pos_intro : dados.textos.pre_intro}</p>
        </div>

        {aviso && (
          <div className={cn('rounded-lg border p-3 text-[14px] print:hidden', aviso.tipo === 'ok' ? 'border-ok bg-ok-soft text-ink' : 'border-danger bg-danger-soft text-ink')}>
            {aviso.texto}
          </div>
        )}

        {bv && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {bv.time.length > 0 && (
              <Bloco titulo="Quem cuida da sua empresa">
                <ul className="space-y-1">{bv.time.map(t => <li key={t.setor}><span className="text-muted-ink">{t.setor}:</span> {t.nome}</li>)}</ul>
              </Bloco>
            )}
            {(bv.regime || bv.imposto) && (
              <Bloco titulo={bv.regime ? `Seus impostos · ${bv.regime}` : 'Seus impostos'}>
                {bv.imposto && <p>{bv.imposto}</p>}
              </Bloco>
            )}
            {bv.obrigacoes.length > 0 && (
              <Bloco titulo="O que cuidamos todo mês">
                <ul className="space-y-1">
                  {bv.obrigacoes.map(o => (
                    <li key={o.nome} className="flex justify-between gap-3"><span>{o.nome}</span>{o.vencimento && <span className="shrink-0 text-muted-ink">{o.vencimento}</span>}</li>
                  ))}
                </ul>
              </Bloco>
            )}
            {(bv.guias.length > 0 || bv.honorario) && (
              <Bloco titulo="O que você recebe">
                {bv.guias.length > 0 && <p>Guias de imposto: {bv.guias.join(' e ')}{bv.canal ? `, por ${bv.canal}` : ''}.</p>}
                {bv.honorario && (
                  <p>Honorário: <strong>{moeda(bv.honorario.valor)}</strong>{bv.honorario.dia ? `, vencimento todo dia ${bv.honorario.dia}` : ''}.</p>
                )}
                {dados.textos.pos_honorario && <p className="text-muted-ink">{dados.textos.pos_honorario}</p>}
              </Bloco>
            )}
            {dados.textos.pos_o_que_mandar && <Bloco titulo="O que você precisa nos mandar">{dados.textos.pos_o_que_mandar}</Bloco>}
            {bv.reforma && <Bloco titulo="Reforma Tributária">{bv.reforma}</Bloco>}
          </div>
        )}

        {docs.length > 0 && (
          <section className="space-y-3 rounded-xl border border-line bg-paper p-4 shadow-sm print:shadow-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-semibold text-ink">Documentos</h2>
              <span className="text-[13px] text-muted-ink">{recebidos} de {docs.length} enviados</span>
            </div>
            {bv && faltam > 0 && <p className="text-[14px] text-ink-2">{dados.textos.pre_intro}</p>}
            <div className="h-2 overflow-hidden rounded-full bg-bg-3 print:hidden">
              <div className="h-full rounded-full bg-action transition-all" style={{ width: `${(recebidos / docs.length) * 100}%` }} />
            </div>
            {dados.envio.prazo && (
              <p className={cn('text-[13px]', dados.envio.aberto ? 'text-muted-ink' : 'font-medium text-danger')}>
                {dados.envio.aberto ? `Prazo para envio: ${dataBR(dados.envio.prazo)}.` : 'O prazo para envio terminou. Fale com a gente pelo WhatsApp.'}
              </p>
            )}
            <ul className="divide-y divide-line">
              {docs.map(d => (
                <ItemDocumento key={d.id} doc={d} envioAberto={dados.envio.aberto} enviando={enviando === d.id} onEnviar={f => enviar(d, f)} />
              ))}
            </ul>
            <p className="flex items-center gap-1.5 text-meta text-muted-ink print:hidden">
              <FileDown className="h-3.5 w-3.5" /> PDF ou foto (JPG, PNG, HEIC), até 15 MB cada. Pode mandar mais de um arquivo por item.
            </p>
          </section>
        )}

        {dados.textos.contato_escritorio && (
          <footer className="border-t border-line pt-4 text-center text-[13px] leading-relaxed text-muted-ink">{dados.textos.contato_escritorio}</footer>
        )}
      </div>
    </main>
  );
}
