'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/button';
import { Table } from '@/components/table';
import toast from 'react-hot-toast';

type Credit = Database['public']['Tables']['credits']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];
type Sale = Database['public']['Tables']['sales']['Row'];

interface CreditDetail extends Credit {
  customer?: Customer;
  sale?: Sale;
}

export default function CreditsPage() {
  const [credits, setCredits] = useState<CreditDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'overdue' | 'closed'>('all');

  const supabase = createClient();

  useEffect(() => {
    fetchData();
    // Subscribe to realtime changes on credits and payments to keep UI in sync
    const creditsChannel = supabase
      .channel('public:credits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credits' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchData();
      })
      .subscribe();

    // Also listen for BroadcastChannel messages from other pages (payments)
    try {
      const bc = new BroadcastChannel('pos-updates');
      bc.onmessage = (ev) => {
        if (ev?.data?.type === 'credits-updated') fetchData();
      };
      // attach to channel object so we can close it on cleanup
      (creditsChannel as any).__broadcast = bc;
    } catch (e) {
      // ignore if not supported
    }

    // Also listen for localStorage 'storage' events as a wide fallback
    try {
      const storageHandler = (ev: StorageEvent) => {
        if (ev.key === 'pos:credits-updated') {
          try { fetchData(); } catch { /* ignore */ }
        }
      };
      window.addEventListener('storage', storageHandler);
      (creditsChannel as any).__storageHandler = storageHandler;
    } catch (e) {
      // ignore if not supported
    }
    return () => {
      try { supabase.removeChannel(creditsChannel); } catch (e) { /* ignore */ }
      try {
        const bc = (creditsChannel as any)?.__broadcast as BroadcastChannel | undefined;
        if (bc) bc.close();
      } catch (e) { /* ignore */ }
      try {
        const storageHandler = (creditsChannel as any)?.__storageHandler as ((ev: StorageEvent) => void) | undefined;
        if (storageHandler) window.removeEventListener('storage', storageHandler);
      } catch (e) { /* ignore */ }
    };
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase.from('credits').select('*').order('created_at', { ascending: false });

      if (error) throw error;

      const enrichedCredits = await Promise.all(
        (data || []).map(async (credit: CreditDetail) => {
          const [customerRes, saleRes] = await Promise.all([
            supabase.from('customers').select('*').eq('id', credit.customer_id).single(),
            credit.sale_id ? supabase.from('sales').select('*').eq('id', credit.sale_id).single() : Promise.resolve({ data: null }),
          ]);

          // ensure outstanding_amount is a number for older rows where it might be null
          const normalizedOutstanding = credit.outstanding_amount ?? credit.total_amount ?? 0;
          return {
            ...credit,
            outstanding_amount: normalizedOutstanding,
            customer: customerRes.data || undefined,
            sale: saleRes.data || undefined,
          };
        })
      );

      setCredits(enrichedCredits);
    } catch (error) {
      toast.error('Error al cargar créditos');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'Abierto';
      case 'closed':
        return 'Cerrado';
      case 'overdue':
        return 'Vencido';
      default:
        return status;
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'open':
        return '📋';
      case 'closed':
        return '✅';
      case 'overdue':
        return '⚠️';
      default:
        return '❓';
    }
  };

  const filteredCredits = credits.filter((c) => {
    if (filterStatus === 'all') return true;
    return c.status === filterStatus;
  });

  const tableRows = filteredCredits.map((c) => [
    c.customer?.name || '-',
    `$${c.total_amount.toFixed(2)}`,
    `$${c.outstanding_amount.toFixed(2)}`,
    c.due_date ? new Date(c.due_date).toLocaleDateString('es-MX') : '-',
    `${getStatusEmoji(c.status)} ${getStatusColor(c.status)}`,
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
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Créditos</h1>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-gray-600 text-sm">Total Abierto</p>
                <p className="text-2xl font-bold text-blue-600">
                  ${credits
                    .filter((c) => c.status === 'open')
                    .reduce((sum, c) => sum + c.outstanding_amount, 0)
                    .toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm">Vencidos</p>
                <p className="text-2xl font-bold text-red-600">
                  ${credits
                    .filter((c) => c.status === 'overdue')
                    .reduce((sum, c) => sum + c.outstanding_amount, 0)
                    .toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm">Cerrados</p>
                <p className="text-2xl font-bold text-green-600">
                  ${credits
                    .filter((c) => c.status === 'closed')
                    .reduce((sum, c) => sum + c.total_amount, 0)
                    .toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm">Total</p>
                <p className="text-2xl font-bold text-gray-800">
                  ${credits.reduce((sum, c) => sum + c.total_amount, 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex flex-wrap gap-2 mb-4">
              {['all', 'open', 'overdue', 'closed'].map((status) => (
                <Button
                  key={status}
                  onClick={() => setFilterStatus(status as typeof filterStatus)}
                  variant={filterStatus === status ? 'primary' : 'secondary'}
                  size="sm"
                >
                  {status === 'all' ? 'Todos' : status === 'open' ? 'Abiertos' : status === 'overdue' ? 'Vencidos' : 'Cerrados'}
                </Button>
              ))}
            </div>

            <Table
              headers={['Cliente', 'Total', 'Pendiente', 'Vencimiento', 'Estado']}
              rows={tableRows}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
