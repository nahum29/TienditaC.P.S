-- Clean and seed minimal data for Tiendita C.P.S
-- IMPORTANT: Run this in Supabase SQL editor as a project ADMIN (service role).
-- This script truncates app tables and inserts a default operator profile required by the app.

BEGIN;

-- Truncate app tables. Order and CASCADE used to safely remove dependent rows.
TRUNCATE TABLE
  public.sale_items,
  public.payments,
  public.credits,
  public.sales,
  public.products,
  public.customers,
  public.profiles,
  public.categories
RESTART IDENTITY CASCADE;

-- Recreate the single-operator profile expected by the app.
-- Make sure this ID matches `OPERATOR_ID` in `src/lib/supabase/client.ts`
INSERT INTO public.profiles (id, full_name, role, created_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'Operador', 'operator', NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

COMMIT;

-- Notes:
-- - Run in the Supabase SQL editor as an admin (or from psql as a DB owner).
-- - This removes ALL data from the listed app tables. Backup first if you need to keep records.
-- - If your project uses extra custom tables, add them to the TRUNCATE list as needed.
