'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Modal } from '@/components/modal';
import { TrendingUp, AlertTriangle, Users, ShoppingCart } from 'lucide-react';
import { jsPDF } from 'jspdf';
import Link from 'next/link';
import toast from 'react-hot-toast';

type Product = Database['public']['Tables']['products']['Row'];
type Sale = Database['public']['Tables']['sales']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];

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
      const [salesRes, productsRes, customersRes] = await Promise.all([
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('products').select('*'),
        supabase.from('customers').select('*'),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;

      const sales = salesRes.data || [];
      const products = productsRes.data || [];
      const customers = customersRes.data || [];

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

      setRecentSales(sales.slice(0, 5));
      setLowStockProducts(low.slice(0, 5));
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

      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(16);
      doc.text('Informe Administrativo - Tiendita C.P.S', 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.text(`Rango: ${reportStart} — ${reportEnd}`, 14, y);
      y += 10;

      if (reportSections.sales) {
        const salesRes = await supabase.from('sales').select('*').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true });
        if (salesRes.error) throw salesRes.error;
        const sales = salesRes.data || [];
        doc.setFontSize(12);
        doc.text('Ventas', 14, y);
        y += 6;
        doc.setFontSize(9);
        sales.slice(0, 50).forEach((s: any) => {
          const line = `${new Date(s.created_at).toLocaleString('es-MX')} - $${s.total_amount.toFixed(2)} - ${s.status}`;
          if (y > 280) { doc.addPage(); y = 20; }
          doc.text(line, 14, y);
          y += 5;
        });
        y += 6;
      }

      if (reportSections.products) {
        const prodRes = await supabase.from('products').select('*').order('name');
        if (prodRes.error) throw prodRes.error;
        const products = prodRes.data || [];
        doc.setFontSize(12);
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text('Inventario', 14, y);
        y += 6;
        doc.setFontSize(9);
        products.slice(0, 200).forEach((p: any) => {
          const stockDisplay = p.is_bulk ? `${(p.stock/1000).toFixed(2)} kg` : `${p.stock}`;
          const line = `${p.name} (SKU: ${p.sku || '-'}) - ${stockDisplay} - $${(p.price||0).toFixed(2)}`;
          if (y > 280) { doc.addPage(); y = 20; }
          doc.text(line, 14, y);
          y += 5;
        });
        y += 6;
      }

      if (reportSections.customers) {
        const custRes = await supabase.from('customers').select('*').order('name');
        if (custRes.error) throw custRes.error;
        const customers = custRes.data || [];
        doc.setFontSize(12);
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text('Clientes', 14, y);
        y += 6;
        doc.setFontSize(9);
        customers.slice(0, 200).forEach((c: any) => {
          const line = `${c.name} - Balance: $${(c.balance||0).toFixed(2)}`;
          if (y > 280) { doc.addPage(); y = 20; }
          doc.text(line, 14, y);
          y += 5;
        });
        y += 6;
      }

      if (reportSections.payments) {
        const payRes = await supabase.from('payments').select('*').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true });
        if (payRes.error) throw payRes.error;
        const payments = payRes.data || [];
        doc.setFontSize(12);
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text('Pagos', 14, y);
        y += 6;
        doc.setFontSize(9);
        payments.slice(0, 200).forEach((p: any) => {
          const line = `${new Date(p.created_at).toLocaleString('es-MX')} - $${(p.amount||0).toFixed(2)} - ${p.method}`;
          if (y > 280) { doc.addPage(); y = 20; }
          doc.text(line, 14, y);
          y += 5;
        });
        y += 6;
      }

      const filename = `informe_${reportStart.replaceAll('-', '')}_${reportEnd.replaceAll('-', '')}.pdf`;
      doc.save(filename);
      toast.dismiss();
      toast.success('Informe generado');
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

          {/* Recent Sales & Low Stock */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2 flex justify-end">
              <button
                onClick={() => setShowReportModal(true)}
                className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
              >
                Generar Informe
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
                <button onClick={async () => { await generateReport(); }} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Generar PDF</button>
              </div>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
}
