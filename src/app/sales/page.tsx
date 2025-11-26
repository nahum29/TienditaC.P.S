'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/button';
import { Table } from '@/components/table';
import toast from 'react-hot-toast';

type Sale = Database['public']['Tables']['sales']['Row'];
type SaleItem = Database['public']['Tables']['sale_items']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];

interface SaleDetail extends Sale {
  customer?: Customer;
  items?: SaleItem[];
}

export default function SalesPage() {
  const [sales, setSales] = useState<SaleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'credit'>('all');

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase.from('sales').select('*').order('created_at', { ascending: false });

      if (error) throw error;

      const enrichedSales = await Promise.all(
        (data || []).map(async (sale: Sale) => {
          const [customerRes, itemsRes] = await Promise.all([
            sale.customer_id
              ? supabase.from('customers').select('*').eq('id', sale.customer_id).single()
              : Promise.resolve({ data: null }),
            supabase.from('sale_items').select('*').eq('sale_id', sale.id),
          ]);

          return {
            ...sale,
            customer: customerRes.data || undefined,
            items: itemsRes.data || undefined,
          };
        })
      );

      setSales(enrichedSales);
    } catch (error) {
      toast.error('Error al cargar ventas');
    } finally {
      setLoading(false);
    }
  };

  const filteredSales = sales.filter((s) => {
    if (filterStatus === 'all') return true;
    return s.status === filterStatus;
  });

  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalProfit = filteredSales.reduce((sum, s) => sum + (s.total_amount - (s.total_cost || 0)), 0);

  const tableRows = filteredSales.map((s) => [
    new Date(s.created_at).toLocaleDateString('es-MX'),
    s.customer?.name || 'Cliente Genérico',
    s.items?.length || 0,
    `$${s.total_amount.toFixed(2)}`,
    s.status === 'paid' ? '💳 Pagado' : '💰 Crédito',
  ]);

  if (loading) {
    const { LoadingEagle } = require('@/components/loading-eagle');
    return <LoadingEagle />;
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <main className="p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Ventas</h1>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-gray-600 text-sm">Ingresos</p>
                <p className="text-2xl font-bold text-green-600">${totalRevenue.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm">Ganancia</p>
                <p className="text-2xl font-bold text-blue-600">${totalProfit.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm">Transacciones</p>
                <p className="text-2xl font-bold text-gray-800">{filteredSales.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex flex-wrap gap-2 mb-4">
              {['all', 'paid', 'credit'].map((status) => (
                <Button
                  key={status}
                  onClick={() => setFilterStatus(status as typeof filterStatus)}
                  variant={filterStatus === status ? 'primary' : 'secondary'}
                  size="sm"
                >
                  {status === 'all' ? 'Todas' : status === 'paid' ? 'Pagadas' : 'Crédito'}
                </Button>
              ))}
            </div>

            <Table
              headers={['Fecha', 'Cliente', 'Artículos', 'Total', 'Estado']}
              rows={tableRows}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
