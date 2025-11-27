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
  
  // Estados para impresión masiva
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false);
  const [bulkPrintFilters, setBulkPrintFilters] = useState({
    includeActuales: true,
    includeAtrasados: false,
    selectedCustomers: new Set<string>(),
  });
  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);

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

  const handleOpenBulkPrintModal = () => {
    // Obtener lista única de clientes con créditos pendientes
    const uniqueCustomers = new Map<string, Customer>();
    credits.forEach(credit => {
      if (credit.customer && (credit.status === 'open' || credit.status === 'overdue')) {
        uniqueCustomers.set(credit.customer.id, credit.customer);
      }
    });
    
    setAvailableCustomers(Array.from(uniqueCustomers.values()));
    setShowBulkPrintModal(true);
  };

  const toggleCustomerSelection = (customerId: string) => {
    const newSelection = new Set(bulkPrintFilters.selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setBulkPrintFilters({ ...bulkPrintFilters, selectedCustomers: newSelection });
  };

  const toggleAllCustomers = () => {
    if (bulkPrintFilters.selectedCustomers.size === availableCustomers.length) {
      setBulkPrintFilters({ ...bulkPrintFilters, selectedCustomers: new Set() });
    } else {
      setBulkPrintFilters({ 
        ...bulkPrintFilters, 
        selectedCustomers: new Set(availableCustomers.map(c => c.id)) 
      });
    }
  };

  const handleBulkPrint = () => {
    // Filtrar créditos según criterios
    const creditsToPrint = credits.filter(credit => {
      // Filtro por estado
      const matchesStatus = 
        (bulkPrintFilters.includeActuales && credit.status === 'open') ||
        (bulkPrintFilters.includeAtrasados && credit.status === 'overdue');
      
      if (!matchesStatus) return false;

      // Filtro por clientes (si no hay selección, incluir todos)
      if (bulkPrintFilters.selectedCustomers.size > 0) {
        return bulkPrintFilters.selectedCustomers.has(credit.customer_id);
      }

      return true;
    });

    if (creditsToPrint.length === 0) {
      toast.error('No hay notas que cumplan con los filtros seleccionados');
      return;
    }

    toast.success(`Preparando ${creditsToPrint.length} ticket(s) para imprimir...`);
    setShowBulkPrintModal(false);
    
    // Generar HTML para imprimir
    generateBulkPrintHTML(creditsToPrint);
  };

  const generateBulkPrintHTML = async (creditsToPrint: CreditDetail[]) => {
    try {
      toast.loading('Generando tickets...');
      
      // Crear contenedor para todos los tickets
      const printContainer = document.createElement('div');
      printContainer.style.cssText = 'position: absolute; left: -9999px;';
      document.body.appendChild(printContainer);

      // Generar cada ticket
      for (const credit of creditsToPrint) {
        // Obtener datos del crédito
        const { data: creditSales } = await supabase
          .from('credit_sales')
          .select('sale_id')
          .eq('credit_id', credit.id);

        if (!creditSales || creditSales.length === 0) continue;

        const saleIds = creditSales.map((cs: any) => cs.sale_id);

        const { data: sales } = await supabase.from('sales').select('*').in('id', saleIds);
        const salesMap = new Map((sales || []).map((sale: Sale) => [sale.id, sale]));

        const { data: items } = await supabase.from('sale_items').select('*').in('sale_id', saleIds);

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

        enrichedItems.sort((a, b) => {
          const dateA = a.sale?.created_at ? new Date(a.sale.created_at).getTime() : 0;
          const dateB = b.sale?.created_at ? new Date(b.sale.created_at).getTime() : 0;
          return dateA - dateB;
        });

        // Crear HTML del ticket
        const ticketHTML = createTicketHTML(credit, enrichedItems);
        const ticketDiv = document.createElement('div');
        ticketDiv.innerHTML = ticketHTML;
        ticketDiv.style.cssText = 'page-break-after: always; padding: 20px;';
        printContainer.appendChild(ticketDiv);
      }

      toast.dismiss();
      
      // Abrir ventana de impresión
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Tickets de Crédito</title>
              <style>
                body { font-family: monospace; }
                @media print {
                  body { margin: 0; }
                  .ticket { page-break-after: always; }
                }
              </style>
            </head>
            <body>${printContainer.innerHTML}</body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }

      document.body.removeChild(printContainer);
    } catch (error) {
      toast.dismiss();
      toast.error('Error al generar tickets');
      console.error(error);
    }
  };

  const createTicketHTML = (credit: CreditDetail, items: SaleItemDetail[]) => {
    const itemsHTML = items.map((item, index) => {
      const showDateHeader = index === 0 || 
        (item.sale?.created_at !== items[index - 1]?.sale?.created_at);
      
      const dateHeader = showDateHeader && item.sale?.created_at ? `
        <div style="background: #f3f4f6; padding: 4px 8px; margin: 8px 0 4px 0; border-radius: 4px;">
          <p style="font-size: 11px; font-weight: bold; margin: 0;">
            📅 ${new Date(item.sale.created_at).toLocaleDateString('es-MX', { 
              weekday: 'short', 
              day: '2-digit', 
              month: 'short' 
            })} - ${new Date(item.sale.created_at).toLocaleTimeString('es-MX', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </p>
        </div>
      ` : '';

      return `
        ${dateHeader}
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding: 8px 0; font-size: 12px;">
          <div style="flex: 1;">
            <p style="margin: 0; font-weight: bold;">${item.product?.name || 'Producto'}</p>
            <p style="margin: 4px 0 0 0; color: #666;">${item.quantity} x $${item.unit_price.toFixed(2)}</p>
          </div>
          <div style="font-weight: bold;">$${item.total_price.toFixed(2)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="ticket" style="max-width: 400px; margin: 0 auto; font-family: monospace;">
        <div style="text-align: center; border-bottom: 2px dashed #333; padding-bottom: 16px; margin-bottom: 16px;">
          <h2 style="font-size: 24px; margin: 0;">Tiendita C.P.S</h2>
          <p style="font-size: 14px; margin: 8px 0 0 0; font-weight: bold;">Nota de Crédito</p>
        </div>

        <div style="margin-bottom: 16px; font-size: 14px;">
          <p style="margin: 4px 0;"><strong>Cliente:</strong> ${credit.customer?.name || '-'}</p>
          <p style="margin: 4px 0;"><strong>Semana:</strong> ${credit.week_start ? formatWeekRange(new Date(credit.week_start)) : '-'}</p>
          <p style="margin: 4px 0;"><strong>Fecha límite:</strong> ${credit.due_date ? new Date(credit.due_date).toLocaleDateString('es-MX') : '-'}</p>
          <p style="margin: 4px 0;"><strong>ID Nota:</strong> ${credit.id?.slice(0, 8) || '-'}</p>
        </div>

        <div style="border-top: 2px dashed #333; padding-top: 12px; margin-bottom: 16px;">
          ${itemsHTML}
        </div>

        <div style="border-top: 2px dashed #333; padding-top: 16px; font-size: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <strong>Total:</strong>
            <strong style="font-size: 20px;">$${credit.total_amount.toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: #b91c1c; margin-bottom: 8px;">
            <strong>Pendiente:</strong>
            <strong style="font-size: 20px;">$${credit.outstanding_amount.toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: #15803d;">
            <strong>Pagado:</strong>
            <strong style="font-size: 18px;">$${(credit.total_amount - credit.outstanding_amount).toFixed(2)}</strong>
          </div>
        </div>

        <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 2px dashed #333; font-size: 14px;">
          <p style="margin: 0; font-weight: bold;">DLP</p>
          <p style="margin: 4px 0 0 0; font-size: 11px;">Dios le pague</p>
        </div>
      </div>
    `;
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
            <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
              <div className="flex flex-wrap gap-2">
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
              <Button
                onClick={handleOpenBulkPrintModal}
                variant="primary"
                size="sm"
              >
                🖨️ Imprimir Todos
              </Button>
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
          {showTicketModal && (
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
        )}

        {/* Modal de Impresión Masiva */}
        {showBulkPrintModal && (
          <Modal
            title="Imprimir Tickets Masivamente"
            isOpen={showBulkPrintModal}
            onClose={() => {
              setShowBulkPrintModal(false);
              setBulkPrintFilters({
                includeActuales: true,
                includeAtrasados: false,
                selectedCustomers: new Set()
              });
            }}
          >
            <div className="space-y-4">
              {/* Filtros de Estado */}
              <div className="border-b pb-4">
                <h3 className="font-semibold mb-2 text-gray-700">Estado de los Créditos</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkPrintFilters.includeActuales}
                      onChange={(e) =>
                        setBulkPrintFilters({
                          ...bulkPrintFilters,
                          includeActuales: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Semana Actual</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkPrintFilters.includeAtrasados}
                      onChange={(e) =>
                        setBulkPrintFilters({
                          ...bulkPrintFilters,
                          includeAtrasados: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Atrasados</span>
                  </label>
                </div>
              </div>

              {/* Filtros de Clientes */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-gray-700">Clientes</h3>
                  <Button
                    onClick={toggleAllCustomers}
                    variant="secondary"
                    size="sm"
                  >
                    {bulkPrintFilters.selectedCustomers.size === availableCustomers.length
                      ? 'Deseleccionar Todos'
                      : 'Seleccionar Todos'}
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-1">
                  {availableCustomers.map((customer) => (
                    <label
                      key={customer.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={bulkPrintFilters.selectedCustomers.has(customer.id)}
                        onChange={() => toggleCustomerSelection(customer.id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span>{customer.name}</span>
                    </label>
                  ))}
                  {availableCustomers.length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No hay clientes con créditos pendientes
                    </p>
                  )}
                </div>
              </div>

              {/* Preview de cuántos tickets se imprimirán */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                <p className="text-gray-700">
                  Se imprimirán{' '}
                  <strong>
                    {
                      credits.filter(
                        (c) =>
                          c.outstanding_amount > 0 &&
                          ((bulkPrintFilters.includeActuales && c.status === 'open') ||
                            (bulkPrintFilters.includeAtrasados && c.status === 'overdue')) &&
                          (bulkPrintFilters.selectedCustomers.size === 0 ||
                            bulkPrintFilters.selectedCustomers.has(c.customer_id))
                      ).length
                    }
                  </strong>{' '}
                  tickets
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  onClick={() => {
                    setShowBulkPrintModal(false);
                    setBulkPrintFilters({
                      includeActuales: true,
                      includeAtrasados: false,
                      selectedCustomers: new Set()
                    });
                  }}
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleBulkPrint}
                  variant="primary"
                  disabled={
                    !bulkPrintFilters.includeActuales && !bulkPrintFilters.includeAtrasados
                  }
                >
                  Imprimir
                </Button>
              </div>
            </div>
          </Modal>
        )}
        </main>
      </div>
    </div>
  );
}
