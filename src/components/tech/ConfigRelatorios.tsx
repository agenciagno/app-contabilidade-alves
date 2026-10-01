import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DsBadge } from '@/components/ds';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useProfile } from '@/hooks/useProfile';
import { useRelatorioConfig, useSalvarRelatorioConfig } from '@/hooks/useRelatoriosCliente';

/** Contador que assina o Relatório de Faturamento e a validação do modelo. Só administrador altera; mudar o contador derruba a validação. */
export function ConfigRelatorios() {
  const { data: cfg } = useRelatorioConfig();
  const salvar = useSalvarRelatorioConfig();
  const { profile } = useProfile();
  const admin = profile?.is_super_admin === true || profile?.role === 'admin';
  const [nome, setNome] = useState('');
  const [crc, setCrc] = useState('');
  const [cpf, setCpf] = useState('');
  useEffect(() => { if (cfg) { setNome(cfg.contador_nome); setCrc(cfg.contador_crc); setCpf(cfg.contador_cpf); } }, [cfg]);

  const mudou = !!cfg && (nome.trim() !== cfg.contador_nome || crc.trim() !== cfg.contador_crc || cpf.trim() !== cfg.contador_cpf);
  const salvoCompleto = !!cfg && !!cfg.contador_nome.trim() && !!cfg.contador_crc.trim() && !!cfg.contador_cpf.trim();
  const validado = cfg?.faturamento_validado ?? false;

  const gravar = async () => {
    try { await salvar.mutateAsync({ contador: { nome, crc, cpf } }); toast.success(validado ? 'Dados salvos. A validação do modelo foi desfeita: valide de novo.' : 'Dados do contador salvos.'); }
    catch { toast.error('Não foi possível salvar. Só administrador altera estes dados.'); }
  };
  const validar = async (v: boolean) => {
    try { await salvar.mutateAsync({ validado: v }); toast.success(v ? 'Modelo validado: o relatório já pode ir ao cliente.' : 'Modelo desvalidado: o relatório volta a ser só rascunho.'); }
    catch { toast.error('Não foi possível salvar.'); }
  };

  return (
    <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
      <div className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 text-h4-card text-ink">Relatório de Faturamento: assinatura e validação <DsBadge tone={validado ? 'ok' : 'warn'}>{validado ? 'Modelo validado' : 'Aguardando validação'}</DsBadge></h2>
        <p className="text-ui text-muted-ink">
          O relatório de faturamento dos últimos 12 meses sai com a assinatura do contador. Preencha os dados, baixe o <strong className="text-ink">rascunho</strong> na ficha de um cliente (Portal 360°)
          e peça ao contador para conferir o texto e a assinatura. Só depois ligue <strong className="text-ink">Modelo validado</strong>. Sem a validação, o relatório só sai como rascunho e <strong className="text-ink">não vai ao cliente</strong>.
          Mudar nome, CRC ou CPF desfaz a validação.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1.5"><Label className="text-ink">Nome do contador</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!admin} maxLength={120} /></div>
        <div className="space-y-1.5"><Label className="text-ink">CRC</Label><Input value={crc} onChange={(e) => setCrc(e.target.value)} disabled={!admin} maxLength={30} placeholder="Ex.: MG-000000/O" /></div>
        <div className="space-y-1.5"><Label className="text-ink">CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} disabled={!admin} maxLength={20} placeholder="000.000.000-00" /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button onClick={gravar} disabled={!admin || !mudou || salvar.isPending}>Salvar dados</Button>
        <div className="flex items-center gap-3">
          <span className="text-ui text-ink">Modelo validado pelo contador{cfg?.validado_em && validado ? <span className="text-meta text-muted-ink-2"> · em {cfg.validado_em.slice(0, 10).split('-').reverse().join('/')}</span> : null}</span>
          <DicaBotao texto={!admin ? 'Só administrador altera.' : mudou || !salvoCompleto ? 'Salve nome, CRC e CPF do contador antes de validar.' : validado ? 'Ligado: o relatório de faturamento pode ir ao cliente. Desligue para voltar ao rascunho.' : 'Ligue só depois que o contador conferir o texto e a assinatura do rascunho.'}>
            <Switch checked={validado} disabled={!admin || mudou || !salvoCompleto || salvar.isPending} onCheckedChange={validar} />
          </DicaBotao>
        </div>
      </div>
    </section>
  );
}
