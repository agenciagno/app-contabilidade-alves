import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Trash2, History, Database } from 'lucide-react';
import GlobalLogsTab from '@/components/settings/GlobalLogsTab';
import TrashTab from '@/components/settings/TrashTab';
import BackupTab from '@/components/settings/BackupTab';
import CompanyDataCard from '@/components/settings/CompanyDataCard';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { PageHeader, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { cn } from '@/lib/utils';

/**
 * Configurações — só equipe interna da CA. Cliente externo não tem esta tela;
 * os dados da empresa dele aparecem em Minha Conta (mesmo `CompanyDataCard`).
 */
export default function SettingsPage() {
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();
  const canViewSub = (subKey: string) =>
    isModuleVisible('configuracoes') && isSubItemVisible('configuracoes', subKey);
  const canViewEmpresa = canViewSub('configuracoes_empresa');
  const canViewLogs = canViewSub('configuracoes_logs');
  const canViewLixeira = canViewSub('configuracoes_lixeira');
  const canViewBackup = canViewSub('configuracoes_backup');
  const [searchParams] = useSearchParams();

  const defaultTab = searchParams.get('tab') || 'empresa';

  // Build tabs based on autorização por módulo
  // "Minha Equipe" saiu daqui — virou rota própria em Cadastro > Equipe.
  const tabs: { value: string; label: string; icon: React.ElementType }[] = [];
  if (canViewEmpresa) {
    tabs.push({ value: 'empresa', label: 'Dados da Empresa', icon: Building2 });
  }
  if (canViewLogs) {
    tabs.push({ value: 'logs', label: 'Logs Globais', icon: History });
  }
  if (canViewLixeira) {
    tabs.push({ value: 'lixeira', label: 'Lixeira', icon: Trash2 });
  }
  if (canViewBackup) {
    tabs.push({ value: 'backup', label: 'Backup', icon: Database });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/configurações"
        title="Configurações."
        subtitle="Dados da empresa e manutenção do sistema."
      />

      {tabs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sem permissão para ver Configurações.
        </div>
      ) : (
      <Tabs defaultValue={tabs.some(t => t.value === defaultTab) ? defaultTab : tabs[0]?.value} className="w-full">
        <TabsList className={cn(tabsListClass, 'mb-6')}>
          {tabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className={tabsTriggerClass}>
              <tab.icon className="h-[15px] w-[15px]" strokeWidth={1.75} />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Dados da Empresa */}
        {canViewEmpresa && (
          <TabsContent value="empresa" className="space-y-6 mt-0">
            <CompanyDataCard />
          </TabsContent>
        )}

        {/* Logs Globais */}
        {canViewLogs && (
          <TabsContent value="logs" className="mt-0">
            <GlobalLogsTab />
          </TabsContent>
        )}

        {/* Lixeira */}
        {canViewLixeira && (
          <TabsContent value="lixeira" className="mt-0">
            <TrashTab />
          </TabsContent>
        )}

        {/* Backup */}
        {canViewBackup && (
          <TabsContent value="backup" className="mt-0">
            <BackupTab />
          </TabsContent>
        )}
      </Tabs>
      )}
    </div>
  );
}
