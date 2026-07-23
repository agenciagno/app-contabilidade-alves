import { CategoriesView } from '@/components/categories/CategoriesView';

export default function Categories() {
  return (
    <CategoriesView
      scope="interno"
      pageTitle="Eventos Contábeis"
      addButtonLabel="Novo Evento Contábil"
      revenueTabLabel="Eventos de Receita"
      expenseTabLabel="Eventos de Despesa"
      emptyLabel="Nenhum evento contábil cadastrado"
      subOfLabel="Sub evento de:"
      deleteTitle="Excluir evento contábil?"
      deleteDescription="Esta ação não pode ser desfeita. O evento contábil será removido permanentemente."
      formLabels={{
        dialogTitleNew: 'Novo Evento Contábil',
        dialogTitleEdit: 'Editar Evento Contábil',
        parentQuestion: 'Pertence a qual Evento Macro? (Opcional)',
        parentPlaceholder: 'Nenhum (este é um Evento Macro)',
        parentNoneOption: 'Nenhum (Evento Macro)',
        parentHelper: 'Se não selecionar, este evento será um Macro. Se selecionar, será um sub evento.',
      }}
    />
  );
}
