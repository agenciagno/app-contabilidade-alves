import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function GenerateDeadlineAlertsButton() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'generate-deadline-notifications',
        { body: {} },
      );
      if (error) throw error;
      const created = (data as any)?.created ?? 0;
      const checked = (data as any)?.checked ?? 0;
      toast({
        title: 'Alertas de prazo gerados',
        description: `${created} nova(s) notificação(ões) criada(s) — ${checked} tarefa(s) verificada(s).`,
      });
    } catch (e: any) {
      toast({
        title: 'Erro ao gerar alertas',
        description: e?.message ?? 'Falha inesperada.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
      Gerar alertas de prazo
    </Button>
  );
}
