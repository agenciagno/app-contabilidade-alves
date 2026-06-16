import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Upload, User, Mail, Lock, Eye, EyeOff, AlertCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PasswordStrength, isPasswordStrong } from '@/components/ui/PasswordStrength';
import { useNavigate } from 'react-router-dom';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user } = useAuth();
  const { fullName: currentName, avatarUrl, email: currentEmail } = useUserRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Email change
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (open && currentName) setFullName(currentName);
  }, [open, currentName]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['user-role-profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Perfil atualizado!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Máximo 2MB'); return; }
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `avatars/${user.id}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      const url = publicUrl + '?t=' + Date.now();
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
      if (updateError) throw updateError;
      queryClient.invalidateQueries({ queryKey: ['user-role-profile'] });
      toast.success('Avatar atualizado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail) return;
    setChangingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setEmailSent(true);
      toast.success('Verifique o novo email para confirmar a alteração!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar email');
    } finally {
      setChangingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) { toast.error('Preencha todos os campos de senha'); return; }
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem'); return; }
    if (!isPasswordStrong(newPassword)) { toast.error('A senha não atende aos requisitos mínimos'); return; }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Senha alterada com sucesso!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar senha');
    } finally {
      setChangingPassword(false);
    }
  };

  const initials = (fullName || currentEmail || 'U').substring(0, 2).toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Meu Perfil</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
              <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
                {uploadingAvatar ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {avatarUrl ? 'Alterar Foto' : 'Enviar Foto'}
              </Button>
              <p className="text-xs text-muted-foreground">PNG, JPG até 2MB</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>

          <Separator />

          {/* Nome */}
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <div className="flex gap-2">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
              <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm">
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>Email atual</Label>
            <Input value={user?.email || ''} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label>Alterar Email</Label>
            {emailSent && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Verifique o novo email para confirmar.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="novo@email.com"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setEmailSent(false); }}
              />
              <Button onClick={handleChangeEmail} disabled={changingEmail || !newEmail} variant="outline" size="sm">
                {changingEmail && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Alterar
              </Button>
            </div>
          </div>

          <Separator />

          {/* Senha */}
          <div className="space-y-3">
            <Label className="font-semibold">Alterar Senha</Label>
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nova senha"
                  className="pl-10 pr-10"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword && <PasswordStrength password={newPassword} />}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirmar nova senha"
                  className="pl-10 pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button variant="outline" onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Alterar Senha
            </Button>
          </div>

          <Separator />

          {/* Lixeira link */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => { onOpenChange(false); navigate('/configuracoes?tab=lixeira'); }}
          >
            <Trash2 className="w-4 h-4" />
            Lixeira
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
