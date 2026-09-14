import { Card, CardContent } from '@/components/ui/card';

// Duplicata de EntradaClientesTab, ainda sem fonte de dado (não existe hoje
// nenhum campo que marque "saída"/cancelamento de cliente) — tela em branco
// até a feature ser definida (14/09/2026).
export function SaidaClientesTab() {
  return (
    <div className="space-y-4">
      <Card className="bg-card border-border/50">
        <CardContent className="text-muted-foreground text-center py-16">
          Em breve.
        </CardContent>
      </Card>
    </div>
  );
}
