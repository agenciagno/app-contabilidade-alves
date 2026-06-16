import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FileText, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Contact } from '@/hooks/useContacts';
import { ContactEditSheet } from './ContactEditSheet';

const canalLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  impresso: 'Impresso',
  whatsapp_email: 'WhatsApp + E-mail',
};

interface Props {
  contact: Contact;
}

export function ContactBillingCard({ contact }: Props) {
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();

  const [boletoActive, setBoletoActive] = useState(contact.boleto_active);
  const [enviarAuto, setEnviarAuto] = useState(contact.enviar_cobranca_auto);

  useEffect(() => {
    setBoletoActive(contact.boleto_active);
    setEnviarAuto(contact.enviar_cobranca_auto);
  }, [contact.boleto_active, contact.enviar_cobranca_auto]);

  const persist = async (
    field: 'boleto_active' | 'enviar_cobranca_auto',
    value: boolean,
    revert: () => void,
  ) => {
    const { error } = await supabase
      .from('contacts')
      .update({ [field]: value })
      .eq('id', contact.id);

    if (error) {
      revert();
      toast.error('Erro ao salvar. Tente novamente.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    toast.success('Configuração salva');
  };

  const handleBoletoActive = (next: boolean) => {
    const prev = boletoActive;
    setBoletoActive(next);
    persist('boleto_active', next, () => setBoletoActive(prev));
  };

  const handleEnviarAuto = (next: boolean) => {
    const prev = enviarAuto;
    setEnviarAuto(next);
    persist('enviar_cobranca_auto', next, () => setEnviarAuto(prev));
  };

  const valorFormatado =
    contact.boleto_value != null
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
          Number(contact.boleto_value),
        )
      : null;

  return (
    <>
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Configurações de Cobrança
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Grupo A */}
          <div>
            <label className="text-xs text-muted-foreground">Valor mensal de honorários</label>
            {valorFormatado ? (
              <p className="text-foreground">{valorFormatado}</p>
            ) : (
              <p className="text-muted-foreground">Não configurado</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dia de vencimento</label>
            {contact.boleto_due_day ? (
              <p className="text-foreground">{contact.boleto_due_day}</p>
            ) : (
              <p className="text-muted-foreground">Não configurado</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Canal de entrega</label>
            {contact.canal_entrega && canalLabels[contact.canal_entrega] ? (
              <p className="text-foreground">{canalLabels[contact.canal_entrega]}</p>
            ) : (
              <p className="text-muted-foreground">Não configurado</p>
            )}
          </div>

          {/* Grupo B - Automações */}
          <div className="border-t border-border/50 pt-4 mt-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Automações</p>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label className="text-sm">Gerar boleto automaticamente</Label>
                <p className="text-xs text-muted-foreground">
                  O sistema gera o boleto no Sicoob todo mês no dia configurado
                </p>
              </div>
              <Switch checked={boletoActive} onCheckedChange={handleBoletoActive} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label className="text-sm">Enviar cobrança automaticamente</Label>
                <p className="text-xs text-muted-foreground">
                  O sistema envia o boleto ao cliente pelo canal configurado
                </p>
              </div>
              {boletoActive ? (
                <Switch checked={enviarAuto} onCheckedChange={handleEnviarAuto} />
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Switch checked={enviarAuto} disabled />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Ative a geração automática primeiro</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <ContactEditSheet
          contact={contact}
          section="cobranca"
          open={editing}
          onOpenChange={(o) => !o && setEditing(false)}
        />
      )}
    </>
  );
}
