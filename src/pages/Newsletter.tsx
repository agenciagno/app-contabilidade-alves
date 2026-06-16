import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface NewsletterRow {
  slug: string;
  type: string;
  title: string;
  content: string;
  items_count: number | null;
  created_at: string;
  sent_at: string | null;
}

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function formatPtDate(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

function renderInline(text: string): React.ReactNode[] {
  // *bold* and _italic_
  const tokens: React.ReactNode[] = [];
  const regex = /(\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('*')) {
      tokens.push(<strong key={key++} className="font-semibold text-neutral-900">{token.slice(1, -1)}</strong>);
    } else {
      tokens.push(<em key={key++} className="italic">{token.slice(1, -1)}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return tokens;
}

function renderContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-3" />;
    // divider: line that is essentially only ━ or - or = repeated
    if (/^[━─=_*\-]{4,}$/.test(trimmed)) {
      return <hr key={i} className="my-6 border-t border-neutral-200" />;
    }
    // bullet
    if (/^[•\-]\s+/.test(trimmed)) {
      return (
        <div key={i} className="flex gap-2 pl-2 my-1">
          <span className="text-neutral-400 select-none">•</span>
          <span className="flex-1">{renderInline(trimmed.replace(/^[•\-]\s+/, ''))}</span>
        </div>
      );
    }
    return <p key={i} className="my-1">{renderInline(line)}</p>;
  });
}

export default function Newsletter() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NewsletterRow | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      if (!slug) return;
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('newsletters')
        .select('slug, type, title, content, items_count, created_at, sent_at')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setData(data as NewsletterRow);
      }
      setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (data?.title) {
      document.title = `${data.title} • Newsletter Contabilidade Alves`;
    }
  }, [data]);

  return (
    <div className="min-h-screen w-full" style={{ background: '#FAFAF8', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-[680px] px-4 sm:px-6 py-10 sm:py-14 text-neutral-800">
        {loading && <NewsletterSkeleton />}

        {!loading && notFound && (
          <div className="flex flex-col items-center text-center py-20">
            <div className="w-32 h-12 mb-8 bg-neutral-900 rounded-md flex items-center justify-center">
              <img src="/Contabilidade_Alves_Branco.svg" alt="Contabilidade Alves" className="h-7 w-auto" />
            </div>
            <h1 className="text-2xl font-semibold text-neutral-900 mb-3">Edição não encontrada</h1>
            <p className="text-neutral-600 mb-8">Esta edição ainda não foi publicada ou o link está incorreto.</p>
            <a
              href="https://contabilidadealves.com.br"
              className="inline-flex items-center px-5 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition"
            >
              Ir para o site
            </a>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Header */}
            <header className="mb-10">
              <div className="flex items-center justify-center mb-8">
                <div className="bg-neutral-900 rounded-lg px-5 py-3 inline-flex items-center justify-center">
                  <img src="/Contabilidade_Alves_Branco.svg" alt="Contabilidade Alves" className="h-7 w-auto" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Newsletter Contabilidade Alves</p>
                <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 leading-tight mb-4">
                  {data.title}
                </h1>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <span className="text-sm text-neutral-500">
                    {formatPtDate(data.sent_at || data.created_at)}
                  </span>
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={
                      data.type === 'semanal'
                        ? { background: 'rgba(52,199,89,0.12)', color: '#1a7a38' }
                        : { background: 'rgba(0,122,255,0.11)', color: '#004fad' }
                    }
                  >
                    {data.type === 'semanal' ? 'Semanal' : 'Diária'}
                  </span>
                </div>
              </div>
            </header>

            <hr className="border-t border-neutral-200 mb-10" />

            {/* Body */}
            <article
              className="text-neutral-800"
              style={{ fontSize: '17px', lineHeight: 1.65 }}
            >
              {renderContent(data.content || '')}
            </article>

            {/* Footer */}
            <footer className="mt-16 pt-8 border-t border-neutral-200 text-center">
              <p className="text-sm font-medium text-neutral-700 mb-2">
                Contabilidade Alves • Juatuba, MG
              </p>
              <a
                href="https://wa.me/5531975084312"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm text-[#007AFF] hover:underline mb-4"
              >
                Entre em contato pelo WhatsApp
              </a>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Esta newsletter é enviada internamente pela equipe da Contabilidade Alves.
              </p>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function NewsletterSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex justify-center mb-8">
        <div className="h-12 w-32 bg-neutral-200 rounded-lg" />
      </div>
      <div className="h-3 w-48 bg-neutral-200 rounded mx-auto mb-3" />
      <div className="h-8 w-3/4 bg-neutral-200 rounded mx-auto mb-3" />
      <div className="h-4 w-40 bg-neutral-200 rounded mx-auto mb-10" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-4 bg-neutral-200 rounded" style={{ width: `${70 + ((i * 7) % 30)}%` }} />
        ))}
      </div>
    </div>
  );
}
