export interface CnpjData {
  razao_social: string;
  nome_fantasia: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  ddd_telefone_1: string;
}

export async function fetchCnpjData(cnpj: string): Promise<CnpjData> {
  // Remove caracteres não numéricos
  const cleanCnpj = cnpj.replace(/\D/g, '');
  
  // Valida tamanho
  if (cleanCnpj.length !== 14) {
    throw new Error('CNPJ deve conter 14 dígitos');
  }
  
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('CNPJ não encontrado na base da Receita Federal');
    }
    throw new Error('Erro ao consultar CNPJ. Tente novamente.');
  }
  
  return response.json();
}
