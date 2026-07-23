import { CategoriesView } from '@/components/categories/CategoriesView';

// Categorias do módulo Financeiro vendido a clientes — dado isolado dos Eventos Contábeis
// internos da CA (scope 'cliente' × 'interno' na mesma tabela categories). Decisão 22/07/2026.
export default function ClientCategories() {
  return (
    <CategoriesView
      scope="cliente"
      pageTitle="Categorias"
      addButtonLabel="Nova Categoria"
      revenueTabLabel="Categorias de Receita"
      expenseTabLabel="Categorias de Despesa"
      emptyLabel="Nenhuma categoria cadastrada"
      subOfLabel="Subcategoria de:"
      deleteTitle="Excluir categoria?"
      deleteDescription="Esta ação não pode ser desfeita. A categoria será removida permanentemente."
      formLabels={{
        dialogTitleNew: 'Nova Categoria',
        dialogTitleEdit: 'Editar Categoria',
        parentQuestion: 'Pertence a qual Categoria Principal? (Opcional)',
        parentPlaceholder: 'Nenhuma (esta é uma Categoria Principal)',
        parentNoneOption: 'Nenhuma (Categoria Principal)',
        parentHelper: 'Se não selecionar, esta será uma categoria principal. Se selecionar, será uma subcategoria.',
      }}
    />
  );
}
