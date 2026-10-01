import { Link } from 'react-router-dom';

import { DsBadge } from '@/components/ds';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TabelaExport } from '@/lib/exportarTabela';
import {
  dataBR, digitos, FILTROS, IMPACTO_CERTIDAO, ORDEM_NIVEL, pendenciasCertidao, type LinhaCarteira,
} from '@/lib/situacaoCarteira';

const certidaoTexto = (l: LinhaCarteira) => (l.certidao.tipo ? `${l.certidao.tipo}${l.certidao.validade ? ` · até ${dataBR(l.certidao.validade)}` : ''}` : 'Sem leitura');

/** Radar CND: clientes com algo que pode impedir a certidão federal. Estimativa a partir do que já está salvo, não a situação oficial da CND. */
export function RadarCnd({ linhas }: { linhas: LinhaCarteira[] }) {
  const radar = linhas.filter(FILTROS.podeImpedirCertidao)
    .sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] || pendenciasCertidao(b).length - pendenciasCertidao(a).length || a.nome.localeCompare(b.nome, 'pt-BR'));

  const tabela = (): TabelaExport => ({
    arquivo: 'radar-cnd',
    titulo: 'CA · Ausências: radar de certidão federal',
    colunas: ['Razão social', 'CNPJ', 'Pendência crítica', 'Certidão federal', 'Impacto'],
    linhas: radar.map((l) => [l.nome, formatarCnpj(l.documento), pendenciasCertidao(l).join('; '), certidaoTexto(l), IMPACTO_CERTIDAO]),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[760px] text-meta text-muted-ink">
          Clientes com pendência na Situação fiscal, DAS vencido ou declaração em falta. <strong className="text-ink">É risco, não a situação oficial da certidão</strong>:
          estadual, municipal, FGTS e trabalhista não entram, e a certidão federal vem do relatório de Situação fiscal (rodada mensal, dia 30).
        </p>
        <ExportarMenu montar={tabela} disabled={radar.length === 0} />
      </div>

      <div className="rounded-lg border border-line bg-paper">
        {radar.length === 0 ? (
          <p className="py-12 text-center text-ui text-muted-ink">Nenhum cliente com pendência que possa impedir a certidão federal.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Pendência crítica</TableHead>
                <TableHead>Certidão federal</TableHead>
                <TableHead>Impacto</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {radar.map((l) => (
                <TableRow key={l.contact_id}>
                  <TableCell>
                    <p className="text-ui-strong text-ink">{l.nome}</p>
                    <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <ul className="space-y-0.5 text-ui text-ink">{pendenciasCertidao(l).map((p) => <li key={p}>{p}</li>)}</ul>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">{certidaoTexto(l)}</TableCell>
                  <TableCell><DsBadge tone="warn">{IMPACTO_CERTIDAO}</DsBadge></TableCell>
                  <TableCell className="text-right">
                    <Link to={`/dashboard-federal/situacao-fiscal?q=${digitos(l.documento)}`} className="text-ui-strong text-action hover:underline">Ver</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
