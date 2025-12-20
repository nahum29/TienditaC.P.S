'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { formatWeekRange } from '@/lib/weekly-credits';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Modal } from '@/components/modal';
import { Button } from '@/components/button';
import { Table } from '@/components/table';
import { Plus, Edit2, Trash2, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

type Customer = Database['public']['Tables']['customers']['Row'];
type Credit = Database['public']['Tables']['credits']['Row'];

interface CreditWithDetails extends Credit {
  selected?: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [userId] = useState('00000000-0000-0000-0000-000000000000');
  const [customerCredits, setCustomerCredits] = useState<CreditWithDetails[]>([]);
  const [selectedCredits, setSelectedCredits] = useState<Set<string>>(new Set());
  
  // Nuevas mejoras
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: 'cash' as 'cash' | 'card' | 'other',
    notes: '',
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const user = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        const { error } = await supabase
          .from('customers')
          .update(formData)
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Cliente actualizado');
      } else {
        const { error } = await supabase.from('customers').insert([formData]);

        if (error) throw error;
        toast.success('Cliente creado');
      }

      setShowModal(false);
      setFormData({ name: '', phone: '', email: '', address: '' });
      setEditingId(null);
      fetchData();
    } catch (error) {
      toast.error('Error al guardar cliente');
    }
  };

  const handleEdit = (customer: Customer) => {
    setFormData({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
    });
    setEditingId(customer.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar este cliente?')) {
      try {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        toast.success('Cliente eliminado');
        fetchData();
      } catch {
        toast.error('Error al eliminar');
      }
    }
  };

  // Ver historial de compras
  const handleViewHistory = async (customerId: string) => {
    try {
      const { data: salesData, error } = await supabase
        .from('sales')
        .select('*, sale_items(*, product:products(name))')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setCustomerHistory(salesData || []);
      setSelectedCustomerId(customerId);
      setShowHistoryModal(true);
    } catch (error) {
      toast.error('Error al cargar historial');
    }
  };

  // Enviar recordatorio por WhatsApp
  const handleSendWhatsApp = (customer: Customer) => {
    if (!customer.phone) {
      toast.error('Este cliente no tiene teléfono registrado');
      return;
    }

    const phone = customer.phone.replace(/\D/g, ''); // Quitar caracteres no numéricos
    const message = encodeURIComponent(
      `Hola ${customer.name}, te recordamos que tienes un saldo pendiente de $${customer.balance.toFixed(2)} en Tiendita C.P.S. ¡Gracias!`
    );
    
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    toast.success('Abriendo WhatsApp...');
  };

  const handleOpenPaymentModal = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    
    // Cargar los créditos pendientes del cliente
    try {
      const { data: creditsData, error } = await supabase
        .from('credits')
        .select('*')
        .eq('customer_id', customerId)
        .in('status', ['open', 'overdue'])
        .order('week_start', { ascending: true });

      if (error) throw error;

      const credits = creditsData || [];
      setCustomerCredits(credits);

      // Si solo hay un crédito, seleccionarlo automáticamente
      if (credits.length === 1) {
        setSelectedCredits(new Set([credits[0].id]));
      } else {
        setSelectedCredits(new Set());
      }

      setShowPaymentModal(true);
    } catch (error) {
      toast.error('Error al cargar créditos del cliente');
      console.error(error);
    }
  };

  const toggleCreditSelection = (creditId: string) => {
    const newSelection = new Set(selectedCredits);
    if (newSelection.has(creditId)) {
      newSelection.delete(creditId);
    } else {
      newSelection.add(creditId);
    }
    setSelectedCredits(newSelection);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) return;

    if (selectedCredits.size === 0) {
      toast.error('Selecciona al menos una nota para pagar');
      return;
    }

    try {
      const customer = customers.find((c) => c.id === selectedCustomerId);
      if (!customer) return;

      const amount = parseFloat(paymentData.amount);

      if (amount <= 0) {
        toast.error('El monto debe ser mayor a 0');
        return;
      }

      // Insert payment and capture the inserted row
      const { data: paymentRow, error: paymentError } = await supabase.from('payments').insert({
        customer_id: selectedCustomerId,
        amount,
        method: paymentData.method,
        received_by: userId,
        notes: paymentData.notes || null,
      }).select().single();

      if (paymentError) throw paymentError;

      // Obtener los créditos seleccionados ordenados por antigüedad (primero los más viejos)
      const selectedCreditsData = customerCredits
        .filter(c => selectedCredits.has(c.id))
        .sort((a, b) => {
          // Ordenar: primero atrasados, luego por fecha de semana
          if (a.status === 'overdue' && b.status !== 'overdue') return -1;
          if (a.status !== 'overdue' && b.status === 'overdue') return 1;
          return new Date(a.week_start || a.created_at).getTime() - new Date(b.week_start || b.created_at).getTime();
        });

      let remainingAmount = amount;
      const allocations: { credit_id: string; paid: number; week: string }[] = [];

      // Aplicar el pago a los créditos seleccionados (primero el más viejo)
      for (const credit of selectedCreditsData) {
        if (remainingAmount <= 0) break;

        const currentOutstanding = credit.outstanding_amount ?? credit.total_amount ?? 0;
        if (currentOutstanding <= 0) continue;

        const paid = Math.min(remainingAmount, currentOutstanding);
        const newOutstanding = currentOutstanding - paid;

        const { error: creditUpdateError } = await supabase
          .from('credits')
          .update({
            outstanding_amount: newOutstanding,
            status: newOutstanding === 0 ? 'closed' : credit.status,
          })
          .eq('id', credit.id);

        if (creditUpdateError) throw creditUpdateError;

        allocations.push({ 
          credit_id: credit.id, 
          paid,
          week: credit.week_start ? formatWeekRange(new Date(credit.week_start)) : 'N/A'
        });
        remainingAmount -= paid;
      }

      // Actualizar balance del cliente
      const newBalance = Math.max(0, customer.balance - amount);
      const { error: updateError } = await supabase
        .from('customers')
        .update({ balance: newBalance })
        .eq('id', selectedCustomerId);

      if (updateError) throw updateError;

      // Insert allocation rows into credit_payments for audit trail
      try {
        if (allocations.length > 0 && paymentRow?.id) {
          const inserts = allocations.map((a) => ({ 
            credit_id: a.credit_id, 
            payment_id: paymentRow.id, 
            amount: a.paid 
          }));
          const { error: allocErr } = await supabase.from('credit_payments').insert(inserts);
          if (allocErr) {
            console.error('Error inserting credit_payments', allocErr);
            toast.error('No se pudo guardar asignación en audit trail');
          }
        }
      } catch (error) {
        console.error('Error inserting credit payments', error);
        toast.error('Error al crear registros de asignación');
      }

      // Update payment notes with allocation details
      try {
        await supabase.from('payments').update({ 
          notes: JSON.stringify({ 
            ...(paymentRow?.notes ? { originalNotes: paymentRow.notes } : {}), 
            allocations 
          }) 
        }).eq('id', paymentRow?.id);
      } catch (e) {
        console.warn('No se pudo actualizar notas de pago con asignaciones', e);
      }

      // Notify other UI
      try {
        const bc = new BroadcastChannel('pos-updates');
        bc.postMessage({ type: 'credits-updated', customer_id: selectedCustomerId });
        bc.close();
      } catch (e) {
        // ignore
      }

      try {
        localStorage.setItem('pos:credits-updated', JSON.stringify({ 
          customer_id: selectedCustomerId, 
          ts: Date.now() 
        }));
      } catch (e) {
        // ignore
      }

      toast.success(`Pago de $${amount.toFixed(2)} registrado exitosamente`);
      setShowPaymentModal(false);
      setPaymentData({ amount: '', method: 'cash', notes: '' });
      setSelectedCredits(new Set());
      setCustomerCredits([]);
      fetchData();
    } catch (error) {
      toast.error('Error al registrar pago');
      console.error(error);
    }
  };

  // Búsqueda inteligente
  const filteredCustomers = customers.filter((c) => {
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      (c.phone?.toLowerCase().includes(query)) ||
      (c.email?.toLowerCase().includes(query)) ||
      (c.address?.toLowerCase().includes(query))
    );
  });

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
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Clientes</h1>
            <Button onClick={() => { setShowModal(true); setEditingId(null); setFormData({ name: '', phone: '', email: '', address: '' }); }}>
              <Plus className="w-5 h-5 inline mr-2" />
              Nuevo Cliente
            </Button>
          </div>

          {/* Búsqueda inteligente */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, correo o dirección..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
            />
            {searchQuery && (
              <p className="text-sm text-gray-600 mt-2">
                Mostrando {filteredCustomers.length} de {customers.length} clientes
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saldo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className={c.balance > 0 ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{c.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c.phone || '-'}</td>
                    <td className="px-6 py-4 text-sm">
                      {c.balance > 0 ? (
                        <span className="font-semibold text-red-600">
                          Debe: ${c.balance.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-green-600">Al día</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {c.balance > 0 ? (
                        <span className="px-2 py-1 bg-red-200 text-red-800 rounded text-xs font-semibold">
                          🔴 Adeudo
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-semibold">
                          ✅ Al día
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2 flex-wrap">
                        {c.balance > 0 && (
                          <button
                            onClick={() => handleOpenPaymentModal(c.id)}
                            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-xs"
                          >
                            <DollarSign className="w-4 h-4 inline" /> Pago
                          </button>
                        )}
                        <button
                          onClick={() => handleViewHistory(c.id)}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
                        >
                          📋 Historial
                        </button>
                        {c.phone && (
                          <button
                            onClick={() => handleSendWhatsApp(c)}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs"
                          >
                            💬 WhatsApp
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(c)}
                          className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs"
                        >
                          <Edit2 className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
                  onClick: (i) => handleOpenPaymentModal(customers[i].id),
                },
                { label: 'Editar', onClick: (i) => handleEdit(customers[i]) },
                { label: 'Eliminar', onClick: (i) => handleDelete(customers[i].id), variant: 'danger' },
              ]}
            />
          </div>

          <Modal
            isOpen={showModal}
            onClose={() => { setShowModal(false); setEditingId(null); }}
            title={editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
            className="max-w-md"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Nombre"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                required
              />
              <input
                type="tel"
                placeholder="Teléfono"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <input
                type="email"
                placeholder="Correo Electrónico"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <textarea
                placeholder="Dirección"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  {editingId ? 'Actualizar' : 'Crear'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => { setShowModal(false); setEditingId(null); }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            isOpen={showPaymentModal}
            onClose={() => { 
              setShowPaymentModal(false); 
              setSelectedCustomerId(null);
              setSelectedCredits(new Set());
              setCustomerCredits([]);
            }}
            title="Registrar Pago"
            className="max-w-2xl"
          >
            <form onSubmit={handlePayment} className="space-y-4">
              {/* Mostrar notas del cliente para seleccionar */}
              {customerCredits.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Selecciona las notas a pagar:
                  </label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Selec.</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Semana</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pendiente</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {customerCredits.map((credit) => (
                          <tr 
                            key={credit.id} 
                            className={`hover:bg-gray-50 cursor-pointer ${selectedCredits.has(credit.id) ? 'bg-blue-50' : ''}`}
                            onClick={() => toggleCreditSelection(credit.id)}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedCredits.has(credit.id)}
                                onChange={() => toggleCreditSelection(credit.id)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {credit.week_start ? formatWeekRange(new Date(credit.week_start)) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                              ${credit.total_amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-red-600 font-bold">
                              ${credit.outstanding_amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                credit.status === 'overdue' 
                                  ? 'bg-red-100 text-red-800' 
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {credit.status === 'overdue' ? '⚠️ Atrasado' : '📋 Actual'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    💡 El pago se aplicará primero a las notas más antiguas (atrasadas)
                  </p>
                </div>
              )}

              {customerCredits.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  Este cliente no tiene notas pendientes
                </div>
              )}

              <input
                type="number"
                placeholder="Cantidad a pagar"
                step="0.01"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                required
              />
              
              <select
                value={paymentData.method}
                onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value as typeof paymentData.method })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              >
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="other">Otro</option>
              </select>
              
              <textarea
                placeholder="Notas (opcional)"
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                rows={3}
              />
              
              <div className="flex gap-3">
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={customerCredits.length > 0 && selectedCredits.size === 0}
                >
                  Registrar Pago
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => { 
                    setShowPaymentModal(false); 
                    setSelectedCustomerId(null);
                    setSelectedCredits(new Set());
                    setCustomerCredits([]);
                  }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Modal>

          {/* Modal de Historial de Compras */}
          <Modal
            isOpen={showHistoryModal}
            onClose={() => {
              setShowHistoryModal(false);
              setCustomerHistory([]);
              setSelectedCustomerId(null);
            }}
            title={`Historial de Compras - ${customers.find(c => c.id === selectedCustomerId)?.name}`}
            className="max-w-4xl"
          >
            <div className="space-y-4">
              {customerHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay compras registradas</p>
              ) : (
                <div className="space-y-3">
                  {customerHistory.map((sale) => (
                    <div key={sale.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-gray-800">
                            {new Date(sale.created_at).toLocaleDateString('es-MX', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                          <p className="text-sm text-gray-600">
                            {sale.sale_items?.length || 0} productos
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">
                            ${sale.total_amount.toFixed(2)}
                          </p>
                          <span className={`text-xs px-2 py-1 rounded ${
                            sale.status === 'paid' 
                              ? 'bg-green-200 text-green-800' 
                              : 'bg-yellow-200 text-yellow-800'
                          }`}>
                            {sale.status === 'paid' ? '💳 Pagado' : '💰 Crédito'}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        {sale.sale_items?.map((item: any, idx: number) => (
                          <div key={idx} className="text-sm text-gray-600 flex justify-between">
                            <span>• {item.product?.name || 'Producto'} x{item.quantity}</span>
                            <span className="font-medium">${item.total_price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => {
                    setShowHistoryModal(false);
                    setCustomerHistory([]);
                    setSelectedCustomerId(null);
                  }}
                  variant="secondary"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
}
