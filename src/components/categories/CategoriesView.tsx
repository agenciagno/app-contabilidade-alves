import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCategories, Category, CategoryScope } from '@/hooks/useCategories';
import { CategoryFormDialog } from '@/components/categories/CategoryFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader, tabsListClass, tabsTriggerClass, SearchField } from '@/components/ds';
import { cn } from '@/lib/utils';

interface CategoriesViewProps {
  scope: CategoryScope;
  kicker: string;
  pageTitle: string;
  subtitle: string;
  addButtonLabel: string;
  revenueTabLabel: string;
  expenseTabLabel: string;
  emptyLabel: string;
  subOfLabel: string; // "Sub evento de:" / "Subcategoria de:"
  deleteTitle: string;
  deleteDescription: string;
  formLabels: {
    dialogTitleNew: string;
    dialogTitleEdit: string;
    parentQuestion: string;
    parentPlaceholder: string;
    parentNoneOption: string;
    parentHelper: string;
  };
}

// Compartilhado por /financeiro/categorias (Eventos Contábeis, scope "interno") e
// /financeiro/categorias-clientes (scope "cliente") — mudança visual aqui vale pras
// duas rotas de propósito, mesmo componente/dado, só rótulos diferem (22/08/2026).
export function CategoriesView({
  scope,
  kicker,
  pageTitle,
  subtitle,
  addButtonLabel,
  revenueTabLabel,
  expenseTabLabel,
  emptyLabel,
  subOfLabel,
  deleteTitle,
  deleteDescription,
  formLabels,
}: CategoriesViewProps) {
  const { categories, isLoading, createCategory, updateCategory, deleteCategory } = useCategories(scope);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'receita' | 'despesa'>('receita');
  const [search, setSearch] = useState('');

  const receitaCategories = categories.filter(c => c.type === 'receita');
  const despesaCategories = categories.filter(c => c.type === 'despesa');

  // Busca por texto (nova, 22/08/2026 — a tela não tinha nenhuma antes). Filtra o
  // nome de macro e sub igual; mesmo padrão instantâneo (sem debounce) já usado
  // no filtro client-side de outras telas do Financeiro.
  const filterBySearch = (items: Category[]) => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(c => c.name.toLowerCase().includes(term));
  };

  const handleSubmit = (data: { name: string; type: 'receita' | 'despesa'; color: string; icon: string; parent_id?: string | null }) => {
    if (editingCategory) {
      updateCategory.mutate({ id: editingCategory.id, ...data }, {
        onSuccess: () => { setDialogOpen(false); setEditingCategory(null); }
      });
    } else {
      createCategory.mutate(data, {
        onSuccess: () => setDialogOpen(false)
      });
    }
  };

  const handleEdit = (category: Category) => { setEditingCategory(category); setDialogOpen(true); };
  const handleNewCategory = () => { setEditingCategory(null); setDialogOpen(true); };
  const handleDelete = () => { if (deleteId) deleteCategory.mutate(deleteId, { onSuccess: () => setDeleteId(null) }); };

  const getParent = (parentId: string | null) => {
    if (!parentId) return null;
    return categories.find(c => c.id === parentId) || null;
  };

  // Linha da lista — era um card individual por evento (borda própria, gap entre
  // eles); no Figma é 1 linha dentro de uma lista só, hairline entre elas. Macro
  // ganha o quadradinho com a cor real da categoria (era um IconBox genérico com
  // ícone de tag fixo, não usava category.color); sub perde o ícone de seta, só
  // indenta. Ícones de ação reaproveitados de Lançamentos (mesmo tamanho/cor).
  const CategoryRow = ({ category, isSub }: { category: Category; isSub?: boolean }) => {
    const parent = getParent(category.parent_id);
    return (
      <div className={cn('flex items-center justify-between gap-3 px-4 py-3', isSub && 'pl-14')}>
        <div className="flex min-w-0 items-center gap-3">
          {!isSub ? (
            <span
              className="h-7 w-7 shrink-0 rounded-md"
              style={{ backgroundColor: category.color || 'var(--bg-2)' }}
            />
          ) : (
            // Bolinha com a cor do macro pai — único vínculo visual de cor entre
            // sub-evento e macro hoje (antes era só recuo + legenda em texto,
            // fácil de perder numa lista longa) (23/08/2026).
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: parent?.color || 'var(--bg-2)' }}
            />
          )}
          <div className="flex min-w-0 flex-col">
            <span className={cn('truncate text-body text-ink', !isSub && 'font-semibold')}>{category.name}</span>
            {parent && (
              <span className="truncate text-meta text-muted-ink">{subOfLabel} {parent.name}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(category)}>
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteId(category.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  const renderHierarchicalList = (items: Category[]) => {
    const filtered = filterBySearch(items);
    const macros = filtered.filter(c => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const subs = filtered.filter(c => !!c.parent_id);
    const macroIds = new Set(macros.map(m => m.id));
    const orphanSubs = subs.filter(s => !macroIds.has(s.parent_id!));

    if (filtered.length === 0) {
      return (
        <p className="py-8 text-center text-body text-muted-ink">
          {search.trim() ? 'Nenhum resultado para a busca.' : emptyLabel}
        </p>
      );
    }

    return (
      <div className="divide-y divide-line-2">
        {macros.map(macro => {
          const children = subs.filter(s => s.parent_id === macro.id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
          return (
            <div key={macro.id} className="divide-y divide-line-2">
              <CategoryRow category={macro} />
              {children.map(child => <CategoryRow key={child.id} category={child} isSub />)}
            </div>
          );
        })}
        {orphanSubs.map(cat => <CategoryRow key={cat.id} category={cat} />)}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-44" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={kicker}
        title={pageTitle}
        subtitle={subtitle}
        actions={
          <Button onClick={handleNewCategory}>
            <Plus className="h-4 w-4" />
            {addButtonLabel}
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'receita' | 'despesa')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className={tabsListClass}>
            <TabsTrigger value="receita" className={tabsTriggerClass}>
              {revenueTabLabel} <span className="text-muted-ink">({receitaCategories.length})</span>
            </TabsTrigger>
            <TabsTrigger value="despesa" className={tabsTriggerClass}>
              {expenseTabLabel} <span className="text-muted-ink">({despesaCategories.length})</span>
            </TabsTrigger>
          </TabsList>

          <SearchField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={scope === 'cliente' ? 'Buscar categoria...' : 'Buscar evento contábil...'}
            wrapperClassName="w-full sm:w-72"
          />
        </div>

        <TabsContent value="receita" className="mt-4">
          <div className="overflow-hidden rounded-lg border border-line bg-paper">
            {renderHierarchicalList(receitaCategories)}
          </div>
        </TabsContent>
        <TabsContent value="despesa" className="mt-4">
          <div className="overflow-hidden rounded-lg border border-line bg-paper">
            {renderHierarchicalList(despesaCategories)}
          </div>
        </TabsContent>
      </Tabs>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
        categories={categories}
        onSubmit={handleSubmit}
        isLoading={createCategory.isPending || updateCategory.isPending}
        defaultType={activeTab}
        labels={formLabels}
        scope={scope}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
