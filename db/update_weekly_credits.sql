-- Actualización para sistema de créditos semanales (Sábado a Sábado)
-- Este script modifica la tabla credits para soportar notas semanales

BEGIN;

-- Crear tabla para relacionar ventas con créditos (muchos a uno)
CREATE TABLE IF NOT EXISTS public.credit_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL REFERENCES public.credits(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(credit_id, sale_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_sales_credit_id ON public.credit_sales(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_sales_sale_id ON public.credit_sales(sale_id);

-- Agregar campos para identificar la semana de crédito
ALTER TABLE public.credits
ADD COLUMN IF NOT EXISTS week_start date NULL,
ADD COLUMN IF NOT EXISTS week_end date NULL;

-- Crear índice para mejorar búsquedas por semana
CREATE INDEX IF NOT EXISTS idx_credits_week_start ON public.credits(week_start);
CREATE INDEX IF NOT EXISTS idx_credits_customer_week ON public.credits(customer_id, week_start);

-- Función para obtener el inicio de la semana (sábado a las 00:00)
CREATE OR REPLACE FUNCTION public.get_week_start(input_date timestamptz)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  day_of_week int;
  result date;
BEGIN
  -- Obtener día de la semana (0=domingo, 6=sábado)
  day_of_week := EXTRACT(DOW FROM input_date);
  
  -- Si es sábado y la hora es 00:00:00, ese es el inicio
  -- Si no, retroceder al sábado anterior
  IF day_of_week = 6 THEN
    result := input_date::date;
  ELSE
    -- Retroceder al sábado anterior
    result := (input_date - ((day_of_week + 1) || ' days')::interval)::date;
  END IF;
  
  RETURN result;
END;
$$;

-- Función para obtener el fin de la semana (viernes 23:59:59)
CREATE OR REPLACE FUNCTION public.get_week_end(week_start_date date)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN week_start_date + 6; -- Sábado a viernes (7 días)
END;
$$;

-- Trigger para auto-calcular week_start y week_end al crear un crédito
CREATE OR REPLACE FUNCTION public.credits_set_week()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.week_start IS NULL THEN
    NEW.week_start := public.get_week_start(NEW.created_at);
  END IF;
  
  IF NEW.week_end IS NULL THEN
    NEW.week_end := public.get_week_end(NEW.week_start);
  END IF;
  
  -- Auto-establecer due_date al final de la semana si no está establecido
  IF NEW.due_date IS NULL THEN
    NEW.due_date := NEW.week_end;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credits_set_week ON public.credits;
CREATE TRIGGER trg_credits_set_week
BEFORE INSERT ON public.credits
FOR EACH ROW
EXECUTE FUNCTION public.credits_set_week();

-- Actualizar créditos existentes para que tengan week_start y week_end
UPDATE public.credits
SET 
  week_start = public.get_week_start(created_at),
  week_end = public.get_week_end(public.get_week_start(created_at))
WHERE week_start IS NULL;

-- Función para verificar si un crédito está atrasado
-- Un crédito está atrasado si su semana ya terminó (pasó el sábado 00:00) y aún tiene saldo
CREATE OR REPLACE FUNCTION public.update_overdue_credits()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.credits
  SET status = 'overdue'
  WHERE status = 'open'
    AND outstanding_amount > 0
    AND week_end < CURRENT_DATE
    AND EXTRACT(DOW FROM CURRENT_TIMESTAMP) = 6  -- Es sábado
    AND EXTRACT(HOUR FROM CURRENT_TIMESTAMP) = 0; -- Es medianoche
END;
$$;

COMMIT;

-- Notas:
-- 1. Ejecutar este script como ADMIN en Supabase SQL Editor
-- 2. Los créditos ahora tienen week_start y week_end automáticos
-- 3. Cada semana va de sábado 00:00 a viernes 23:59:59
-- 4. Puedes ejecutar update_overdue_credits() manualmente o con un cron job
