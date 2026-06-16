import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StickyNote, Plus, Edit2, Trash2, Calendar, User, Loader2 } from 'lucide-react';
import { useContactNotes, ContactNote } from '@/hooks/useContactNotes';
import { useContactLogs } from '@/hooks/useContactLogs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactNotesTabProps {
  contactId: string;
}

export function ContactNotesTab({ contactId }: ContactNotesTabProps) {
  const { notes, isLoading, createNote, updateNote, deleteNote } = useContactNotes(contactId);
  const { createLog } = useContactLogs(contactId);
  
  const [newNote, setNewNote] = useState('');
  const [editingNote, setEditingNote] = useState<ContactNote | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;

    await createNote.mutateAsync({
      contact_id: contactId,
      content: newNote.trim(),
    });

    await createLog.mutateAsync({
      contact_id: contactId,
      action: 'NOTA_CRIADA',
      description: 'Nova nota adicionada ao perfil',
    });

    setNewNote('');
  };

  const handleEditNote = (note: ContactNote) => {
    setEditingNote(note);
    setEditContent(note.content);
  };

  const handleUpdateNote = async () => {
    if (!editingNote || !editContent.trim()) return;

    await updateNote.mutateAsync({
      id: editingNote.id,
      content: editContent.trim(),
    });

    await createLog.mutateAsync({
      contact_id: contactId,
      action: 'NOTA_EDITADA',
      description: 'Nota atualizada no perfil',
    });

    setEditingNote(null);
    setEditContent('');
  };

  const handleDeleteNote = async () => {
    if (!noteToDelete) return;

    await deleteNote.mutateAsync(noteToDelete);

    await createLog.mutateAsync({
      contact_id: contactId,
      action: 'NOTA_EXCLUIDA',
      description: 'Nota removida do perfil',
    });

    setNoteToDelete(null);
    setDeleteDialogOpen(false);
  };

  const openDeleteDialog = (noteId: string) => {
    setNoteToDelete(noteId);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-[20px]" />
        <Skeleton className="h-24 w-full rounded-[20px]" />
        <Skeleton className="h-24 w-full rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Note Form */}
      <Card className="rounded-[20px] border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-medium">
            <StickyNote className="h-5 w-5 text-primary" />
            Nova Nota
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Digite sua nota aqui..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            className="min-h-[100px] rounded-xl resize-none"
          />
          <Button
            onClick={handleCreateNote}
            disabled={!newNote.trim() || createNote.isPending}
            className="w-full sm:w-auto rounded-xl"
          >
            {createNote.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Adicionar Nota
          </Button>
        </CardContent>
      </Card>

      {/* Notes List */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-muted-foreground" />
          Notas ({notes.length})
        </h3>

        {notes.length === 0 ? (
          <Card className="rounded-[20px] border-dashed border-2 border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <StickyNote className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Nenhuma nota registrada</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Adicione notas para acompanhar informações importantes
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {notes.map((note) => (
              <Card 
                key={note.id} 
                className="rounded-[20px] border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
              >
                <CardContent className="p-4 sm:p-6">
                  {editingNote?.id === note.id ? (
                    <div className="space-y-4">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[100px] rounded-xl resize-none"
                      />
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          onClick={handleUpdateNote}
                          disabled={!editContent.trim() || updateNote.isPending}
                          className="rounded-xl"
                        >
                          {updateNote.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : null}
                          Salvar
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setEditingNote(null)}
                          className="rounded-xl"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-foreground whitespace-pre-wrap leading-relaxed mb-4">
                        {note.content}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/50">
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5" />
                            {note.creator_name || 'Usuário'}
                            {note.updated_by && note.updater_name && (
                              <span className="text-xs">
                                (editado por {note.updater_name})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditNote(note)}
                            className="rounded-xl"
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(note.id)}
                            className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[20px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Nota</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta nota? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
