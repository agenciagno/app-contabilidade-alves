import { LifeBuoy, Mail, MessageCircle, AtSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { PageHeader } from '@/components/ds';

/**
 * Canais oficiais de suporte.
 *
 * ⚠️ Preencher com os canais reais da CA — ficaram vazios de propósito porque
 * `companies` não tem telefone/e-mail cadastrado para a Contabilidade Alves e
 * inventar um canal aqui manda o cliente para o vazio. Enquanto estiver vazio,
 * a tela mostra o aviso em vez de um botão que não leva a lugar nenhum.
 */
const CANAIS_SUPORTE: { whatsapp?: string; email?: string } = {
  // whatsapp: '5531900000000',
  // email: 'suporte@contabilidadealves.com.br',
};

export default function Suporte() {
  const { user } = useAuth();
  const { companyName } = useCompany();

  const temCanal = Boolean(CANAIS_SUPORTE.whatsapp || CANAIS_SUPORTE.email);

  const assuntoEmail = encodeURIComponent('Suporte — sistema Contabilidade Alves');
  const corpoEmail = encodeURIComponent(
    `Empresa: ${companyName}\nUsuário: ${user?.email ?? ''}\n\nComo podemos ajudar?\n`
  );

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        kicker="~/suporte"
        title="Como podemos ajudar?"
        subtitle="Fale com a gente quando precisar."
      />

      <Card className="bg-card border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <LifeBuoy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Canais de atendimento</CardTitle>
              <CardDescription>Respondemos em até 2 horas no horário comercial</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {temCanal ? (
            <div className="flex flex-wrap gap-3">
              {CANAIS_SUPORTE.whatsapp && (
                <Button asChild>
                  <a
                    href={`https://wa.me/${CANAIS_SUPORTE.whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Falar no WhatsApp
                  </a>
                </Button>
              )}
              {CANAIS_SUPORTE.email && (
                <Button variant="outline" asChild>
                  <a href={`mailto:${CANAIS_SUPORTE.email}?subject=${assuntoEmail}&body=${corpoEmail}`}>
                    <Mail className="w-4 h-4 mr-2" />
                    Enviar e-mail
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Os canais de suporte ainda não foram configurados neste sistema. Fale com o
              responsável pela conta da sua empresa.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <AtSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Alterar e-mail de acesso</CardTitle>
              <CardDescription>Feito pelo suporte, por segurança</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Seu e-mail de acesso hoje é <span className="text-foreground">{user?.email}</span>. Ele é
            a chave da sua conta, então a troca não é feita direto na tela — a gente confirma quem
            está pedindo antes de mudar.
          </p>
          <p>Ao falar com o suporte, informe:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>o e-mail atual e o novo e-mail;</li>
            <li>o nome da empresa ({companyName}).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
