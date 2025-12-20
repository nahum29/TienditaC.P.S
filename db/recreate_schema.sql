-- Recreate full POS schema for Tiendita C.P.S
-- Run this in Supabase SQL editor as a PROJECT ADMIN (service role).
-- This script drops and recreates tables used by the app and seeds the required operator profile.
-- WARNING: Running this will DESTROY existing app data. Backup first if needed.

BEGIN;

-- Enable pgcrypto for gen_random_uuid if not present
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop tables in dependency order if they exist
DROP TABLE IF EXISTS public.credit_payments CASCADE;
DROP TABLE IF EXISTS public.sale_items CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.credits CASCADE;
DROP TABLE IF EXISTS public.sales CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Profiles (operators/users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NULL,
  email text NULL,
  role text NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles(full_name);

-- Categories (optional)
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE,
  name text NOT NULL,
  description text NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NULL,
  stock integer NOT NULL DEFAULT 0, -- For bulk: stored in grams; for units: integer count
  low_stock_threshold integer NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_bulk boolean NOT NULL DEFAULT false, -- TRUE = producto a granel (peso), FALSE = por unidad
  barcode text NULL, -- Código de barras real del producto (opcional)
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);

-- Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NULL,
  email text NULL,
  address text NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- Sales
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_cost numeric(12,2) NULL,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);

-- Sale items
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

-- Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  received_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON public.payments(sale_id);

-- Credits
CREATE TABLE public.credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(12,2) NULL,
  due_date date NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credits_customer_id ON public.credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_credits_status ON public.credits(status);

-- Trigger to default outstanding_amount to total_amount on insert if NULL
CREATE OR REPLACE FUNCTION public.credits_fill_outstanding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outstanding_amount IS NULL THEN
    NEW.outstanding_amount := NEW.total_amount;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credits_fill_outstanding ON public.credits;
CREATE TRIGGER trg_credits_fill_outstanding
BEFORE INSERT ON public.credits
FOR EACH ROW
EXECUTE FUNCTION public.credits_fill_outstanding();

-- Credit payments (allocations)
CREATE TABLE public.credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL REFERENCES public.credits(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_id ON public.credit_payments(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_payment_id ON public.credit_payments(payment_id);

-- Optional: simple view to get allocations per credit (helpful for UI)
CREATE OR REPLACE VIEW public.credit_allocations AS
SELECT
  cp.id,
  cp.credit_id,
  cp.payment_id,
  cp.amount,
  cp.created_at,
  p.customer_id
FROM public.credit_payments cp
LEFT JOIN public.payments p ON p.id = cp.payment_id;

-- Seed operator profile used by the app
-- Make sure this ID equals OPERATOR_ID in your frontend config
INSERT INTO public.profiles (id, full_name, role, created_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'Operador', 'operator', now())
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

COMMIT;

-- End of script
-- Notes:
-- - Run this as an ADMIN (service role) in Supabase SQL editor.
-- - The trigger ensures new credits with NULL outstanding_amount will receive total_amount.
-- - If you need sample seed data (customers, products, credits), I can add optional INSERTs below.
