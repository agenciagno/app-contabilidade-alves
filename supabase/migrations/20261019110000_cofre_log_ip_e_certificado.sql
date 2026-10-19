-- Log de auditoria do Cofre nunca gravou (0 linhas até 19/10/2026):
-- cofre-revelar mandava `ip_address`, coluna que não existia; certificado-revelar
-- punha o id do certificado em acesso_id, que tem FK para acessos_portais.
-- Os dois ignoravam o erro do insert.
-- Certificado ganha coluna própria; apagar o certificado não apaga o histórico.

set lock_timeout = '3s';

alter table public.cofre_acessos_log
  add column if not exists ip_address text,
  add column if not exists certificate_id uuid references public.certificates(id) on delete set null;
