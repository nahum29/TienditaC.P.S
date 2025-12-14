-- Limpiar solo datos de ventas (conservar clientes y productos)
-- IMPORTANTE: Ejecutar en el SQL Editor de Supabase como ADMIN
-- 
-- ⚠️ ADVERTENCIA: Esto eliminará TODAS las ventas, pagos y créditos
-- Los clientes y productos NO se tocarán
-- Útil para limpiar ventas de prueba manteniendo el catálogo real

BEGIN;

-- Eliminar solo las tablas relacionadas con ventas
-- Orden importante: primero las tablas dependientes
TRUNCATE TABLE
  public.credit_sales,      -- Relación créditos-ventas
  public.sale_items,        -- Items de cada venta
  public.payments,          -- Pagos realizados
  public.credits,           -- Créditos de clientes
  public.sales              -- Ventas principales
RESTART IDENTITY CASCADE;

COMMIT;

-- ============================================================================
-- RESULTADO DESPUÉS DE EJECUTAR ESTE SCRIPT:
-- ============================================================================
-- ✓ Todas las ventas eliminadas
-- ✓ Todos los pagos eliminados
-- ✓ Todos los créditos eliminados
-- ✓ Items de ventas eliminados
-- ✓ Relaciones crédito-venta eliminadas
--
-- ✅ CONSERVADO (NO se elimina):
-- ✓ Clientes
-- ✓ Productos
-- ✓ Categorías
-- ✓ Perfil de operador
--
-- NOTAS:
-- - Los contadores de ID de ventas se reinician a 1
-- - El balance de clientes NO se actualiza automáticamente
-- - Considera actualizar el balance de clientes a 0 si es necesario
--
-- OPCIONAL: Resetear balance de clientes después de limpiar ventas
-- Descomenta la siguiente línea si quieres poner todos los balances en 0:
-- UPDATE public.customers SET balance = 0;
-- ============================================================================
