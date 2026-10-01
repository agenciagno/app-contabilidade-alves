import { useMemo } from 'react';

import { BarrasHorizontais, Cartao, Vazio } from '@/components/gestao360/GraficosCarteira';
import { perfilCarteira, type PerfilContato } from '@/lib/diagnosticos';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';

const pct = (n: number, t: number) => (t > 0 ? `${Math.round((n / t) * 100)}%` : '—');

/** Quem é a carteira: regime, porte, cidade, tempo de casa, atividade e se dá para avisar o cliente. Só contagens do cadastro. */
export function DiagnosticosPerfil({ linhas, perfis, hoje }: { linhas: LinhaCarteira[]; perfis: Map<string, PerfilContato>; hoje: string }) {
  const p = useMemo(() => perfilCarteira(linhas, perfis, hoje), [linhas, perfis, hoje]);
  const semContato = p.contato.nenhum;
  return (
    <div className="space-y-4">
      <p className="max-w-[860px] text-meta text-muted-ink">
        {p.total} {p.total === 1 ? 'cliente ativo' : 'clientes ativos'} com CNPJ de matriz (filial fica na conta da matriz). Porte, cidade e atividade vêm do cadastro: {p.porte.find((x) => x.nome === 'Sem porte')?.valor ?? 0} sem porte e {p.cidades.find((x) => x.nome === 'Sem cidade')?.valor ?? 0} sem cidade.
        Honorário e faixa de faturamento ainda não entram: o honorário do cadastro precisa de conferência e o faturamento vem da leitura mensal do dia 30.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao titulo="Regime tributário" subtitulo="Clientes por regime do cadastro">
          <BarrasHorizontais dados={p.regime} vazio="Sem clientes." />
        </Cartao>
        <Cartao titulo="Porte" subtitulo="ME, EPP e demais, como a Receita classifica">
          <BarrasHorizontais dados={p.porte} vazio="Sem clientes." />
        </Cartao>
        <Cartao titulo="Cidade" subtitulo="As 8 cidades com mais clientes; a grafia é unificada (Juatuba e JUATUBA contam juntas)">
          <BarrasHorizontais dados={p.cidades} vazio="Sem clientes." />
        </Cartao>
        <Cartao titulo="Tempo de casa" subtitulo="Desde o início do contrato com a Contabilidade Alves">
          <BarrasHorizontais dados={p.tempoDeCasa} vazio="Sem clientes." />
        </Cartao>
        <Cartao titulo="Atividades mais comuns" subtitulo="CNAE principal do cadastro, as 8 que mais aparecem">
          {p.atividades.length === 0 ? <Vazio texto="Nenhum cliente com CNAE no cadastro." /> : (
            <ul className="divide-y divide-line-2">
              {p.atividades.map((a) => (
                <li key={a.codigo} className="flex items-start gap-3 py-2">
                  <span className="w-[72px] shrink-0 font-mono text-meta text-muted-ink-2">{a.codigo}</span>
                  <span className="min-w-0 flex-1 text-ui text-ink">{a.descricao}</span>
                  <span className="text-ui-strong text-ink">{a.valor}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
        <Cartao titulo="Dá para avisar o cliente?" subtitulo="Contato cadastrado para o envio de e-mail ou WhatsApp">
          <ul className="space-y-2 text-ui text-ink">
            <li className="flex justify-between"><span className="text-muted-ink">E-mail e WhatsApp</span><span className="text-ui-strong">{p.contato.ambos} <span className="text-meta text-muted-ink-2">({pct(p.contato.ambos, p.total)})</span></span></li>
            <li className="flex justify-between"><span className="text-muted-ink">Só e-mail</span><span className="text-ui-strong">{p.contato.soEmail}</span></li>
            <li className="flex justify-between"><span className="text-muted-ink">Só WhatsApp ou telefone</span><span className="text-ui-strong">{p.contato.soWhatsapp}</span></li>
            <li className="flex justify-between"><span className="text-muted-ink">Nenhum contato</span><span className={semContato > 0 ? 'text-ui-strong text-danger' : 'text-ui-strong'}>{semContato}</span></li>
          </ul>
          {semContato > 0 && <p className="text-meta text-muted-ink">{semContato} {semContato === 1 ? 'cliente não recebe' : 'clientes não recebem'} aviso pelo sistema: complete o cadastro.</p>}
        </Cartao>
      </div>
    </div>
  );
}
