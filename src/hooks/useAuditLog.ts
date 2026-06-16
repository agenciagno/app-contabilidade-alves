import { supabase } from '@/integrations/supabase/client';

export type AuditAction =
  | 'NOTA_CRIADA'
  | 'NOTA_EDITADA'
  | 'NOTA_EXCLUIDA'
  | 'DOCUMENTO_UPLOAD'
  | 'DOCUMENTO_EXCLUIDO'
  | 'MENSAGEM_ENVIADA'
  | 'PERFIL_ATUALIZADO'
  | 'CADASTRO_ALTERADO'
  | 'HONORARIO_GERADO'
  | 'TRANSACAO_PAGA'
  | 'SOCIO_ADICIONADO'
  | 'SOCIO_EDITADO'
  | 'SOCIO_REMOVIDO';

interface CreateLogParams {
  contactId: string;
  action: AuditAction;
  description: string;
}

export async function createAuditLog({ contactId, action, description }: CreateLogParams) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      console.error('User not authenticated for audit log');
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, full_name, username')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile) {
      console.error('Profile not found for audit log');
      return null;
    }

    const userName = profile.full_name || profile.username || 'Usuário';

    const { data, error } = await supabase
      .from('contact_logs')
      .insert({
        contact_id: contactId,
        company_id: profile.company_id,
        action,
        description,
        user_id: userData.user.id,
        user_name: userName,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating audit log:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createAuditLog:', error);
    return null;
  }
}

// Helper to track profile/cadastral changes
export function getFieldChanges(
  oldData: Record<string, any>,
  newData: Record<string, any>,
  fieldLabels: Record<string, string>
): string[] {
  const changes: string[] = [];
  
  for (const [key, label] of Object.entries(fieldLabels)) {
    const oldValue = oldData[key] ?? '';
    const newValue = newData[key] ?? '';
    
    if (String(oldValue) !== String(newValue)) {
      if (!oldValue && newValue) {
        changes.push(`${label} definido como "${newValue}"`);
      } else if (oldValue && !newValue) {
        changes.push(`${label} removido`);
      } else {
        changes.push(`${label} alterado de "${oldValue}" para "${newValue}"`);
      }
    }
  }
  
  return changes;
}
