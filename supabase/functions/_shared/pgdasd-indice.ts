// Leitura do índice de declarações do PGDAS-D (CONSDECLARACAO13). Tolerante a maiúsculas/minúsculas nas chaves:
// o trial devolve "anocalendario" e "datahoraEmissaoDas" onde a documentação diz "anoCalendario" e "dataHoraEmissaoDas".

export interface DeclaracaoIndice {
  periodo: string; // AAAA-MM-01
  numero_declaracao: string;
  tipo: "original" | "retificadora";
  transmitida_em: string | null; // ISO, horário de Brasília
  malha: string | null;
}
export interface DasIndice {
  periodo: string; // AAAA-MM-01
  numero_das: string;
  tipo_operacao: string;
  emitido_em: string | null;
  das_pago: boolean | null;
}

/** Valor de uma chave sem diferenciar maiúsculas/minúsculas. */
export function pega(o: any, ...nomes: string[]): any {
  if (!o || typeof o !== "object") return undefined;
  const alvos = nomes.map((n) => n.toLowerCase());
  for (const k of Object.keys(o)) if (alvos.includes(k.toLowerCase())) return o[k];
  return undefined;
}

/** "20220331152512" (yyyyMMddHHmmss, horário de Brasília) → ISO com -03:00. */
export function dataHoraBR(v: unknown): string | null {
  const s = String(v ?? "");
  if (!/^\d{14}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}-03:00`;
}

function periodoDe(v: unknown): string | null {
  const s = String(v ?? "");
  return /^\d{6}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-01` : null;
}

export function lerIndicePgdasd(dados: unknown): { declaracoes: DeclaracaoIndice[]; das: DasIndice[] } {
  let raiz: any = dados;
  if (typeof raiz === "string") { try { raiz = JSON.parse(raiz); } catch { raiz = null; } }
  const declaracoes: DeclaracaoIndice[] = [];
  const das: DasIndice[] = [];
  // Consulta por ano traz "periodos" (lista); por período traz "periodo" (um só).
  let periodos: any[] = [];
  const lista = pega(raiz, "periodos");
  if (Array.isArray(lista)) periodos = lista;
  else if (pega(raiz, "periodo")) periodos = [pega(raiz, "periodo")];

  for (const p of periodos) {
    const periodo = periodoDe(pega(p, "periodoApuracao"));
    if (!periodo) continue;
    for (const op of pega(p, "operacoes") ?? []) {
      const tipoOp = String(pega(op, "tipoOperacao") ?? "").trim();
      const d = pega(op, "indiceDeclaracao");
      const s = pega(op, "indiceDas");
      const numDecl = String(pega(d, "numeroDeclaracao") ?? "");
      if (d && numDecl) {
        declaracoes.push({
          periodo, numero_declaracao: numDecl,
          tipo: /retific/i.test(tipoOp) ? "retificadora" : "original",
          transmitida_em: dataHoraBR(pega(d, "dataHoraTransmissao")),
          malha: String(pega(d, "malha") ?? "").trim() || null,
        });
      }
      const numDas = String(pega(s, "numeroDas") ?? "");
      if (s && numDas) {
        const pago = pega(s, "dasPago");
        das.push({
          periodo, numero_das: numDas, tipo_operacao: tipoOp || "Geração de DAS",
          emitido_em: dataHoraBR(pega(s, "dataHoraEmissaoDas")),
          das_pago: typeof pago === "boolean" ? pago : pago === null || pago === undefined ? null : String(pago).toLowerCase() === "true",
        });
      }
    }
  }
  return { declaracoes, das };
}
