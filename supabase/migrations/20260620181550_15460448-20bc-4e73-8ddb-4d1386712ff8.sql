-- Fix RLS policies on fiscal_period_status: existing policies referenced profiles.id = auth.uid()
-- but profiles uses a separate user_id column linked to auth.users. Recreate them.

DROP POLICY IF EXISTS admin_insert_period ON public.fiscal_period_status;
DROP POLICY IF EXISTS admin_update_period ON public.fiscal_period_status;
DROP POLICY IF EXISTS select_own_company_period ON public.fiscal_period_status;

CREATE POLICY select_own_company_period
ON public.fiscal_period_status
FOR SELECT
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY admin_insert_period
ON public.fiscal_period_status
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND (role IN ('admin','super_admin') OR is_super_admin = true)
  )
);

CREATE POLICY admin_update_period
ON public.fiscal_period_status
FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND (role IN ('admin','super_admin') OR is_super_admin = true)
  )
);