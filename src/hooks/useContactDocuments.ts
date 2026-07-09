import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createAuditLog } from './useAuditLog';

export type DocumentCategory = 'atos_constitutivos' | 'impostos_guias' | 'fiscal' | 'dp_rh' | 'certidoes';

export interface ContactDocument {
  id: string;
  company_id: string;
  contact_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_at: string;
  category: DocumentCategory;
}

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string; icon: string }[] = [
  { value: 'atos_constitutivos', label: 'Atos Constitutivos', icon: 'FileSignature' },
  { value: 'impostos_guias', label: 'Impostos e Guias', icon: 'Receipt' },
  { value: 'fiscal', label: 'Fiscal', icon: 'FileSpreadsheet' },
  { value: 'dp_rh', label: 'DP/RH', icon: 'Users' },
  { value: 'certidoes', label: 'Certidões', icon: 'FileCheck' },
];

export function useContactDocuments(contactId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: ['contact-documents', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      
      const { data, error } = await supabase
        .from('contact_documents')
        .select('*')
        .eq('contact_id', contactId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return data as ContactDocument[];
    },
    enabled: !!contactId,
  });

  const getDocumentsByCategory = (category: DocumentCategory) => {
    return documents?.filter(doc => doc.category === category) || [];
  };

  const getDocumentCounts = () => {
    const counts: Record<DocumentCategory, number> = {
      atos_constitutivos: 0,
      impostos_guias: 0,
      fiscal: 0,
      dp_rh: 0,
      certidoes: 0,
    };

    documents?.forEach(doc => {
      if (counts[doc.category] !== undefined) {
        counts[doc.category]++;
      }
    });

    return counts;
  };

  const uploadDocument = useMutation({
    mutationFn: async ({ 
      file, 
      contactId, 
      category 
    }: { 
      file: File; 
      contactId: string; 
      category: DocumentCategory;
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .single();

      if (!profile?.company_id) throw new Error('Company not found');

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${contactId}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('contact-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Save document record
      const { data, error } = await supabase
        .from('contact_documents')
        .insert({
          company_id: profile.company_id,
          contact_id: contactId,
          file_name: file.name,
          file_url: fileName,
          file_type: fileExt?.toUpperCase() || null,
          file_size: file.size,
          category,
        })
        .select()
        .single();

      if (error) throw error;

      // Create audit log
      const categoryLabel = DOCUMENT_CATEGORIES.find(c => c.value === category)?.label || category;
      await createAuditLog({
        contactId,
        action: 'DOCUMENTO_UPLOAD',
        description: `Documento "${file.name}" enviado para ${categoryLabel}`,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-documents', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
      toast({
        title: 'Documento enviado',
        description: 'O arquivo foi salvo com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao enviar documento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (document: ContactDocument) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('contact-documents')
        .remove([document.file_url]);

      if (storageError) console.error('Storage delete error:', storageError);

      // Delete record
      const { error } = await supabase
        .from('contact_documents')
        .delete()
        .eq('id', document.id);

      if (error) throw error;

      // Create audit log
      await createAuditLog({
        contactId: document.contact_id,
        action: 'DOCUMENTO_EXCLUIDO',
        description: `Documento "${document.file_name}" excluído`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-documents', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-logs', contactId] });
      toast({
        title: 'Documento excluído',
        description: 'O arquivo foi removido com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir documento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const downloadDocument = async (document: ContactDocument) => {
    const url = await baixarDocumentoUrl('contact-documents', document.file_url);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getPreviewUrl = async (document: ContactDocument): Promise<string | null> => {
    return await baixarDocumentoUrl('contact-documents', document.file_url);
  };


  return {
    documents,
    isLoading,
    uploadDocument,
    deleteDocument,
    downloadDocument,
    getPreviewUrl,
    getDocumentsByCategory,
    getDocumentCounts,
  };
}
