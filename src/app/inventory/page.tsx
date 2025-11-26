'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Modal } from '@/components/modal';
import { Button } from '@/components/button';
import { Table } from '@/components/table';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

type Product = Database['public']['Tables']['products']['Row'];

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    price: '',
    cost: '',
    stock: '',
    low_stock_threshold: '',
    is_bulk: false,
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
    // Revisar si hay un SKU pre-llenado desde el escaneo del POS
    const newProductSKU = sessionStorage.getItem('newProductSKU');
    if (newProductSKU) {
      setFormData((prev) => ({ ...prev, sku: newProductSKU }));
      setShowModal(true);
      sessionStorage.removeItem('newProductSKU');
    }
  }, []);

  const fetchData = async () => {
    try {
      const productsRes = await supabase.from('products').select('*').order('created_at', { ascending: false });
      if (productsRes.error) throw productsRes.error;
      setProducts(productsRes.data || []);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // For bulk products, interpret stock input as kilograms (allow decimals) and store stock in grams.
      const stockValue = formData.is_bulk
        ? Math.max(0, Math.round((parseFloat(formData.stock || '0') || 0) * 1000)) // grams
        : parseInt(formData.stock || '0') || 0; // units

      const lowStockThreshold = formData.low_stock_threshold
        ? parseInt(formData.low_stock_threshold)
        : 5;

      const data = {
        name: formData.name,
        sku: formData.sku || null,
        description: formData.description || null,
        price: parseFloat(formData.price),
        cost: formData.cost ? parseFloat(formData.cost) : null,
        stock: stockValue,
        low_stock_threshold: lowStockThreshold,
        is_bulk: formData.is_bulk,
      };

      // If SKU not provided, generate one. If product is marked as bulk, prefix with BULK- so POS can detect it.
      const generateSKU = () => {
        // Generate a 12-digit numeric payload and compute EAN-13 checksum
        const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
        const nums = digits.split('').map(Number);
        let sum = 0;
        for (let i = 0; i < nums.length; i++) {
          sum += nums[i] * (i % 2 === 0 ? 1 : 3);
        }
        const mod = sum % 10;
        const check = mod === 0 ? 0 : 10 - mod;
        return digits + String(check);
      };

      if (!formData.sku) {
        const skuGenerated = generateSKU();
        data.sku = formData.is_bulk ? `BULK-${skuGenerated}` : skuGenerated;
      } else if (formData.is_bulk && !formData.sku.startsWith('BULK-')) {
        data.sku = `BULK-${formData.sku}`;
      }

      if (editingId) {
        const { error } = await supabase
          .from('products')
          .update(data)
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Producto actualizado');
      } else {
        const { error } = await supabase.from('products').insert([data]);

        if (error) throw error;
        toast.success('Producto creado');
      }

      setShowModal(false);
      setFormData({ name: '', sku: '', description: '', price: '', cost: '', stock: '', low_stock_threshold: '', is_bulk: false });
      setEditingId(null);
      fetchData();
    } catch (error) {
      toast.error('Error al guardar producto');
    }
  };

  const handleEdit = (product: Product) => {
    const bulkFlag = !!(((product as any).is_bulk) || (product.sku && product.sku.startsWith('BULK-')));
    setFormData({
      name: product.name,
      sku: product.sku || '',
      description: product.description || '',
      price: product.price.toString(),
      cost: product.cost?.toString() || '',
      // if product is bulk, show stock in kilograms (allow decimals), otherwise show units
      stock: bulkFlag ? (product.stock / 1000).toString() : product.stock.toString(),
      low_stock_threshold: product.low_stock_threshold?.toString() || '5',
      is_bulk: bulkFlag,
    });
    setEditingId(product.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar este producto?')) {
      try {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        toast.success('Producto eliminado');
        fetchData();
      } catch {
        toast.error('Error al eliminar');
      }
    }
  };

  const tableRows = products.map((p) => [
    p.sku || '-',
    p.name,
    `$${p.price.toFixed(2)}`,
    ( (p as any).is_bulk ? `${(p.stock / 1000).toFixed(2)} kg` : String(p.stock) ),
    p.stock <= (p.low_stock_threshold || 5) ? '⚠️ Bajo' : 'OK',
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
            <h1 className="text-3xl font-bold text-gray-800">Inventario</h1>
            <Button onClick={() => { setShowModal(true); setEditingId(null); setFormData({ name: '', sku: '', description: '', price: '', cost: '', stock: '', low_stock_threshold: '', is_bulk: false }); }}>
              <Plus className="w-5 h-5 inline mr-2" />
              Nuevo Producto
            </Button>
          </div>

          <div className="bg-white rounded-lg shadow">
            <Table
              headers={['SKU', 'Nombre', 'Precio', 'Stock', 'Estado']}
              rows={tableRows}
              actions={[
                { label: 'Editar', onClick: (i) => handleEdit(products[i]) },
                { label: 'Eliminar', onClick: (i) => handleDelete(products[i].id), variant: 'danger' },
              ]}
            />
          </div>

          <Modal
            isOpen={showModal}
            onClose={() => { setShowModal(false); setEditingId(null); }}
            title={editingId ? 'Editar Producto' : 'Nuevo Producto'}
            className="max-w-lg"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Nombre del producto"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                required
              />
              <input
                type="text"
                placeholder="SKU"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <label className="flex items-center gap-2 text-sm mt-2">
                <input
                  type="checkbox"
                  checked={formData.is_bulk}
                  onChange={(e) => setFormData({ ...formData, is_bulk: e.target.checked })}
                  className="form-checkbox h-4 w-4"
                />
                <span>A granel (vender por gramos)</span>
              </label>
              {/* Categories removed: not used in this store */}
              <input
                type="number"
                placeholder="Precio"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                required
              />
              <input
                type="number"
                placeholder="Costo"
                step="0.01"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <input
                type="number"
                placeholder="Stock"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                required
              />
              <input
                type="number"
                placeholder="Umbral de stock bajo"
                value={formData.low_stock_threshold}
                onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              <textarea
                placeholder="Descripción"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
        </main>
      </div>
    </div>
  );
}
