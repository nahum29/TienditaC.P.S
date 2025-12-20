'use client';

import { useEffect, useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { useRouter } from 'next/navigation';
import { createClient, OPERATOR_ID } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { getWeekStart, getWeekEnd, toDateString } from '@/lib/weekly-credits';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Modal } from '@/components/modal';
import { Button } from '@/components/button';
import { Trash2, Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';

type Product = Database['public']['Tables']['products']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice?: number; // price per unit or per gram
  isBulk?: boolean;
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'credit'>('cash');
  const [searchProduct, setSearchProduct] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });

  const router = useRouter();
  const supabase = createClient();
  const barcodeBuffer = useRef<string>('');
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // Listener para escaneo de códigos de barras
    const handleKeyDown = (e: KeyboardEvent) => {
      // Si el evento viene de un input de texto, ignorar (búsqueda manual)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text' && (target as HTMLInputElement).placeholder === 'Buscar producto por nombre o SKU...') {
        return;
      }

      // Detectar escaneo: acumular caracteres hasta Enter (rápido)
      if (e.key === 'Enter' && barcodeBuffer.current.length > 0) {
        e.preventDefault();
        handleBarcodeScanned(barcodeBuffer.current);
        barcodeBuffer.current = '';
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
        return;
      }

      // Acumular caracteres (excluyendo teclas especiales)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBuffer.current += e.key;

        // Reset timeout si hay uno activo
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);

        // Si no se recibe más input en 1 segundo, asumir que fue un error
        barcodeTimeoutRef.current = setTimeout(() => {
          barcodeBuffer.current = '';
        }, 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
    };
  }, [products]); // cart ya no es necesario con la forma funcional de setState

  const fetchData = async () => {
    try {
      const [productsRes, customersRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('name'),
        supabase.from('customers').select('*').order('name'),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;

      setProducts(productsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    // Buscar producto por SKU o barcode
    const product = products.find((p) =>
      (p.sku && p.sku.toLowerCase() === barcode.toLowerCase())
    );

    if (product) {
      // Producto existe: agregar al carrito
      if (product.stock <= 0) {
        toast.error('Producto sin stock');
        return;
      }
      addToCart(product);
    } else {
      // Producto no existe: redirigir a Inventario con el código pre-llenado
      toast.success('Producto no encontrado. Redirigiendo a Inventario...');
      // Guardar el código en sessionStorage para que Inventario lo cargue
      sessionStorage.setItem('newProductSKU', barcode);
      router.push('/inventory');
    }
  };

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkProduct, setBulkProduct] = useState<Product | null>(null);
  const [bulkGrams, setBulkGrams] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error('Producto sin stock');
      return;
    }

    const isBulk = !!product.is_bulk;
    if (isBulk) {
      // open modal to ask for grams or price
      setBulkProduct(product);
      setBulkGrams('');
      setBulkAmount('');
      setShowBulkModal(true);
      return;
    }

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id && !item.isBulk);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.error('Stock insuficiente');
          return prevCart;
        }
        return prevCart.map((item) =>
          item.product.id === product.id && !item.isBulk ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prevCart, { product, quantity: 1, unitPrice: product.price, isBulk: false }];
      }
    });
    toast.success('Agregado al carrito');
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setCart((prevCart) => {
      if (quantity <= 0) {
        return prevCart.filter((item) => item.product.id !== productId);
      } else {
        return prevCart.map((item) =>
          item.product.id === productId ? { ...item, quantity } : item
        );
      }
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
  };

  const total = cart.reduce((sum, item) => sum + (item.unitPrice || item.product.price) * item.quantity, 0);
  // Ticket preview state and helper to create thermal-sized PDF (80mm width)
  const [showTicketPreview, setShowTicketPreview] = useState(false);
  const [ticketPreviewUrl, setTicketPreviewUrl] = useState<string | null>(null);
  const [ticketBlob, setTicketBlob] = useState<Blob | null>(null);
  const ticketIframeRef = useRef<HTMLIFrameElement | null>(null);

  const createThermalTicket = async (sale: any, items: any[], customer: Customer | null, payment: any) => {
    try {
      // Estimate height: base + items * per-line mm
      const baseMm = 50; // header + footer
      const perItemMm = 6;
      const heightMm = Math.max(80, baseMm + items.length * perItemMm);

      const doc = new jsPDF({ unit: 'mm', format: [80, heightMm] });
      const left = 4;
      let y = 8;

      doc.setFontSize(12);
      doc.text('Tiendita C.P.S', 40, y, { align: 'center' });
      y += 6;
      doc.setFontSize(8);
      doc.text(`Venta: ${sale.id}`, left, y);
      y += 5;
      doc.text(`Fecha: ${new Date(sale.created_at || Date.now()).toLocaleString()}`, left, y);
      y += 6;
      if (customer) {
        doc.text(`Cliente: ${customer.name}`, left, y);
        y += 6;
      }

      doc.text('------------------------------', left, y);
      y += 4;

      doc.setFontSize(8);
      items.forEach((it) => {
        const name = it.product.name;
        const qty = it.isBulk ? `${it.quantity} g` : `${it.quantity}`;
        const unit = (it.unitPrice || it.product.price).toFixed(2);
        const line = `${name}`;
        // name (may wrap) then qty x unit on next
        doc.text(line, left, y);
        y += 5;
        const line2 = `${qty} x $${unit}  $${((it.unitPrice || it.product.price) * it.quantity).toFixed(2)}`;
        doc.text(line2, left, y);
        y += 6;
      });

      doc.text('------------------------------', left, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Total: $${total.toFixed(2)}`, left, y);
      y += 6;
      if (payment) {
        doc.setFontSize(8);
        doc.text(`Pago: $${payment.amount.toFixed(2)} (${payment.method})`, left, y);
        y += 6;
      }

      doc.setFontSize(9);
      doc.text('DLP', 40, y + 6, { align: 'center' });
      doc.setFontSize(7);
      doc.text('Dios le pague', 40, y + 11, { align: 'center' });

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      return { blob, url };
    } catch (e) {
      console.warn('Error creating thermal ticket', e);
      return null;
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.from('customers').insert([newCustomer]).select().single();
      if (error) throw error;
      setCustomers([...customers, data]);
      setSelectedCustomer(data.id);
      setNewCustomer({ name: '', phone: '', email: '', address: '' });
      setShowCustomerModal(false);
      toast.success('Cliente creado');
    } catch {
      toast.error('Error al crear cliente');
    }
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    // Si la forma de pago es crédito, debe seleccionarse un cliente
    if (paymentMethod === 'credit' && !selectedCustomer) {
      toast.error('Seleccione un cliente para ventas a crédito');
      return;
    }

    try {
      const totalCost = cart.reduce((sum, item) => {
        const costPer = item.isBulk ? ((item.product.cost || 0) / 1000) : (item.product.cost || 0);
        return sum + costPer * item.quantity;
      }, 0);

        // Ensure operator profile exists (foreign key on sales.created_by -> profiles.id).
        // If the client cannot create the profile due to RLS/auth, abort and show an actionable message.
        const { data: existingProfile, error: profileCheckError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', OPERATOR_ID)
          .maybeSingle();

        if (profileCheckError) {
          console.warn('Error checking operator profile', profileCheckError);
        }

        if (!existingProfile) {
          const { error: profileCreateError } = await supabase.from('profiles').insert({ id: OPERATOR_ID, full_name: 'Operador', role: 'operator' });
          if (profileCreateError) {
            // Likely RLS or unauthorized; provide an explicit instruction for the developer/admin
            const helpSql = `INSERT INTO profiles (id, full_name, role) VALUES ('${OPERATOR_ID}', 'Operador', 'operator');`;
            throw new Error(`Perfil de operador ausente y no se pudo crear automáticamente. Ejecuta este SQL en Supabase SQL editor como admin:\n\n${helpSql}`);
          }
        }

        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert({
            customer_id: selectedCustomer || null,
            total_amount: total,
            total_cost: totalCost,
            status: paymentMethod === 'credit' ? 'credit' : 'paid',
            created_by: OPERATOR_ID,
          })
          .select()
          .single();

      if (saleError) throw saleError;

      const saleItems = cart.map((item) => {
        const unitPrice = item.unitPrice || item.product.price;
        return {
          sale_id: sale.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: unitPrice * item.quantity,
        };
      });

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      if (paymentMethod === 'credit' && selectedCustomer) {
        const customer = customers.find((c) => c.id === selectedCustomer);
        if (customer) {
          // Calcular las fechas de la semana actual
          const now = new Date();
          const weekStart = getWeekStart(now);
          const weekEnd = getWeekEnd(weekStart);
          const weekStartStr = toDateString(weekStart);
          const weekEndStr = toDateString(weekEnd);

          // Buscar si ya existe un crédito abierto para este cliente en la semana actual
          const { data: existingCredit, error: creditFindError } = await supabase
            .from('credits')
            .select('*')
            .eq('customer_id', selectedCustomer)
            .eq('week_start', weekStartStr)
            .eq('status', 'open')
            .maybeSingle();

          if (creditFindError) throw creditFindError;

          let creditId: string;

          if (existingCredit) {
            // Actualizar el crédito existente sumando el monto de esta venta
            const newTotal = existingCredit.total_amount + total;
            const newOutstanding = existingCredit.outstanding_amount + total;

            const { error: creditUpdateError } = await supabase
              .from('credits')
              .update({
                total_amount: newTotal,
                outstanding_amount: newOutstanding,
              })
              .eq('id', existingCredit.id);

            if (creditUpdateError) throw creditUpdateError;
            creditId = existingCredit.id;
          } else {
            // Crear un nuevo crédito para esta semana
            const { data: newCredit, error: creditError } = await supabase
              .from('credits')
              .insert({
                sale_id: null, // Ya no usamos este campo para créditos semanales
                customer_id: selectedCustomer,
                total_amount: total,
                outstanding_amount: total,
                status: 'open',
                week_start: weekStartStr,
                week_end: weekEndStr,
                due_date: weekEndStr,
              })
              .select()
              .single();

            if (creditError) throw creditError;
            creditId = newCredit.id;
          }

          // Registrar la relación entre el crédito y esta venta
          const { error: creditSaleError } = await supabase
            .from('credit_sales')
            .insert({
              credit_id: creditId,
              sale_id: sale.id,
            });

          if (creditSaleError) throw creditSaleError;

          // Actualizar el balance del cliente
          await supabase
            .from('customers')
            .update({ balance: customer.balance + total })
            .eq('id', selectedCustomer);
        }
      }

      if (paymentMethod !== 'credit') {
        const { data: paymentRow, error: paymentError } = await supabase.from('payments').insert({
          sale_id: sale.id,
          customer_id: selectedCustomer || null,
          amount: total,
          method: paymentMethod === 'card' ? 'card' : 'cash',
          received_by: OPERATOR_ID,
        }).select().single();
        if (paymentError) throw paymentError;

        // Generate ticket PDF for non-credit sales (best-effort; failures shouldn't block the flow)
        try {
          // prepare items list for ticket using the local cart snapshot (pass `cart` so we have product info)
          const ticket = await createThermalTicket(sale, cart, customers.find((c) => c.id === selectedCustomer) || null, paymentRow);
          if (ticket && ticket.url) {
            setTicketBlob(ticket.blob);
            setTicketPreviewUrl(ticket.url);
            setShowTicketPreview(true);
          }
        } catch (e) {
          console.warn('No se pudo generar ticket PDF', e);
        }
      }

      await Promise.all(
        cart.map((item) => {
          const newStock = item.product.stock - item.quantity;
          return supabase
            .from('products')
            .update({ stock: newStock })
            .eq('id', item.product.id);
        })
      );

      toast.success('Venta completada exitosamente');
      setCart([]);
      setSelectedCustomer('');
      setPaymentMethod('cash');
      fetchData();
    } catch (error: any) {
      console.error('Error completing sale:', error);
      // Supabase Error object may be nested
      const msg = error?.message || error?.error_description || JSON.stringify(error);
      toast.error(msg || 'Error al completar la venta');
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(searchProduct.toLowerCase()))
  );

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
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Punto de Venta</h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Products */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <input
                  type="text"
                  placeholder="Buscar producto por nombre o SKU..."
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 placeholder-gray-400 text-gray-800"
                />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className={`p-4 rounded-lg border cursor-pointer transition ${
                        product.stock > 0
                          ? 'border-gray-200 hover:border-blue-500 bg-white'
                          : 'border-gray-300 bg-gray-100 cursor-not-allowed opacity-50'
                      }`}
                      onClick={() => product.stock > 0 && addToCart(product)}
                    >
                      <p className="font-semibold text-sm text-gray-800 truncate">{product.name}</p>
                      <p className="text-blue-600 font-bold text-lg">${product.price.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">Stock: {(product as any).is_bulk ? `${(product.stock / 1000).toFixed(2)} kg` : product.stock}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cart and Checkout */}
            <div>
              <div className="bg-white rounded-lg shadow p-6 sticky top-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Carrito</h2>

                {cart.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Carrito vacío</p>
                ) : (
                  <>
                    <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                      {cart.map((item) => (
                        <div key={item.product.id} className="border rounded-lg p-3">
                          <p className="font-medium text-sm text-gray-800 truncate">{item.product.name}</p>
                          <p className="text-sm text-gray-600">
                            ${((item.unitPrice || item.product.price) * (item.isBulk ? 1000 : 1)).toFixed(2)} {item.isBulk ? '/kg' : ''} x {item.isBulk ? `${item.quantity} g` : item.quantity}
                          </p>
                          <p className="font-semibold text-blue-600">${(((item.unitPrice || item.product.price) * item.quantity)).toFixed(2)}</p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => updateQuantity(item.product.id, item.quantity - (item.isBulk ? 50 : 1))}
                              className="flex-1 bg-gray-200 hover:bg-gray-300 p-1 rounded text-sm"
                            >
                              <Minus className="w-4 h-4 mx-auto" />
                            </button>
                            <span className="flex-1 text-center text-sm font-medium">{item.isBulk ? `${item.quantity} g` : item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.product.id, item.quantity + (item.isBulk ? 50 : 1))}
                              className="flex-1 bg-gray-200 hover:bg-gray-300 p-1 rounded text-sm"
                            >
                              <Plus className="w-4 h-4 mx-auto" />
                            </button>
                            <button
                              onClick={() => removeFromCart(item.product.id)}
                              className="flex-1 bg-red-100 hover:bg-red-200 text-red-600 p-1 rounded text-sm"
                            >
                              <Trash2 className="w-4 h-4 mx-auto" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-4 mb-4">
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-lg text-blue-600">${total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Cliente (Opcional)
                        </label>
                        <select
                          value={selectedCustomer}
                          onChange={(e) => setSelectedCustomer(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Cliente Genérico</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button
                        onClick={() => setShowCustomerModal(true)}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        + Nuevo Cliente
                      </Button>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Método de Pago
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="card">Tarjeta</option>
                          <option value="credit">Crédito</option>
                        </select>
                      </div>
                    </div>

                    <Button onClick={handleCompleteSale} className="w-full mb-2">
                      Completar Venta
                    </Button>
                    <Button
                      onClick={() => setCart([])}
                      variant="secondary"
                      className="w-full"
                    >
                      Limpiar Carrito
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <Modal
            isOpen={showCustomerModal}
            onClose={() => setShowCustomerModal(false)}
            title="Nuevo Cliente"
            className="max-w-md"
          >
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <input
                type="text"
                placeholder="Nombre"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                required
              />
              <input
                type="tel"
                placeholder="Teléfono"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <input
                type="email"
                placeholder="Correo"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <input
                type="text"
                placeholder="Dirección"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Crear Cliente
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCustomerModal(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Modal>

          {/* Ticket preview modal (thermal) */}
          <Modal
            isOpen={showTicketPreview}
            onClose={() => {
              setShowTicketPreview(false);
              if (ticketPreviewUrl) {
                URL.revokeObjectURL(ticketPreviewUrl);
                setTicketPreviewUrl(null);
                setTicketBlob(null);
              }
            }}
            title="Vista previa del ticket"
            className="max-w-md"
          >
            <div className="space-y-4">
              {ticketPreviewUrl ? (
                <iframe
                  ref={(el) => { ticketIframeRef.current = el; }}
                  src={ticketPreviewUrl}
                  style={{ width: '100%', height: '400px', border: 'none' }}
                  onLoad={() => {
                    // Asegurar que el iframe esté completamente cargado
                    console.log('Iframe del ticket cargado');
                  }}
                />
              ) : (
                <p>No hay vista previa disponible.</p>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    try {
                      if (ticketBlob) {
                        // Método más confiable: abrir en nueva ventana y llamar print
                        const url = URL.createObjectURL(ticketBlob);
                        const printWindow = window.open(url, '_blank');
                        if (printWindow) {
                          printWindow.onload = () => {
                            setTimeout(() => {
                              printWindow.print();
                              // No cerrar la ventana automáticamente para que el usuario pueda reimprimir
                            }, 250);
                          };
                        } else {
                          toast.error('No se pudo abrir ventana de impresión. Verifique el bloqueador de ventanas emergentes.');
                        }
                      } else {
                        toast.error('No hay ticket para imprimir');
                      }
                    } catch (e) {
                      console.error('Error al imprimir', e);
                      toast.error('Error al imprimir el ticket');
                    }
                    // Cerrar modal después de iniciar impresión
                    setShowTicketPreview(false);
                  }}
                  className="flex-1"
                >
                  Imprimir
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowTicketPreview(false);
                    if (ticketPreviewUrl) {
                      URL.revokeObjectURL(ticketPreviewUrl);
                      setTicketPreviewUrl(null);
                      setTicketBlob(null);
                    }
                  }}
                  className="flex-1"
                >
                  No imprimir
                </Button>
              </div>
            </div>
          </Modal>

          <Modal
            isOpen={showBulkModal}
            onClose={() => setShowBulkModal(false)}
            title="Vender A Granel"
            className="max-w-md"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Producto: {bulkProduct?.name}</p>
              <div>
                <label className="block text-sm mb-1">Gramos</label>
                <input
                  type="number"
                  placeholder="Cantidad en gramos"
                  value={bulkGrams}
                  onChange={(e) => {
                    const g = e.target.value;
                    setBulkGrams(g);
                    // compute amount from grams if product available
                    if (bulkProduct && g) {
                      const grams = parseFloat(g || '0');
                      const pricePerKg = bulkProduct.price; // stored price assumed per kg
                      const amount = (pricePerKg * grams) / 1000;
                      setBulkAmount(amount ? amount.toFixed(2) : '');
                    } else {
                      setBulkAmount('');
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Precio (pesos)</label>
                <input
                  type="number"
                  placeholder="Monto en pesos"
                  value={bulkAmount}
                  onChange={(e) => {
                    const a = e.target.value;
                    setBulkAmount(a);
                    if (bulkProduct && a) {
                      const amount = parseFloat(a || '0');
                      const pricePerKg = bulkProduct.price; // per kg
                      const grams = pricePerKg > 0 ? (amount / pricePerKg) * 1000 : 0;
                      setBulkGrams(grams ? Math.round(grams).toString() : '');
                    } else {
                      setBulkGrams('');
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    if (!bulkProduct) return;
                    const grams = Math.max(0, parseInt(bulkGrams || '0'));
                    if (grams <= 0) {
                      toast.error('Ingrese gramos válidos');
                      return;
                    }
                    const unitPricePerGram = bulkProduct.price / 1000; // price per gram

                    // add to cart as bulk item: quantity in grams
                    setCart((prevCart) => [
                      ...prevCart,
                      { product: bulkProduct, quantity: grams, unitPrice: unitPricePerGram, isBulk: true },
                    ]);
                    setShowBulkModal(false);
                    setBulkProduct(null);
                    setBulkGrams('');
                    setBulkAmount('');
                    toast.success('Agregado al carrito');
                  }}
                  className="flex-1"
                >
                  Agregar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => { setShowBulkModal(false); setBulkProduct(null); }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
}
