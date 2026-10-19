-- Bucket contact-documents: as políticas comparavam storage.foldername(c.name),
-- e dentro do EXISTS `name` resolvia para contacts.name (nome do cliente), não o
-- caminho do arquivo. Nunca batia: só super admin conseguia subir, ler ou apagar.
-- Achado 19/10/2026: colaborador levou "new row violates row-level security policy"
-- ao anexar o arquivo na renovação de certificado.

drop policy if exists "contact_docs tenant select" on storage.objects;
drop policy if exists "contact_docs tenant insert" on storage.objects;
drop policy if exists "contact_docs tenant delete" on storage.objects;

create policy "contact_docs tenant select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contact-documents' and (
      public.is_super_admin(auth.uid()) or exists (
        select 1 from public.contacts c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.company_id = public.get_user_company_id(auth.uid())
      )
    )
  );

create policy "contact_docs tenant insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contact-documents' and (
      public.is_super_admin(auth.uid()) or exists (
        select 1 from public.contacts c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.company_id = public.get_user_company_id(auth.uid())
      )
    )
  );

create policy "contact_docs tenant delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'contact-documents' and (
      public.is_super_admin(auth.uid()) or exists (
        select 1 from public.contacts c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.company_id = public.get_user_company_id(auth.uid())
      )
    )
  );
