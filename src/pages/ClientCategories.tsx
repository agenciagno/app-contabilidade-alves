import { CategoriesView } from '@/components/categories/CategoriesView';
import { CLIENT_CATEGORY_LABELS } from '@/hooks/useCategories';

// Categorias do módulo Financeiro vendido a clientes — dado isolado dos Eventos Contábeis
// internos da CA (scope 'cliente' × 'interno' na mesma tabela categories). Decisão 22/07/2026.
export default function ClientCategories() {
  return (
    <CategoriesView
      scope="cliente"
      kicker="~/financeiro · categorias"
      pageTitle="Categorias."
      subtitle="Categorias de receita e despesa do módulo vendido a clientes."
      addButtonLabel="Nova Categoria"
      revenueTabLabel="Categorias de Receita"
      expenseTabLabel="Categorias de Despesa"
      emptyLabel="Nenhuma categoria cadastrada"
      subOfLabel="Subcategoria de:"
      deleteTitle="Excluir categoria?"
      deleteDescription="Esta ação não pode ser desfeita. A categoria será removida permanentemente."
      formLabels={CLIENT_CATEGORY_LABELS}
    />
  );
}
