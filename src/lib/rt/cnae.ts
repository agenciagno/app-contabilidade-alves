import type { Setor } from './tabelas';

/**
 * Setor a partir da divisão do CNAE (2 primeiros dígitos), seguindo as seções da
 * CNAE 2.3 do IBGE. Serve só para pré-preencher o formulário — é palpite informado,
 * não classificação fiscal, e o usuário pode trocar.
 *
 *  05–33 → indústria (extrativas + transformação)
 *  45–47 → comércio
 *  demais → serviço
 */
export function setorPorCnae(codigo?: string | null): Setor | null {
  if (!codigo) return null;
  const digitos = String(codigo).replace(/\D/g, '');
  if (digitos.length < 2) return null;
  const divisao = Number(digitos.slice(0, 2));
  if (!Number.isFinite(divisao)) return null;
  if (divisao >= 5 && divisao <= 33) return 'industria';
  if (divisao >= 45 && divisao <= 47) return 'comercio';
  return 'servico';
}

/**
 * Divisões de CNAE tipicamente tributadas pelo Anexo IV do Simples
 * (construção civil, vigilância e limpeza). Advocacia (69.11) entra à parte.
 * Sugestão para marcar a caixa no formulário — a decisão continua do contador.
 */
export function sugereAnexoIV(codigo?: string | null): boolean {
  if (!codigo) return false;
  const d = String(codigo).replace(/\D/g, '');
  if (d.length < 4) return false;
  const divisao = Number(d.slice(0, 2));
  const grupo = Number(d.slice(0, 4));
  if (divisao >= 41 && divisao <= 43) return true; // construção
  if (grupo === 8011 || grupo === 8012 || grupo === 8121 || grupo === 8122) return true;
  if (grupo === 6911) return true; // advocacia
  return false;
}

export function extrairCnae(valor: unknown): { codigo?: string; descricao?: string } | null {
  if (!valor || typeof valor !== 'object') return null;
  const o = valor as Record<string, unknown>;
  const codigo = typeof o.codigo === 'string' ? o.codigo : undefined;
  const descricao = typeof o.descricao === 'string' ? o.descricao : undefined;
  if (!codigo && !descricao) return null;
  return { codigo, descricao };
}
