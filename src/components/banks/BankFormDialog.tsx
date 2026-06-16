import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Bank } from '@/hooks/useBanks';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils';

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

interface BankFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bank?: Bank | null;
  onSubmit: (data: {
    name: string;
    bank_code: string | null;
    agency: string | null;
    account_number: string | null;
    initial_balance: number;
    color: string;
    is_active: boolean;
    is_invisible: boolean;
  }) => void;
  isLoading?: boolean;
}

export function BankFormDialog({ open, onOpenChange, bank, onSubmit, isLoading }: BankFormDialogProps) {
  const [name, setName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [initialBalance, setInitialBalance] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [isCaixaGeral, setIsCaixaGeral] = useState(false);

  useEffect(() => {
    if (bank) {
      setName(bank.name);
      setBankCode(bank.bank_code || '');
      setAgency(bank.agency || '');
      setAccountNumber(bank.account_number || '');
      setInitialBalance(formatCurrencyInput((bank.initial_balance * 100).toString()));
      setIsActive(bank.is_active);
      setIsCaixaGeral(bank.is_invisible || false);
    } else {
      setName('');
      setBankCode('');
      setAgency('');
      setAccountNumber('');
      setInitialBalance('0,00');
      setIsActive(true);
      setIsCaixaGeral(false);
    }
  }, [bank, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const color = bank?.color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
    onSubmit({
      name,
      bank_code: bankCode || null,
      agency: agency || null,
      account_number: accountNumber || null,
      initial_balance: parseCurrencyInput(initialBalance),
      color,
      is_active: isActive,
      is_invisible: isCaixaGeral,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bank ? 'Editar Banco' : 'Novo Banco'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Conta *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Conta Corrente Bradesco"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="bankCode">Código</Label>
              <Input
                id="bankCode"
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                placeholder="237"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency">Agência</Label>
              <Input
                id="agency"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                placeholder="0001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account">Conta</Label>
              <Input
                id="account"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="12345-6"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="balance">Saldo Inicial (R$)</Label>
            <Input
              id="balance"
              type="text"
              inputMode="numeric"
              value={initialBalance}
              onChange={(e) => setInitialBalance(formatCurrencyInput(e.target.value))}
              placeholder="0,00"
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <Label htmlFor="active" className="cursor-pointer">Conta ativa</Label>
            <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_invisible"
              checked={isCaixaGeral}
              onCheckedChange={(checked) => setIsCaixaGeral(!!checked)}
            />
            <Label htmlFor="is_invisible" className="cursor-pointer">
              Banco Invisível
            </Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()} className="flex-1">
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
