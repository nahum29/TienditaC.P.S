'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Modal } from '@/components/modal';
import { TrendingUp, AlertTriangle, Users, ShoppingCart } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import toast from 'react-hot-toast';

type Product = Database['public']['Tables']['products']['Row'];
type Sale = Database['public']['Tables']['sales']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];
type SaleItem = Database['public']['Tables']['sale_items']['Row'];

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalProfit: 0,
    lowStockProducts: 0,
    customersWithDebt: 0,
  });
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [salesChartData, setSalesChartData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [previousMonthStats, setPreviousMonthStats] = useState({ revenue: 0, sales: 0 });
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportStart, setReportStart] = useState<string>('');
  const [reportEnd, setReportEnd] = useState<string>('');
  const [reportSections, setReportSections] = useState({ sales: true, products: true, customers: false, payments: false });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const [salesRes, productsRes, customersRes, recentSalesRes, saleItemsRes, prevMonthSalesRes] = await Promise.all([
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('products').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('sales').select('*').gte('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: false }),
        supabase.from('sale_items').select('*, product:products(name)').gte('created_at', startOfMonth.toISOString()),
        supabase.from('sales').select('*').gte('created_at', startOfPrevMonth.toISOString()).lte('created_at', endOfPrevMonth.toISOString()),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;

      const sales = salesRes.data || [];
      const products = productsRes.data || [];
      const customers = customersRes.data || [];
      const recentSalesData = recentSalesRes.data || [];
      const saleItems = saleItemsRes.data || [];
      const prevMonthSales = prevMonthSalesRes.data || [];

      const totalRevenue = sales.reduce((sum: number, s: Sale) => sum + s.total_amount, 0);
      const totalProfit = sales.reduce((sum: number, s: Sale) => sum + (s.total_amount - (s.total_cost || 0)), 0);
      const low = products.filter((p: Product) => p.stock <= (p.low_stock_threshold || 5));
      const withDebt = customers.filter((c: Customer) => c.balance > 0);

      setStats({
        totalSales: sales.length,
        totalRevenue,
        totalProfit,
        lowStockProducts: low.length,
        customersWithDebt: withDebt.length,
      });

      // Estadísticas del mes anterior
      const prevRevenue = prevMonthSales.reduce((sum: number, s: Sale) => sum + s.total_amount, 0);
      setPreviousMonthStats({
        revenue: prevRevenue,
        sales: prevMonthSales.length,
      });

      setRecentSales(sales.slice(0, 5));
      setLowStockProducts(low.slice(0, 5));

      // Preparar datos para gráfica de ventas por día (últimos 30 días)
      const salesByDay: { [key: string]: number } = {};
      recentSalesData.forEach((sale: Sale) => {
        const date = new Date(sale.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
        salesByDay[date] = (salesByDay[date] || 0) + sale.total_amount;
      });

      const chartData = Object.entries(salesByDay)
        .map(([date, total]) => ({ date, total }))
        .slice(-14); // Últimos 14 días

      setSalesChartData(chartData);

      // Top 10 productos más vendidos
      const productSales: { [key: string]: { name: string; quantity: number; revenue: number } } = {};
      saleItems.forEach((item: any) => {
        const productName = item.product?.name || 'Desconocido';
        if (!productSales[productName]) {
          productSales[productName] = { name: productName, quantity: 0, revenue: 0 };
        }
        productSales[productName].quantity += item.quantity;
        productSales[productName].revenue += item.total_price;
      });

      const topProductsData = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      setTopProducts(topProductsData);
    } catch (error) {
      toast.error('Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      if (!reportStart || !reportEnd) {
        toast.error('Selecciona rango de fechas');
        return;
      }
      const start = new Date(reportStart + 'T00:00:00').toISOString();
      const end = new Date(reportEnd + 'T23:59:59').toISOString();

      toast.loading('Generando informe...');

      // Crear un nuevo libro de trabajo (workbook)
      const wb = XLSX.utils.book_new();

      // Sección de Ventas con productos
      if (reportSections.sales) {
        const salesRes = await supabase
          .from('sales')
          .select(`
            *,
            customer:customers(name),
            sale_items(
              quantity,
              unit_price,
              total_price,
              product:products(name, sku)
            )
          `)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: true });
        if (salesRes.error) throw salesRes.error;
        const sales = salesRes.data || [];
        
        // Crear filas detalladas con cada producto
        const salesData: any[] = [];
        sales.forEach((s: any) => {
          if (s.sale_items && s.sale_items.length > 0) {
            s.sale_items.forEach((item: any, index: number) => {
              salesData.push({
                'Fecha': new Date(s.created_at).toLocaleDateString('es-MX'),
                'Hora': new Date(s.created_at).toLocaleTimeString('es-MX'),
                'Cliente': s.customer?.name || 'Venta directa',
                'Producto': item.product?.name || '-',
                'SKU': item.product?.sku || '-',
                'Cantidad': item.quantity,
                'Precio Unitario': item.unit_price,
                'Subtotal': item.total_price,
                'Total Venta': index === 0 ? s.total_amount : '',
                'Costo Total': index === 0 ? (s.total_cost || 0) : '',
                'Ganancia': index === 0 ? (s.total_amount - (s.total_cost || 0)) : '',
                'Estado': index === 0 ? (s.status === 'paid' ? 'Pagado' : 'Crédito') : '',
              });
            });
          } else {
            // Venta sin items
            salesData.push({
              'Fecha': new Date(s.created_at).toLocaleDateString('es-MX'),
              'Hora': new Date(s.created_at).toLocaleTimeString('es-MX'),
              'Cliente': s.customer?.name || 'Venta directa',
              'Producto': '-',
              'SKU': '-',
              'Cantidad': 0,
              'Precio Unitario': 0,
              'Subtotal': 0,
              'Total Venta': s.total_amount,
              'Costo Total': s.total_cost || 0,
              'Ganancia': s.total_amount - (s.total_cost || 0),
              'Estado': s.status === 'paid' ? 'Pagado' : 'Crédito',
            });
          }
        });
        
        const ws = XLSX.utils.json_to_sheet(salesData);
        
        ws['!cols'] = [
          { wch: 12 }, // Fecha
          { wch: 12 }, // Hora
          { wch: 25 }, // Cliente
          { wch: 30 }, // Producto
          { wch: 15 }, // SKU
          { wch: 10 }, // Cantidad
          { wch: 15 }, // Precio Unitario
          { wch: 12 }, // Subtotal
          { wch: 12 }, // Total Venta
          { wch: 12 }, // Costo Total
          { wch: 12 }, // Ganancia
          { wch: 12 }, // Estado
        ];
        
        ws['!autofilter'] = { ref: `A1:L${salesData.length + 1}` };
        
        XLSX.utils.book_append_sheet(wb, ws, 'Ventas Detalladas');
      }

      // Sección de Inventario
      if (reportSections.products) {
        const prodRes = await supabase.from('products').select('*').order('name');
        if (prodRes.error) throw prodRes.error;
        const products = prodRes.data || [];
        
        const productsData = products.map((p: any) => {
          const stockDisplay = p.is_bulk ? `${(p.stock/1000).toFixed(3)} kg` : p.stock;
          const stockNumerico = p.is_bulk ? (p.stock/1000) : p.stock;
          const margen = p.price && p.cost ? ((p.price - p.cost) / p.price * 100).toFixed(1) : 0;
          const valorInventario = stockNumerico * (p.cost || 0);
          
          return {
            'Nombre': p.name,
            'SKU': p.sku || '-',
            'Código de Barras': p.barcode || '-',
            'Stock Actual': stockDisplay,
            'Stock Numérico': stockNumerico,
            'Tipo': p.is_bulk ? 'A Granel (kg)' : 'Por Unidad',
            'Precio Venta': p.price || 0,
            'Costo': p.cost || 0,
            'Margen %': margen,
            'Valor Inventario': valorInventario.toFixed(2),
            'Umbral Mínimo': p.low_stock_threshold || 5,
            'Estado Stock': stockNumerico <= (p.low_stock_threshold || 5) ? 'BAJO' : 'Normal',
            'Fecha Registro': p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX') : '-',
          };
        });
        
        const ws = XLSX.utils.json_to_sheet(productsData);
        
        ws['!cols'] = [
          { wch: 30 }, // Nombre
          { wch: 15 }, // SKU
          { wch: 18 }, // Código de Barras
          { wch: 15 }, // Stock Actual
          { wch: 15 }, // Stock Numérico
          { wch: 18 }, // Tipo
          { wch: 12 }, // Precio Venta
          { wch: 12 }, // Costo
          { wch: 10 }, // Margen %
          { wch: 18 }, // Valor Inventario
          { wch: 15 }, // Umbral Mínimo
          { wch: 15 }, // Estado Stock
          { wch: 15 }, // Fecha Registro
        ];
        
        ws['!autofilter'] = { ref: `A1:M${productsData.length + 1}` };
        
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
      }

      // Sección de Clientes
      if (reportSections.customers) {
        const custRes = await supabase.from('customers').select('*').order('name');
        if (custRes.error) throw custRes.error;
        const customers = custRes.data || [];
        
        const customersData = customers.map((c: any) => ({
          'Nombre': c.name,
          'Teléfono': c.phone || '-',
          'Email': c.email || '-',
          'Dirección': c.address || '-',
          'Balance Pendiente': c.balance || 0,
          'Fecha Registro': c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '-',
          'Estado': c.balance > 0 ? 'Con Deuda' : 'Al Corriente',
        }));
        
        const ws = XLSX.utils.json_to_sheet(customersData);
        
        ws['!cols'] = [
          { wch: 25 }, // Nombre
          { wch: 15 }, // Teléfono
          { wch: 25 }, // Email
          { wch: 30 }, // Dirección
          { wch: 15 }, // Balance
          { wch: 15 }, // Fecha Registro
          { wch: 15 }, // Estado
        ];
        
        ws['!autofilter'] = { ref: `A1:G${customersData.length + 1}` };
        
        XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      }

      // Sección de Pagos de Créditos
      if (reportSections.payments) {
        const payRes = await supabase
          .from('payments')
          .select(`
            *,
            customer:customers(name, phone)
          `)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: true });
        if (payRes.error) throw payRes.error;
        const payments = payRes.data || [];
        
        // Crear filas con detalles de cada nota pagada
        const paymentsData: any[] = [];
        payments.forEach((p: any) => {
          // Intentar parsear las asignaciones del campo notes
          let allocations: any[] = [];
          try {
            if (p.notes && typeof p.notes === 'string') {
              const parsed = JSON.parse(p.notes);
              allocations = parsed.allocations || [];
            } else if (p.notes && typeof p.notes === 'object' && p.notes.allocations) {
              allocations = p.notes.allocations;
            }
          } catch (e) {
            // Notes no es JSON válido, es solo texto
          }
          
          if (allocations.length > 0) {
            allocations.forEach((alloc: any, index: number) => {
              paymentsData.push({
                'Fecha Pago': new Date(p.created_at).toLocaleDateString('es-MX'),
                'Hora Pago': new Date(p.created_at).toLocaleTimeString('es-MX'),
                'Cliente': p.customer?.name || '-',
                'Teléfono': p.customer?.phone || '-',
                'Monto Total Pagado': index === 0 ? p.amount : '',
                'Método': index === 0 ? (p.method || 'Efectivo') : '',
                'Semana Abonada': alloc.week || '-',
                'Monto a Nota': alloc.paid || alloc.amount || 0,
                'Notas Adicionales': typeof p.notes === 'string' && !p.notes.startsWith('{') ? p.notes : '-',
              });
            });
          } else {
            // Pago sin asignaciones detalladas
            paymentsData.push({
              'Fecha Pago': new Date(p.created_at).toLocaleDateString('es-MX'),
              'Hora Pago': new Date(p.created_at).toLocaleTimeString('es-MX'),
              'Cliente': p.customer?.name || '-',
              'Teléfono': p.customer?.phone || '-',
              'Monto Total Pagado': p.amount,
              'Método': p.method || 'Efectivo',
              'Semana Abonada': '-',
              'Monto a Nota': p.amount,
              'Notas Adicionales': typeof p.notes === 'string' ? p.notes : '-',
            });
          }
        });
        
        const ws = XLSX.utils.json_to_sheet(paymentsData);
        
        ws['!cols'] = [
          { wch: 12 }, // Fecha Pago
          { wch: 12 }, // Hora Pago
          { wch: 25 }, // Cliente
          { wch: 15 }, // Teléfono
          { wch: 18 }, // Monto Total Pagado
          { wch: 15 }, // Método
          { wch: 20 }, // Semana Abonada
          { wch: 15 }, // Monto a Nota
          { wch: 30 }, // Notas Adicionales
        ];
        
        ws['!autofilter'] = { ref: `A1:I${paymentsData.length + 1}` };
        
        XLSX.utils.book_append_sheet(wb, ws, 'Pagos de Créditos');
      }

      // Generar y descargar el archivo Excel
      const filename = `informe_${reportStart.replaceAll('-', '')}_${reportEnd.replaceAll('-', '')}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      toast.dismiss();
      toast.success('Informe Excel generado con filtros');
      setShowReportModal(false);
    } catch (error: any) {
      toast.dismiss();
      console.error('Error generating report', error);
      toast.error(error?.message || 'Error al generar informe');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <main className="p-6 bg-gray-50 min-h-screen">
          <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h1>

          {/* Statistics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Ingresos Totales</p>
                  <p className="text-2xl font-bold text-green-600">${stats.totalRevenue.toFixed(2)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-600 opacity-50" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Ganancia</p>
                  <p className="text-2xl font-bold text-blue-600">${stats.totalProfit.toFixed(2)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-600 opacity-50" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total Ventas</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.totalSales}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-purple-600 opacity-50" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Stock Bajo</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.lowStockProducts}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-600 opacity-50" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Clientes con Deuda</p>
                  <p className="text-2xl font-bold text-red-600">{stats.customersWithDebt}</p>
                </div>
                <Users className="w-8 h-8 text-red-600 opacity-50" />
              </div>
            </div>
          </div>

          {/* Comparativa mes anterior */}
          {previousMonthStats.revenue > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600 text-sm mb-2">Comparativa de Ingresos</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-gray-800">${stats.totalRevenue.toFixed(2)}</p>
                  {stats.totalRevenue > previousMonthStats.revenue ? (
                    <span className="text-green-600 text-sm flex items-center">
                      <TrendingUp className="w-4 h-4" />
                      +{(((stats.totalRevenue - previousMonthStats.revenue) / previousMonthStats.revenue) * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-red-600 text-sm flex items-center">
                      <TrendingUp className="w-4 h-4 rotate-180" />
                      {(((stats.totalRevenue - previousMonthStats.revenue) / previousMonthStats.revenue) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">vs mes anterior: ${previousMonthStats.revenue.toFixed(2)}</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600 text-sm mb-2">Comparativa de Ventas</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-gray-800">{stats.totalSales}</p>
                  {stats.totalSales > previousMonthStats.sales ? (
                    <span className="text-green-600 text-sm flex items-center">
                      <TrendingUp className="w-4 h-4" />
                      +{(((stats.totalSales - previousMonthStats.sales) / previousMonthStats.sales) * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-red-600 text-sm flex items-center">
                      <TrendingUp className="w-4 h-4 rotate-180" />
                      {(((stats.totalSales - previousMonthStats.sales) / previousMonthStats.sales) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">vs mes anterior: {previousMonthStats.sales} ventas</p>
              </div>
            </div>
          )}

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Tendencia de Ventas */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Tendencia de Ventas (últimos 14 días)</h2>
              {salesChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={salesChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Ventas ($)" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-16">No hay datos suficientes</p>
              )}
            </div>

            {/* Top 10 Productos */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Productos Más Vendidos (Top 10)</h2>
              {topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topProducts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name="Ingresos ($)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-16">No hay datos suficientes</p>
              )}
            </div>
          </div>

          {/* Alertas Inteligentes */}
          {topProducts.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg shadow p-6 mb-8">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Alertas Inteligentes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm font-medium text-gray-700 mb-2">🔥 Producto Estrella</p>
                  <p className="text-lg font-bold text-blue-600">{topProducts[0]?.name}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {topProducts[0]?.quantity} unidades vendidas | ${topProducts[0]?.revenue.toFixed(2)} en ingresos
                  </p>
                </div>
                {lowStockProducts.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm font-medium text-gray-700 mb-2">⚠️ Requiere Reabastecimiento</p>
                    <p className="text-lg font-bold text-orange-600">{lowStockProducts.length} productos</p>
                    <p className="text-xs text-gray-600 mt-1">con stock por debajo del umbral</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Sales & Low Stock */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2 flex justify-end">
              <button
                onClick={() => setShowReportModal(true)}
                className="mb-4 px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700"
              >
                📊 Generar Informe Excel
              </button>
            </div>

            {/* Recent Sales */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Ventas Recientes</h2>
              <div className="space-y-3">
                {recentSales.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No hay ventas recientes</p>
                ) : (
                  recentSales.map((sale) => (
                    <div key={sale.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <p className="font-medium text-sm text-gray-800">
                          {new Date(sale.created_at).toLocaleDateString('es-MX')}
                        </p>
                        <p className="text-xs text-gray-600">
                          {sale.status === 'paid' ? '💳 Pagado' : '💰 Crédito'}
                        </p>
                      </div>
                      <p className="font-bold text-green-600">${sale.total_amount.toFixed(2)}</p>
                    </div>
                  ))
                )}
              </div>
              <Link href="/sales" className="text-blue-600 hover:underline text-sm mt-4 block">
                Ver todas las ventas →
              </Link>
            </div>

            {/* Low Stock Alert */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                Productos con Stock Bajo
              </h2>
              <div className="space-y-3">
                {lowStockProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Stock normal</p>
                ) : (
                  lowStockProducts.map((product) => (
                    <div key={product.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <p className="font-medium text-sm text-gray-800">{product.name}</p>
                        <p className="text-xs text-gray-600">SKU: {product.sku || '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-orange-600">{product.stock}</p>
                        <p className="text-xs text-gray-600">umbral: {product.low_stock_threshold || 5}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Link href="/inventory" className="text-blue-600 hover:underline text-sm mt-4 block">
                Ir a Inventario →
              </Link>
            </div>
          </div>

          {/* Report Modal */}
          <Modal isOpen={showReportModal} onClose={() => setShowReportModal(false)} title="Generar Informe" className="max-w-2xl">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha inicio</label>
                  <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha fin</label>
                  <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              <div>
                <p className="font-medium mb-2">Secciones a incluir</p>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center"><input type="checkbox" checked={reportSections.sales} onChange={(e) => setReportSections(s => ({ ...s, sales: e.target.checked }))} className="mr-2" /> Ventas</label>
                  <label className="inline-flex items-center"><input type="checkbox" checked={reportSections.products} onChange={(e) => setReportSections(s => ({ ...s, products: e.target.checked }))} className="mr-2" /> Inventario</label>
                  <label className="inline-flex items-center"><input type="checkbox" checked={reportSections.customers} onChange={(e) => setReportSections(s => ({ ...s, customers: e.target.checked }))} className="mr-2" /> Clientes</label>
                  <label className="inline-flex items-center"><input type="checkbox" checked={reportSections.payments} onChange={(e) => setReportSections(s => ({ ...s, payments: e.target.checked }))} className="mr-2" /> Pagos</label>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowReportModal(false)} className="px-4 py-2 rounded-lg bg-gray-200">Cancelar</button>
                <button onClick={async () => { await generateReport(); }} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700">Generar Excel</button>
              </div>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
}
