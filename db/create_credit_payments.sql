-- Create a table to record allocations of payments to credits
-- Run this in Supabase SQL editor as an admin

BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_id uuid NOT NULL REFERENCES public.credits(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_id ON public.credit_payments(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_payment_id ON public.credit_payments(payment_id);

COMMIT;
