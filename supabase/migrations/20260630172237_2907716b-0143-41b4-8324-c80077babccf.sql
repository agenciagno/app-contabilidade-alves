ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS display_name text;
UPDATE public.contacts SET display_name = nome_fantasia WHERE display_name IS NULL;