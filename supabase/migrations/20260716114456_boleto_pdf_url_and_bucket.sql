-- Boletos: suporte a PDF e geração via edge function (F2 Sicoob)
alter table public.boleto_controls
  add column if not exists pdf_url text;

comment on column public.boleto_controls.pdf_url is 'Caminho do PDF do boleto no Storage bucket "boletos" (base64 do Sicoob salvo na geração).';

-- Bucket privado para PDFs de boletos
insert into storage.buckets (id, name, public)
values ('boletos', 'boletos', false)
on conflict (id) do nothing;

-- Staff autenticado pode ler os PDFs (necessário para gerar signed URLs no front)
drop policy if exists "boletos_select_authenticated" on storage.objects;
create policy "boletos_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'boletos');
