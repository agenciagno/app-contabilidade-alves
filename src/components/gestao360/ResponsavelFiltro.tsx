import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resumirResponsaveis, SEM_RESPONSAVEL, type LinhaCarteira } from '@/lib/situacaoCarteira';

const TODOS = '__todos__';

interface Props {
  /** Carteira inteira: as contagens ao lado de cada nome não mudam com o filtro. */
  linhas: LinhaCarteira[];
  /** id do responsável, 'sem' ou null (todos). */
  valor: string | null;
  onChange: (resp: string | null) => void;
}

/** Filtro por responsável do cadastro, do Portal 360° e de CA · Ausências. O valor vive na URL (`?resp=`). */
export function ResponsavelFiltro({ linhas, valor, onChange }: Props) {
  const { responsaveis, semResponsavel } = resumirResponsaveis(linhas);
  return (
    <Select value={valor ?? TODOS} onValueChange={(v) => onChange(v === TODOS ? null : v)}>
      <SelectTrigger className="w-[230px]" aria-label="Filtrar por responsável"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
        {responsaveis.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome} ({r.clientes})</SelectItem>)}
        {semResponsavel > 0 && <SelectItem value={SEM_RESPONSAVEL}>Sem responsável ({semResponsavel})</SelectItem>}
      </SelectContent>
    </Select>
  );
}
