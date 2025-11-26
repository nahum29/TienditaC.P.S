'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Modal } from '@/components/modal';
import { Button } from '@/components/button';
import { Table } from '@/components/table';
import { Plus, Edit2, Trash2, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

type Customer = Database['public']['Tables']['customers']['Row'];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [userId] = useState('00000000-0000-0000-0000-000000000000');

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

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) return;

    try {
      const customer = customers.find((c) => c.id === selectedCustomerId);
      if (!customer) return;

      const amount = parseFloat(paymentData.amount);

      // Insert payment and capture the inserted row so we can record allocations
      const { data: paymentRow, error: paymentError } = await supabase.from('payments').insert({
        customer_id: selectedCustomerId,
        amount,
        method: paymentData.method,
        received_by: userId,
        notes: paymentData.notes || null,
      }).select().single();

      if (paymentError) throw paymentError;

      const newBalance = Math.max(0, customer.balance - amount);
      const { error: updateError } = await supabase
        .from('customers')
        .update({ balance: newBalance })
        .eq('id', selectedCustomerId);

      if (updateError) throw updateError;

      // Fetch credits with outstanding balance (cover cases where status might be stale)
      const { data: creditsData, error: creditsError } = await supabase
        .from('credits')
        // ensure we read both values; some historical rows may have outstanding_amount null
        .select('id,outstanding_amount,total_amount')
        .eq('customer_id', selectedCustomerId)
        .order('created_at');

      if (creditsError) throw creditsError;

      let remainingAmount = amount;
      const allocations: { credit_id: string; paid: number }[] = [];
      for (const credit of creditsData || []) {
        if (remainingAmount <= 0) break;

        // if outstanding_amount is null (older rows), fall back to total_amount
        const currentOutstanding = (credit.outstanding_amount ?? credit.total_amount ?? 0);
        if (currentOutstanding <= 0) continue;

        const paid = Math.min(remainingAmount, currentOutstanding);
        const newOutstanding = currentOutstanding - paid;

        const { error: creditUpdateError } = await supabase
          .from('credits')
          .update({
            outstanding_amount: newOutstanding,
            status: newOutstanding === 0 ? 'closed' : 'open',
          })
          .eq('id', credit.id);

        if (creditUpdateError) throw creditUpdateError;

        allocations.push({ credit_id: credit.id, paid });
        remainingAmount -= paid;
      }

      // Insert allocation rows into credit_payments for audit trail
      try {
        if (allocations.length > 0 && paymentRow?.id) {
          const inserts = allocations.map((a) => ({ credit_id: a.credit_id, payment_id: paymentRow.id, amount: a.paid }));
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

      // Update payment notes with allocation details for audit trail
      try {
        await supabase.from('payments').update({ notes: JSON.stringify({ ...(paymentRow?.notes ? { originalNotes: paymentRow.notes } : {}), allocations }) }).eq('id', paymentRow?.id);
      } catch (e) {
        console.warn('No se pudo actualizar notas de pago con asignaciones', e);
      }

      // Notify other UI (credits page) that credits were updated so it can refetch immediately
      try {
        const bc = new BroadcastChannel('pos-updates');
        bc.postMessage({ type: 'credits-updated', customer_id: selectedCustomerId });
        bc.close();
      } catch (e) {
        // BroadcastChannel may not be available in all environments; ignore silently
      }

      // As a more compatible fallback, re-read credits to ensure DB changes are visible
      // and write a localStorage flag so other tabs/listeners can pick it up.
      try {
        const { data: postCredits } = await supabase
          .from('credits')
          .select('id,total_amount,outstanding_amount,status')
          .eq('customer_id', selectedCustomerId);
        // store a small payload so storage events fire across tabs
        try {
          localStorage.setItem('pos:credits-updated', JSON.stringify({ customer_id: selectedCustomerId, ts: Date.now() }));
        } catch (e) {
          // ignore storage errors (e.g., privacy settings)
        }
        console.debug('Credits after payment:', postCredits);
      } catch (e) {
        console.warn('Could not re-read credits after payment', e);
      }

      toast.success('Pago registrado exitosamente');
      setShowPaymentModal(false);
      setPaymentData({ amount: '', method: 'cash', notes: '' });
      fetchData();
    } catch (error) {
      toast.error('Error al registrar pago');
    }
  };

  const tableRows = customers.map((c) => [
    c.name,
    c.phone || '-',
    c.email || '-',
    c.balance > 0 ? `Debe: $${c.balance.toFixed(2)}` : 'Al día',
    c.balance > 0 ? '🔴' : '✅',
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
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Clientes</h1>
            <Button onClick={() => { setShowModal(true); setEditingId(null); setFormData({ name: '', phone: '', email: '', address: '' }); }}>
              <Plus className="w-5 h-5 inline mr-2" />
              Nuevo Cliente
            </Button>
          </div>

          <div className="bg-white rounded-lg shadow">
            <Table
              headers={['Nombre', 'Teléfono', 'Correo', 'Saldo', 'Estado']}
              rows={tableRows}
              actions={[
                {
                  label: 'Pago',
                  onClick: (i) => {
                    setSelectedCustomerId(customers[i].id);
                    setShowPaymentModal(true);
                  },
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
            onClose={() => { setShowPaymentModal(false); setSelectedCustomerId(null); }}
            title="Registrar Pago"
            className="max-w-md"
          >
            <form onSubmit={handlePayment} className="space-y-4">
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
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Registrar Pago
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => { setShowPaymentModal(false); setSelectedCustomerId(null); }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Modal>
        </main>
      </div>
    </div>
  );
}
