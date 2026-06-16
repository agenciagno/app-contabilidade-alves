import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

const ClientReport = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório de Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Análises e métricas sobre sua base de clientes
          </p>
        </div>
      </div>

      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-primary/10">
              <Users className="w-12 h-12 text-primary" />
            </div>
          </div>
          <CardTitle>Relatório de Clientes</CardTitle>
          <CardDescription>
            Em breve você poderá visualizar análises detalhadas sobre seus clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p>Funcionalidades planejadas:</p>
          <ul className="mt-4 space-y-2">
            <li>• Ranking de clientes por faturamento</li>
            <li>• Análise de inadimplência</li>
            <li>• Segmentação de clientes</li>
            <li>• Histórico de interações</li>
            <li>• Exportação de relatórios</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientReport;
