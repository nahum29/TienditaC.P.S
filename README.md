# 🛒 Tiendita C.P.S

Sistema de Punto de Venta para pequeñas tiendas.

**Interfaz en Español** | **Supabase** | **Next.js 16**

## 🚀 Inicio Rápido

```bash
# Variables de entorno
# Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local

# Inicia la app
npm run dev

# Build para producción
npm run build
```

Abre: http://localhost:3000

## ✨ Módulos

- 📊 **Dashboard** - Estadísticas en tiempo real
- 💳 **POS** - Punto de venta con carrito
- 📦 **Inventario** - Gestión de productos
- 👥 **Clientes** - Registro y crédito
- 💰 **Créditos** - Seguimiento de deudas
- 📋 **Ventas** - Historial de transacciones

## 🛠️ Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS + Lucide Icons
- Supabase PostgreSQL
- React Hot Toast

## 📝 Estructura

```
src/
├── app/
│   ├── dashboard/
│   ├── inventory/
│   ├── pos/
│   ├── customers/
│   ├── credits/
│   └── sales/
├── components/  (navbar, sidebar, modal, button, table)
└── lib/supabase/ (configuración)
```

## ⚙️ Configuración

1. Configura `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=tu_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_key
```

2. Crea las tablas en Supabase (SQL schema)

3. Inicia: `npm run dev`

## 🎯 Características

✅ Múltiples métodos de pago (efectivo, tarjeta, crédito)
✅ Gestión de inventario
✅ Seguimiento de créditos de clientes
✅ Historial de ventas
✅ Interfaz responsiva
✅ Sin autenticación requerida

---

Listo para producción. Despliega en Netlify. 🚀
