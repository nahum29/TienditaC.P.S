-- Clean and seed minimal data for Tiendita C.P.S
-- IMPORTANT: Run this in Supabase SQL editor as a project ADMIN (service role).
-- This script truncates app tables and inserts a default operator profile required by the app.
-- 
-- ⚠️ WARNING: This will DELETE ALL DATA from your database!
-- Make sure to backup your data before running this script.

BEGIN;

-- Truncate app tables in correct order to respect foreign key constraints.
-- Tables with dependencies must be truncated first (child tables before parent tables).
TRUNCATE TABLE
  public.credit_sales,      -- Junction table: credits + sales (added for weekly credit system)
  public.sale_items,        -- Depends on: sales, products
  public.payments,          -- Depends on: sales, customers
  public.credits,           -- Depends on: customers, sales (optional)
  public.sales,             -- Depends on: customers (optional), profiles
  public.products,          -- Depends on: categories (optional)
  public.customers,         -- Independent table
  public.categories,        -- Independent table
  public.profiles           -- Independent table (used for operator tracking)
RESTART IDENTITY CASCADE;

-- Recreate the single-operator profile expected by the app.
-- Make sure this ID matches `OPERATOR_ID` in `src/lib/supabase/client.ts`
INSERT INTO public.profiles (id, full_name, role, created_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'Operador', 'operator', NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

COMMIT;

-- Notes:
-- - Run in the Supabase SQL editor as an admin (or from psql as a DB owner).
-- - This removes ALL DATA from the listed app tables. Backup first if you need to keep records.
-- - Tables are truncated in dependency order: child tables first, then parent tables.
-- - RESTART IDENTITY resets auto-incrementing sequences to start from 1.
-- - CASCADE ensures all dependent rows are also removed.
-- - The operator profile with ID '00000000-0000-0000-0000-000000000000' is required for the app to function.
-- - After running this, you'll have a clean database ready for production or new test data.
