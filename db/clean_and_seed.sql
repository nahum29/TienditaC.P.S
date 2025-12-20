-- Clean and seed minimal data for Tiendita C.P.S
-- IMPORTANT: Run this in Supabase SQL editor as a project ADMIN (service role).
-- This script truncates ALL app tables and prepares the database for production use.
-- 
-- ⚠️ ADVERTENCIA CRÍTICA: Esto BORRARÁ TODOS LOS DATOS de prueba de la base de datos!
-- Ejecutar solo cuando estés listo para iniciar con datos de producción reales.
-- NO HAY FORMA DE RECUPERAR LOS DATOS después de ejecutar este script.

BEGIN;

-- Truncate ALL app tables in correct order to respect foreign key constraints.
-- Order is critical: child tables (with foreign keys) must be truncated before parent tables.
TRUNCATE TABLE
  public.credit_sales,      -- Junction table: many-to-many between credits and sales
  public.sale_items,        -- Items in each sale (depends on: sales, products)
  public.payments,          -- Payment records (depends on: sales, customers)
  public.credits,           -- Credit accounts per customer per week (depends on: customers, sales)
  public.sales,             -- All sales (depends on: customers, profiles)
  public.products,          -- Product catalog (depends on: categories)
  public.customers,         -- Customer directory
  public.categories,        -- Product categories
  public.profiles           -- User/operator profiles (EXCEPT the system operator)
RESTART IDENTITY CASCADE;

-- Recreate the single-operator profile required by the app to function.
-- This ID must match `OPERATOR_ID` in `src/lib/supabase/client.ts`
INSERT INTO public.profiles (id, full_name, role, created_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'Operador', 'operator', NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

COMMIT;

-- ============================================================================
-- RESULTADO DESPUÉS DE EJECUTAR ESTE SCRIPT:
-- ============================================================================
-- ✓ Todos los datos de prueba eliminados
-- ✓ Perfil de operador del sistema restaurado
-- ✓ Base de datos lista para datos de producción
-- ✓ Contadores de ID reiniciados a 1
--
-- PRÓXIMOS PASOS:
-- 1. Verificar que el script se ejecutó sin errores
-- 2. Crear categorías de productos reales
-- 3. Agregar productos del inventario real
-- 4. Registrar clientes reales
-- 5. Comenzar a usar el sistema en producción
--
-- NOTAS TÉCNICAS:
-- - TRUNCATE elimina todos los datos pero mantiene la estructura de las tablas
-- - RESTART IDENTITY reinicia los contadores automáticos a 1
-- - CASCADE elimina automáticamente filas dependientes
-- - La transacción (BEGIN/COMMIT) asegura que todo se ejecute o nada
-- - Si algo falla, ejecutar: ROLLBACK;
-- ============================================================================
