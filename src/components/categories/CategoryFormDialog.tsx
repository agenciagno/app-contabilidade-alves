import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Category } from '@/hooks/useCategories';

interface CategoryFormDialogLabels {
  dialogTitleNew: string;
  dialogTitleEdit: string;
  parentQuestion: string;
  parentPlaceholder: string;
  parentNoneOption: string;
  parentHelper: string;
}

// Rótulos padrão = Eventos Contábeis (bookkeeping interno da CA). A tela "Categorias"
// (módulo Financeiro vendido a clientes) passa `labels` com termos mais amigáveis.
const DEFAULT_LABELS: CategoryFormDialogLabels = {
  dialogTitleNew: 'Novo Evento Contábil',
  dialogTitleEdit: 'Editar Evento Contábil',
  parentQuestion: 'Pertence a qual Evento Macro? (Opcional)',
  parentPlaceholder: 'Nenhum (este é um Evento Macro)',
  parentNoneOption: 'Nenhum (Evento Macro)',
  parentHelper: 'Se não selecionar, este evento será um Macro. Se selecionar, será um sub evento.',
};

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  categories?: Category[];
  onSubmit: (data: { name: string; type: 'receita' | 'despesa'; color: string; icon: string; parent_id?: string | null; show_in_dre?: boolean }) => void;
  isLoading?: boolean;
  defaultType?: 'receita' | 'despesa';
  labels?: Partial<CategoryFormDialogLabels>;
}

export function CategoryFormDialog({ open, onOpenChange, category, categories = [], onSubmit, isLoading, defaultType = 'receita', labels }: CategoryFormDialogProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [name, setName] = useState('');
  const [type, setType] = useState<'receita' | 'despesa'>(defaultType);
  const [parentId, setParentId] = useState<string | null>(null);
  const [showInDre, setShowInDre] = useState(true);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setType((category.type as 'receita' | 'despesa') || defaultType);
      setParentId(category.parent_id || null);
      setShowInDre(category.show_in_dre !== false);
    } else {
      setName('');
      setType(defaultType);
      setParentId(null);
      setShowInDre(true);
    }
  }, [category, open, defaultType]);

  // Only show macros (parent_id IS NULL) of the same type, excluding self
  const macroOptions = categories.filter(
    c => !c.parent_id && c.type === type && c.id !== category?.id
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, type, color: '#3B82F6', icon: 'tag', parent_id: parentId, show_in_dre: showInDre });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? l.dialogTitleEdit : l.dialogTitleNew}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Tabs value={type} onValueChange={(v) => { setType(v as 'receita' | 'despesa'); setParentId(null); }}>
              <TabsList className="w-full h-9">
                <TabsTrigger value="receita" className="flex-1 gap-1.5 text-xs h-7">
                  <TrendingUp className="w-3.5 h-3.5" /> Receita
                </TabsTrigger>
                <TabsTrigger value="despesa" className="flex-1 gap-1.5 text-xs h-7">
                  <TrendingDown className="w-3.5 h-3.5" /> Despesa
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Honorários, Aluguel..."
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{l.parentQuestion}</Label>
            <Select
              value={parentId || '__none__'}
              onValueChange={(v) => setParentId(v === '__none__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={l.parentPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{l.parentNoneOption}</SelectItem>
                {macroOptions.map(macro => (
                  <SelectItem key={macro.id} value={macro.id}>
                    {macro.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {l.parentHelper}
            </p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label htmlFor="show-in-dre">Exibir na DRE?</Label>
              <p className="text-xs text-muted-foreground">
                Desmarque para movimentações que afetam o saldo do banco, mas não são receitas/despesas operacionais (ex: Transferências, Aportes de Sócios).
              </p>
            </div>
            <Switch id="show-in-dre" checked={showInDre} onCheckedChange={setShowInDre} />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()} className="flex-1">
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
