-- Gestão 360° · Rodada 4: foto diária da carteira, 08:20 de Brasília (11:20 UTC), depois dos alertas das 08:15. Sem custo no Serpro.
-- APLICAR SÓ DEPOIS de a migration 20261002140000 estar aplicada.
select cron.schedule('gestao360-foto-0820', '20 11 * * *', $$select public.gestao360_foto_diaria();$$);
