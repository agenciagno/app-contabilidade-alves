import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  MessageSquare, 
  Mail, 
  StickyNote, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar, 
  User, 
  Loader2 
} from 'lucide-react';
import { useContactMessages } from '@/hooks/useContactMessages';
import { useContactNotes, ContactNote } from '@/hooks/useContactNotes';
import { useContactLogs } from '@/hooks/useContactLogs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactCommunicationTabProps {
  contactId: string;
}

export function ContactCommunicationTab({ contactId }: ContactCommunicationTabProps) {
  const { messages, isLoading: loadingMessages } = useContactMessages(contactId);
  const { notes, isLoading: loadingNotes, createNote, updateNote, deleteNote } = useContactNotes(contactId);
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

  if (loadingMessages || loadingNotes) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 rounded-[20px]" />
        <Skeleton className="h-48 rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Messages Log */}
      <Card className="rounded-[20px] border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Log de Disparos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {messages && messages.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((msg) => (
                  <TableRow key={msg.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format(new Date(msg.sent_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {msg.channel === 'whatsapp' ? (
                        <div className="flex items-center gap-1 text-emerald-500">
                          <MessageSquare className="h-4 w-4" />
                          <span className="text-sm">WhatsApp</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-blue-500">
                          <Mail className="h-4 w-4" />
                          <span className="text-sm">E-mail</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={msg.message}>
                      {msg.message}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          msg.status === 'enviado'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : msg.status === 'pendente'
                            ? 'bg-yellow-500/10 text-yellow-500'
                            : 'bg-red-500/10 text-red-500'
                        }
                      >
                        {msg.status === 'enviado' ? 'Enviado' : msg.status === 'pendente' ? 'Pendente' : 'Falhou'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum disparo registrado
            </div>
          )}
        </CardContent>
      </Card>

      {/* Internal Notes Section */}
      <Card className="rounded-[20px] border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-medium">
            <StickyNote className="h-5 w-5 text-primary" />
            Notas Internas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* New Note Form */}
          <div className="space-y-4">
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
          </div>

          {/* Notes List */}
          {notes.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-border/50">
              <h4 className="text-sm font-medium text-muted-foreground">
                Notas ({notes.length})
              </h4>
              <div className="grid gap-4">
                {notes.map((note) => (
                  <div 
                    key={note.id} 
                    className="p-4 rounded-xl bg-muted/30 border border-border/30 transition-all duration-200 hover:shadow-sm"
                  >
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
                            size="sm"
                          >
                            {updateNote.isPending && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Salvar
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setEditingNote(null)}
                            className="rounded-xl"
                            size="sm"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-foreground whitespace-pre-wrap leading-relaxed mb-3">
                          {note.content}
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/30">
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3" />
                              {note.creator_name || 'Usuário'}
                              {note.updated_by && note.updater_name && (
                                <span className="text-xs opacity-70">
                                  (editado por {note.updater_name})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditNote(note)}
                              className="rounded-lg h-8"
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(note.id)}
                              className="rounded-lg h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Excluir
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {notes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhuma nota cadastrada. Adicione notas para acompanhar informações importantes.
            </p>
          )}
        </CardContent>
      </Card>

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
