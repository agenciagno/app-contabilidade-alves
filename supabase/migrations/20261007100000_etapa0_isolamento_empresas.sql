-- Etapa 0 da troca de conta: fecha regras que olhavam "é admin" sem olhar
-- "de qual empresa". Antes disso, o admin de um cliente externo via e podia
-- alterar dado da CA. Auditoria: reports/trocar-conta-auditoria-out2026.md (S1–S8).

-- Quem está na empresa interna (CA). Usa get_user_company_id para continuar
-- certo quando a empresa ativa passar a vir da sessão (etapa a).
create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select c.is_internal from public.companies c
      where c.id = public.get_user_company_id(auth.uid())),
    false
  )
$$;
revoke all on function public.is_internal_user() from public, anon;
grant execute on function public.is_internal_user() to authenticated, service_role;

-- S2/S5: cofre, certificados e avisos de certificado — admin só da própria empresa.
drop policy if exists "Admin ou modulo acessos gerencia acessos" on public.acessos_portais;
create policy "Admin ou modulo acessos gerencia acessos" on public.acessos_portais
  for all to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or exists (select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.company_id = acessos_portais.company_id
        and (p.role = 'admin' or 'acessos' = any(p.allowed_modules)))
  )
  with check (
    public.is_super_admin((select auth.uid()))
    or exists (select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.company_id = acessos_portais.company_id
        and (p.role = 'admin' or 'acessos' = any(p.allowed_modules)))
  );

drop policy if exists "Admin ou modulo cadastro gerencia certificados" on public.certificates;
create policy "Admin ou modulo cadastro gerencia certificados" on public.certificates
  for all to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or exists (select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.company_id = certificates.company_id
        and (p.role = 'admin' or 'cadastro' = any(p.allowed_modules)))
  )
  with check (
    public.is_super_admin((select auth.uid()))
    or exists (select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.company_id = certificates.company_id
        and (p.role = 'admin' or 'cadastro' = any(p.allowed_modules)))
  );

drop policy if exists "Admin ou modulo cadastro gerencia notificacoes de certificado" on public.certificate_client_notifications;
create policy "Admin ou modulo cadastro gerencia notificacoes de certificado" on public.certificate_client_notifications
  for all to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or exists (select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.company_id = certificate_client_notifications.company_id
        and (p.role = 'admin' or 'cadastro' = any(p.allowed_modules)))
  )
  with check (
    public.is_super_admin((select auth.uid()))
    or exists (select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.company_id = certificate_client_notifications.company_id
        and (p.role = 'admin' or 'cadastro' = any(p.allowed_modules)))
  );

-- S3/S5: auditoria e log do cofre não têm company_id e são da CA —
-- só admin da empresa interna (ou super admin).
drop policy if exists "Admin ve audit log completo" on public.historico_eventos;
create policy "Admin ve audit log completo" on public.historico_eventos
  for select to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or (public.is_internal_user() and public.is_company_admin((select auth.uid())))
  );

drop policy if exists "Admin ve log completo de acessos" on public.cofre_acessos_log;
create policy "Admin ve log completo de acessos" on public.cofre_acessos_log
  for select to authenticated
  using (
    public.is_super_admin((select auth.uid()))
    or (public.is_internal_user() and public.is_company_admin((select auth.uid())))
  );

-- S4: calendário fiscal e feriados são de todos — só a CA altera.
drop policy if exists "Admin insere fiscal calendar" on public.fiscal_calendar;
drop policy if exists "Admin atualiza fiscal calendar" on public.fiscal_calendar;
drop policy if exists "Admin deleta fiscal calendar" on public.fiscal_calendar;
create policy "Admin insere fiscal calendar" on public.fiscal_calendar
  for insert to authenticated
  with check (public.is_super_admin((select auth.uid())) or (public.is_internal_user() and public.is_company_admin((select auth.uid()))));
create policy "Admin atualiza fiscal calendar" on public.fiscal_calendar
  for update to authenticated
  using (public.is_super_admin((select auth.uid())) or (public.is_internal_user() and public.is_company_admin((select auth.uid()))));
create policy "Admin deleta fiscal calendar" on public.fiscal_calendar
  for delete to authenticated
  using (public.is_super_admin((select auth.uid())) or (public.is_internal_user() and public.is_company_admin((select auth.uid()))));

drop policy if exists "Admin insere holidays" on public.national_holidays;
drop policy if exists "Admin atualiza holidays" on public.national_holidays;
drop policy if exists "Admin deleta holidays" on public.national_holidays;
create policy "Admin insere holidays" on public.national_holidays
  for insert to authenticated
  with check (public.is_super_admin((select auth.uid())) or (public.is_internal_user() and public.is_company_admin((select auth.uid()))));
create policy "Admin atualiza holidays" on public.national_holidays
  for update to authenticated
  using (public.is_super_admin((select auth.uid())) or (public.is_internal_user() and public.is_company_admin((select auth.uid()))));
create policy "Admin deleta holidays" on public.national_holidays
  for delete to authenticated
  using (public.is_super_admin((select auth.uid())) or (public.is_internal_user() and public.is_company_admin((select auth.uid()))));

-- S1: boletos são da CA (gerados pelo sicoob-boletos com service role;
-- a tela só cria link assinado). Caminho não tem empresa, então: só a CA.
drop policy if exists "boletos_select_authenticated" on storage.objects;
create policy "boletos_select_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'boletos' and (public.is_super_admin(auth.uid()) or public.is_internal_user()));

-- S6: classificação fiscal — caminho começa pelo company_id; tira o anônimo.
drop policy if exists "fiscal_classifications_select_authenticated" on storage.objects;
drop policy if exists "fiscal_classifications_insert_authenticated" on storage.objects;
create policy "fiscal_classifications_select_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'fiscal-classifications'
    and (public.is_super_admin(auth.uid())
      or (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text));
create policy "fiscal_classifications_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fiscal-classifications'
    and (public.is_super_admin(auth.uid())
      or (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text));

-- S7: logos e avatares — cada um só escreve o próprio arquivo.
-- Logo: "<company_id>.<ext>" (admin da empresa). Avatar: "avatars/<user_id>.<ext>".
drop policy if exists "Users can upload their company logo" on storage.objects;
drop policy if exists "Users can update their company logo" on storage.objects;
drop policy if exists "Users can delete their company logo" on storage.objects;
create policy "Users can upload their company logo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-logos' and (
    public.is_super_admin(auth.uid())
    or name like 'avatars/' || auth.uid()::text || '.%'
    or (name like public.get_user_company_id(auth.uid())::text || '.%' and public.is_company_admin(auth.uid()))
  ));
create policy "Users can update their company logo" on storage.objects
  for update to authenticated
  using (bucket_id = 'company-logos' and (
    public.is_super_admin(auth.uid())
    or name like 'avatars/' || auth.uid()::text || '.%'
    or (name like public.get_user_company_id(auth.uid())::text || '.%' and public.is_company_admin(auth.uid()))
  ));
create policy "Users can delete their company logo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-logos' and (
    public.is_super_admin(auth.uid())
    or name like 'avatars/' || auth.uid()::text || '.%'
    or (name like public.get_user_company_id(auth.uid())::text || '.%' and public.is_company_admin(auth.uid()))
  ));

-- S8: usuário bloqueado não se desbloqueia sozinho.
create or replace function public.fn_block_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.allowed_modules IS DISTINCT FROM OLD.allowed_modules
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.status_active IS DISTINCT FROM OLD.status_active
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Alteração de papel, módulos, empresa ou status de acesso deve ser feita por um administrador pelo painel de usuários.';
  END IF;
  RETURN NEW;
END;
$function$;
