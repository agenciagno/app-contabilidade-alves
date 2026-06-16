import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, RefreshCw } from 'lucide-react';
import { useContactRecurrings } from '@/hooks/useContactRecurrings';

interface ContactContractsCardProps {
  contactId: string;
}

const frequencyLabels: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export function ContactContractsCard({ contactId }: ContactContractsCardProps) {
  const { data: recurrings, isLoading } = useContactRecurrings(contactId);

  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (!recurrings || recurrings.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          Contratos Ativos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recurrings.map((recurring) => (
          <div
            key={recurring.id}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{recurring.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {frequencyLabels[recurring.frequency] || recurring.frequency}
                  </Badge>
                  {recurring.category && (
                    <Badge 
                      variant="secondary" 
                      className="text-xs"
                      style={{ 
                        backgroundColor: `${recurring.category.color}20`,
                        color: recurring.category.color 
                      }}
                    >
                      {recurring.category.name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-semibold ${
                recurring.type === 'receita' ? 'text-emerald-500' : 'text-red-500'
              }`}>
                {recurring.type === 'despesa' && '-'}
                {formatCurrency(Number(recurring.amount))}
              </p>
              <p className="text-xs text-muted-foreground">
                {recurring.type === 'receita' ? 'Receita' : 'Despesa'}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
