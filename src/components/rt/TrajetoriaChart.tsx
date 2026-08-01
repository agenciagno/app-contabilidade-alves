import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { PontoTrajetoria } from '@/lib/rt/trajetoria';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

interface Props {
  trajetoria: PontoTrajetoria[];
  /** Divide por 12 para exibir a carga mensal. */
  mensal?: boolean;
  temCredito: boolean;
}

export function TrajetoriaChart({ trajetoria, mensal = true, temCredito }: Props) {
  const divisor = mensal ? 12 : 1;
  // `Area` do recharts preenche do eixo até o valor, não entre duas séries. Para desenhar
  // a faixa de verdade, empilha-se uma área invisível (o piso) com a diferença por cima.
  const dados = trajetoria.map((p) => ({
    ano: p.ano,
    valor: p.valor / divisor,
    piso: p.valor / divisor,
    delta: Math.max(0, (p.valorSemCredito - p.valor) / divisor),
    percentual: p.percentual,
    marco: p.marco,
  }));

  const primeiro = dados[0];
  const ultimo = dados[dados.length - 1];
  const subiu = ultimo.valor > primeiro.valor;
  const estavel = Math.abs(ultimo.valor - primeiro.valor) < 1;
  const cor = estavel
    ? 'hsl(var(--primary))'
    : subiu
      ? 'hsl(var(--destructive))'
      : 'hsl(142 71% 45%)';
  // Sem diferença entre os dois cenários não há faixa para desenhar.
  const mostrarFaixa = temCredito && dados.some((d) => d.delta > 1);

  // Eixo Y em números redondos: sem isso o recharts escolhe marcas como "15,3 mil",
  // que dá trabalho de ler num relatório entregue ao cliente.
  const INTERVALOS = 4;
  const pico = Math.max(...dados.map((d) => d.valor + d.delta), 1);
  const passoBruto = (pico * 1.12) / INTERVALOS;
  const magnitude = 10 ** Math.floor(Math.log10(passoBruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((p) => p >= passoBruto) ?? magnitude * 10;
  const tetoEixo = passo * INTERVALOS;

  return (
    <div className="space-y-3">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="faixaRt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="ano"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={72}
              domain={[0, tetoEixo]}
              ticks={Array.from({ length: INTERVALOS + 1 }, (_, i) => i * passo)}
              tickFormatter={(v: number) =>
                v >= 1000
                  ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
                  : String(Math.round(v))
              }
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(ano) => `${ano}`}
              formatter={(v: number, nome: string, item: { payload?: { valor: number } }) =>
                nome === 'delta'
                  ? [brl((item.payload?.valor ?? 0) + v), 'Se não aproveitar crédito']
                  : [brl(v), 'Carga estimada']
              }
            />
            {/* Marcos reais da transição */}
            <ReferenceLine x={2027} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            <ReferenceLine x={2033} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            {mostrarFaixa && (
              <>
                {/* Série auxiliar: só levanta a faixa até a linha. Fora do tooltip. */}
                <Area
                  type="monotone"
                  dataKey="piso"
                  stackId="faixa"
                  stroke="none"
                  fill="transparent"
                  isAnimationActive={false}
                  legendType="none"
                  tooltipType="none"
                />
                <Area
                  type="monotone"
                  dataKey="delta"
                  stackId="faixa"
                  stroke="none"
                  fill="url(#faixaRt)"
                  isAnimationActive={false}
                />
              </>
            )}
            <Line
              type="monotone"
              dataKey="valor"
              stroke={cor}
              strokeWidth={2.5}
              dot={{ r: 3, fill: cor }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: cor }} />
          Carga estimada {mensal ? 'por mês' : 'por ano'}
        </span>
        {mostrarFaixa && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm" style={{ background: cor, opacity: 0.18 }} />
            Onde ficaria sem aproveitar crédito
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {estavel ? (
          <>
            Em texto: a carga fica em{' '}
            <strong>{(primeiro.percentual * 100).toFixed(1).replace('.', ',')}%</strong> do
            faturamento do começo ao fim da transição. Isso acontece porque a empresa segue no
            DAS unificado — IBS e CBS continuam embutidos nele, e as tabelas do Simples não
            mudaram. A linha só sairia da horizontal se ela optasse pelo regime regular.
          </>
        ) : (
          <>
            Em texto: a carga sai de{' '}
            <strong>{(primeiro.percentual * 100).toFixed(1).replace('.', ',')}%</strong> do
            faturamento hoje e caminha para{' '}
            <strong>{(ultimo.percentual * 100).toFixed(1).replace('.', ',')}%</strong> na reforma
            plena (2033), passando pela virada da CBS em 2027 e pela fase final entre 2029 e 2032.
            {mostrarFaixa
              ? ' A área sombreada mostra onde a carga ficaria sem nenhum aproveitamento de crédito — essa distância é o que o crédito das compras economiza.'
              : ' Sem compras com crédito informadas, o gráfico já mostra o cenário mais pesado: com crédito, a linha desce.'}
          </>
        )}
      </p>
    </div>
  );
}
