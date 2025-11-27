'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { formatWeekRange } from '@/lib/weekly-credits';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/button';
import { Table } from '@/components/table';
import { Modal } from '@/components/modal';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';

type Credit = Database['public']['Tables']['credits']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];
type Sale = Database['public']['Tables']['sales']['Row'];
type SaleItem = Database['public']['Tables']['sale_items']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

interface CreditDetail extends Credit {
  customer?: Customer;
  sale?: Sale;
}

interface SaleItemDetail extends SaleItem {
  product?: Product;
  sale?: Sale;
}

export default function CreditsPage() {
  const [credits, setCredits] = useState<CreditDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'overdue' | 'closed'>('all');
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<CreditDetail | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItemDetail[]>([]);

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
        return 'Atrasado';
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

  const handleShowTicket = async (credit: CreditDetail) => {
    try {
      setSelectedCredit(credit);
      toast.loading('Cargando productos...');

      // Obtener todas las ventas asociadas a este crédito semanal usando credit_sales
      const { data: creditSales, error: creditSalesError } = await supabase
        .from('credit_sales')
        .select('sale_id')
        .eq('credit_id', credit.id);

      if (creditSalesError) throw creditSalesError;

      if (!creditSales || creditSales.length === 0) {
        toast.dismiss();
        toast.error('No hay ventas asociadas a esta nota');
        return;
      }

      // Obtener los sale_ids
      const saleIds = creditSales.map((cs: any) => cs.sale_id);

      // Obtener todas las ventas para tener las fechas
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .in('id', saleIds);

      if (salesError) throw salesError;

      // Crear un mapa de ventas por ID
      const salesMap = new Map(
        (sales || []).map((sale: Sale) => [sale.id, sale])
      );

      // Obtener todos los items de todas las ventas
      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('*')
        .in('sale_id', saleIds);

      if (itemsError) throw itemsError;

      // Enriquecer con información del producto y la venta
      const enrichedItems = await Promise.all(
        (items || []).map(async (item: SaleItemDetail) => {
          const { data: product } = await supabase
            .from('products')
            .select('*')
            .eq('id', item.product_id)
            .single();
          
          return {
            ...item,
            product: product || undefined,
            sale: salesMap.get(item.sale_id),
          };
        })
      );

      // Ordenar items por fecha de venta (más reciente primero)
      enrichedItems.sort((a, b) => {
        const dateA = a.sale?.created_at ? new Date(a.sale.created_at).getTime() : 0;
        const dateB = b.sale?.created_at ? new Date(b.sale.created_at).getTime() : 0;
        return dateA - dateB;
      });

      setSaleItems(enrichedItems);
      toast.dismiss();
      setShowTicketModal(true);
    } catch (error) {
      toast.dismiss();
      toast.error('Error al cargar productos');
      console.error(error);
    }
  };

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
                <p className="text-gray-600 text-sm">Actuales</p>
                <p className="text-2xl font-bold text-blue-600">
                  ${credits
                    .filter((c) => c.status === 'open')
                    .reduce((sum, c) => sum + c.outstanding_amount, 0)
                    .toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm">Atrasados</p>
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
                  {status === 'all' ? 'Todos' : status === 'open' ? 'Actuales' : status === 'overdue' ? 'Atrasados' : 'Cerrados'}
                </Button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Semana</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pendiente</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCredits.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {c.customer?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {c.week_start ? formatWeekRange(new Date(c.week_start)) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${c.total_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${c.outstanding_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getStatusEmoji(c.status)} {getStatusColor(c.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Button
                          onClick={() => handleShowTicket(c)}
                          variant="secondary"
                          size="sm"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          Nota
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredCredits.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No hay créditos para mostrar
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal de Ticket */}
          <Modal
            isOpen={showTicketModal}
            onClose={() => {
              setShowTicketModal(false);
              setSelectedCredit(null);
              setSaleItems([]);
            }}
            title="Nota de Crédito"
            className="max-w-md"
          >
            <div className="bg-white p-6 font-mono text-sm text-gray-900">
              {/* Header */}
              <div className="text-center mb-4 border-b-2 border-gray-800 border-dashed pb-4">
                <h2 className="text-2xl font-bold text-gray-900">Tiendita C.P.S</h2>
                <p className="text-sm text-gray-700 mt-1 font-semibold">Nota de Crédito</p>
              </div>

              {/* Cliente Info */}
              {selectedCredit && (
                <div className="mb-4 space-y-1 text-sm text-gray-900">
                  <p><span className="font-bold">Cliente:</span> {selectedCredit.customer?.name || '-'}</p>
                  <p><span className="font-bold">Semana:</span> {selectedCredit.week_start ? formatWeekRange(new Date(selectedCredit.week_start)) : '-'}</p>
                  <p><span className="font-bold">Fecha límite:</span> {selectedCredit.due_date ? new Date(selectedCredit.due_date).toLocaleDateString('es-MX') : '-'}</p>
                  <p><span className="font-bold">ID Nota:</span> {selectedCredit.id?.slice(0, 8) || '-'}</p>
                </div>
              )}

              {/* Items */}
              <div className="border-t-2 border-gray-800 border-dashed pt-3 mb-4">
                <div className="space-y-3">
                  {saleItems.map((item, index) => {
                    // Agrupar por fecha/hora de venta - mostrar encabezado cuando cambia
                    const showDateHeader = index === 0 || 
                      (item.sale?.created_at !== saleItems[index - 1]?.sale?.created_at);
                    
                    return (
                      <div key={item.id}>
                        {showDateHeader && item.sale?.created_at && (
                          <div className="bg-gray-100 px-2 py-1 rounded mt-2 mb-1">
                            <p className="text-xs font-bold text-gray-700">
                              📅 {new Date(item.sale.created_at).toLocaleDateString('es-MX', { 
                                weekday: 'short', 
                                day: '2-digit', 
                                month: 'short' 
                              })} - {new Date(item.sale.created_at).toLocaleTimeString('es-MX', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </p>
                          </div>
                        )}
                        <div className="flex justify-between items-start text-xs border-b border-gray-300 pb-2">
                          <div className="flex-1">
                            <p className="font-bold text-gray-900">{item.product?.name || 'Producto'}</p>
                            <p className="text-gray-700">
                              {item.quantity} x ${item.unit_price.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-right font-bold text-gray-900">
                            ${item.total_price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totales */}
              {selectedCredit && (
                <div className="border-t-2 border-gray-800 border-dashed pt-4 space-y-2 text-base">
                  <div className="flex justify-between text-gray-900">
                    <span className="font-bold">Total:</span>
                    <span className="font-bold text-xl">${selectedCredit.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span className="font-bold">Pendiente:</span>
                    <span className="font-bold text-xl">${selectedCredit.outstanding_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-green-700">
                    <span className="font-bold">Pagado:</span>
                    <span className="font-bold text-lg">${(selectedCredit.total_amount - selectedCredit.outstanding_amount).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="text-center mt-6 pt-4 border-t-2 border-gray-800 border-dashed text-sm text-gray-800">
                <p className="text-xs mt-1">Dios le pague</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowTicketModal(false);
                  setSelectedCredit(null);
                  setSaleItems([]);
                }}
                variant="secondary"
              >
                Cerrar
              </Button>
              <Button
                onClick={() => {
                  window.print();
                }}
                variant="primary"
              >
                Imprimir
              </Button>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
}
