import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useInadimplentContacts } from '@/hooks/useInadimplentContacts';
import { useToast } from '@/hooks/use-toast';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export function InadimplentToast() {
  const { user } = useAuth();
  const { count, totalAmount } = useInadimplentContacts();
  const { toast } = useToast();
  const hasShownToast = useRef(false);
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    // Reset flag when user changes (new login)
    if (user?.id !== previousUserId.current) {
      hasShownToast.current = false;
      previousUserId.current = user?.id ?? null;
    }

    // Show toast only once after login when there are inadimplent contacts
    if (user && count > 0 && !hasShownToast.current) {
      hasShownToast.current = true;
      
      // Small delay to let the page load
      const timer = setTimeout(() => {
        toast({
          variant: 'destructive',
          title: `⚠️ ${count} cliente${count > 1 ? 's' : ''} inadimplente${count > 1 ? 's' : ''}`,
          description: `Total em atraso: ${formatCurrency(totalAmount)}. Acesse CRM > Cliente/Fornecedor para detalhes.`,
          duration: 8000,
        });
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [user, count, totalAmount, toast]);

  return null;
}
