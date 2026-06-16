import { ShieldCheck } from 'lucide-react';

export function ContactCertificatesTab() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-center">
      <ShieldCheck className="h-20 w-20 text-muted-foreground/30" />
      <h2 className="text-4xl font-black tracking-widest text-foreground">EM BREVE</h2>
      <p className="text-muted-foreground text-base">Gestão de CNDs e Alvarás digitais</p>
    </div>
  );
}
