import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Tag, TrendingUp, TrendingDown, CornerDownRight } from 'lucide-react';
import { useCategories, Category, CategoryScope } from '@/hooks/useCategories';
import { CategoryFormDialog } from '@/components/categories/CategoryFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader, tabsListClass, tabsTriggerClass } from '@/components/ds';
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

  const receitaCategories = useMemo(() => categories.filter(c => c.type === 'receita'), [categories]);
  const despesaCategories = useMemo(() => categories.filter(c => c.type === 'despesa'), [categories]);

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

  const getParentName = (parentId: string | null) => {
    if (!parentId) return null;
    return categories.find(c => c.id === parentId)?.name || null;
  };

  const CategoryCard = ({ category, isSub }: { category: Category; isSub?: boolean }) => {
    const parentName = getParentName(category.parent_id);
    return (
      <div className={`flex items-center justify-between rounded-md border border-line bg-bg p-4 transition-colors hover:border-ink/20 ${isSub ? 'ml-8' : ''}`}>
        <div className="flex items-center gap-3">
          {isSub ? (
            <CornerDownRight className="h-4 w-4 shrink-0 text-muted-ink" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-tint">
              <Tag className="h-4 w-4 text-brand" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-ui-strong text-ink">{category.name}</span>
            {parentName && (
              <span className="text-meta text-muted-ink">{subOfLabel} {parentName}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(category)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(category.id)}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  const renderHierarchicalList = (items: Category[]) => {
    const macros = items.filter(c => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const subs = items.filter(c => !!c.parent_id);
    const macroIds = new Set(macros.map(m => m.id));
    const orphanSubs = subs.filter(s => !macroIds.has(s.parent_id!));

    if (items.length === 0) {
      return <p className="text-muted-foreground text-center py-8">{emptyLabel}</p>;
    }

    return (
      <div className="space-y-2">
        {macros.map(macro => {
          const children = subs.filter(s => s.parent_id === macro.id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
          return (
            <div key={macro.id}>
              <CategoryCard category={macro} />
              {children.map(child => (
                <div key={child.id} className="mt-1">
                  <CategoryCard category={child} isSub />
                </div>
              ))}
            </div>
          );
        })}
        {orphanSubs.length > 0 && orphanSubs.map(cat => (
          <CategoryCard key={cat.id} category={cat} />
        ))}
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

      <div className="rounded-lg border border-line bg-paper p-5">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'receita' | 'despesa')}>
          <TabsList className={cn(tabsListClass, 'mb-4')}>
            <TabsTrigger value="receita" className={tabsTriggerClass}>
              <TrendingUp className="h-[15px] w-[15px]" strokeWidth={1.75} />
              {revenueTabLabel}
              <span className="text-muted-ink">({receitaCategories.length})</span>
            </TabsTrigger>
            <TabsTrigger value="despesa" className={tabsTriggerClass}>
              <TrendingDown className="h-[15px] w-[15px]" strokeWidth={1.75} />
              {expenseTabLabel}
              <span className="text-muted-ink">({despesaCategories.length})</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="receita">
            {renderHierarchicalList(receitaCategories)}
          </TabsContent>
          <TabsContent value="despesa">
            {renderHierarchicalList(despesaCategories)}
          </TabsContent>
        </Tabs>
      </div>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
        categories={categories}
        onSubmit={handleSubmit}
        isLoading={createCategory.isPending || updateCategory.isPending}
        defaultType={activeTab}
        labels={formLabels}
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
