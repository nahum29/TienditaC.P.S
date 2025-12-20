'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/database.types';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { Modal } from '@/components/modal';
import { Button } from '@/components/button';
import { Table } from '@/components/table';
import { Plus, Edit2, Trash2, Barcode, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import JsBarcode from 'jsbarcode';

type Product = Database['public']['Tables']['products']['Row'];

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcodes, setSelectedBarcodes] = useState<Set<string>>(new Set());

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
  
  // Nuevas mejoras
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Detectar escaneo de código de barras en el buscador
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Solo escuchar si el buscador está enfocado o no hay modal abierto
      if (showModal || showBarcodeModal) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;

      // Si pasan más de 100ms entre teclas, reiniciar el buffer
      if (timeDiff > 100) {
        barcodeBuffer = '';
      }

      lastKeyTime = currentTime;

      if (e.key === 'Enter' && barcodeBuffer.length > 0) {
        // Buscar producto por código de barras
        const product = products.find(
          (p) => p.sku?.toLowerCase() === barcodeBuffer.toLowerCase()
        );

        if (product) {
          handleEdit(product);
          toast.success(`Producto encontrado: ${product.name}`);
        } else {
          // Si no existe, buscar en la base de datos por si acaso
          searchInputRef.current?.focus();
          setSearchQuery(barcodeBuffer);
        }

        barcodeBuffer = '';
        e.preventDefault();
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, showModal, showBarcodeModal]);

  // Filtrar productos según el buscador
  const filteredProducts = products.filter((product) => {
    const query = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(query) ||
      (product.sku?.toLowerCase().includes(query)) ||
      (product.description?.toLowerCase().includes(query))
    );
  });

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
      // Verificar si el SKU ya existe (al crear un nuevo producto)
      if (!editingId && formData.sku) {
        const existingProduct = products.find(
          (p) => p.sku?.toLowerCase() === formData.sku.toLowerCase()
        );

        if (existingProduct) {
          toast.error(`El código ${formData.sku} ya existe. Abriendo producto existente...`);
          handleEdit(existingProduct);
          return;
        }
      }

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

      // If SKU not provided, generate one using EAN-13 format (13 numeric digits)
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
        data.sku = generateSKU(); // Generar código para todos los productos (a granel o no)
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
    const bulkFlag = !!((product as any).is_bulk);
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

  // Edición rápida de precio
  const handlePriceDoubleClick = (product: Product) => {
    setEditingPriceId(product.id);
    setTempPrice(product.price.toString());
  };

  const handlePriceSave = async (productId: string) => {
    try {
      const newPrice = parseFloat(tempPrice);
      if (isNaN(newPrice) || newPrice <= 0) {
        toast.error('Precio inválido');
        return;
      }

      const { error } = await supabase
        .from('products')
        .update({ price: newPrice })
        .eq('id', productId);

      if (error) throw error;
      
      toast.success('Precio actualizado');
      setEditingPriceId(null);
      fetchData();
    } catch (error) {
      toast.error('Error al actualizar precio');
    }
  };

  // Importar productos desde Excel
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const productsToImport = jsonData.map((row) => ({
        name: row.Nombre || row.nombre || row.name,
        sku: row.SKU || row.sku || row.codigo,
        description: row.Descripcion || row.descripcion || row.description || null,
        price: parseFloat(row.Precio || row.precio || row.price || 0),
        cost: parseFloat(row.Costo || row.costo || row.cost || 0) || null,
        stock: parseInt(row.Stock || row.stock || 0) || 0,
        low_stock_threshold: parseInt(row['Stock Minimo'] || row.stock_minimo || row.low_stock || 5) || 5,
        is_bulk: (row['Es Granel'] || row.es_granel || row.is_bulk || 'no').toLowerCase() === 'si' || (row['Es Granel'] || row.es_granel || row.is_bulk) === true,
      })).filter(p => p.name && p.price > 0);

      if (productsToImport.length === 0) {
        toast.error('No se encontraron productos válidos en el archivo');
        return;
      }

      const { data: inserted, error } = await supabase
        .from('products')
        .insert(productsToImport)
        .select();

      if (error) throw error;

      toast.success(`${inserted?.length || 0} productos importados exitosamente`);
      setShowImportModal(false);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error('Error al importar productos. Verifica el formato del archivo.');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleBarcodeSelection = (productId: string) => {
    setSelectedBarcodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const toggleAllBarcodes = () => {
    if (selectedBarcodes.size === products.length) {
      setSelectedBarcodes(new Set());
    } else {
      setSelectedBarcodes(new Set(products.map((p) => p.id)));
    }
  };

  const handlePrintBarcodes = () => {
    if (selectedBarcodes.size === 0) {
      toast.error('Selecciona al menos un producto');
      return;
    }

    const selectedProducts = products.filter((p) => selectedBarcodes.has(p.id));
    
    // Crear HTML para impresión con imágenes base64
    let htmlContent = '';

    selectedProducts.forEach((product, index) => {
      if (!product.sku) return;

      // Crear canvas temporal para generar el código de barras
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, product.sku, {
          format: 'CODE128',
          width: 2,
          height: 50,
          displayValue: false,
          margin: 5,
        });

        // Convertir canvas a imagen base64
        const barcodeImage = canvas.toDataURL('image/png');

        // Crear HTML de cada código
        htmlContent += `
          <div style="
            margin-bottom: 15mm;
            page-break-inside: avoid;
            page-break-after: always;
            text-align: center;
          ">
            <div style="
              font-size: 10pt;
              font-weight: bold;
              margin-bottom: 3mm;
              word-wrap: break-word;
            ">
              ${product.name}
            </div>
            <img src="${barcodeImage}" alt="Código de barras" style="display: block; margin: 0 auto;" />
            <div style="
              font-size: 9pt;
              margin-top: 2mm;
            ">
              ${product.sku}
            </div>
            <div style="
              font-size: 12pt;
              font-weight: bold;
              margin-top: 3mm;
              color: #000;
            ">
              $${product.sale_price.toFixed(2)}
            </div>
          </div>
        `;
      } catch (e) {
        console.error('Error generando código de barras', e);
      }
    });

    // Abrir ventana de impresión
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Códigos de Barras</title>
            <style>
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
                width: 80mm;
                font-family: monospace;
                padding: 5mm;
              }
              @media print {
                body {
                  width: 80mm;
                }
              }
            </style>
          </head>
          <body>
            ${htmlContent}
          </body>
        </html>
      `);
      printWindow.document.close();
      
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    } else {
      toast.error('No se pudo abrir la ventana de impresión');
    }

    setShowBarcodeModal(false);

    setShowBarcodeModal(false);
    setSelectedBarcodes(new Set());
  };

  const tableRows = filteredProducts.map((p) => [
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
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setShowBarcodeModal(true);
                  setSelectedBarcodes(new Set());
                }}
                variant="secondary"
              >
                <Barcode className="w-5 h-5 inline mr-2" />
                Imprimir Códigos
              </Button>
              <Button 
                onClick={() => setShowImportModal(true)}
                variant="secondary"
              >
                📥 Importar Excel
              </Button>
              <Button onClick={() => { setShowModal(true); setEditingId(null); setFormData({ name: '', sku: '', description: '', price: '', cost: '', stock: '', low_stock_threshold: '', is_bulk: false }); }}>
                <Plus className="w-5 h-5 inline mr-2" />
                Nuevo Producto
              </Button>
            </div>
          </div>

          {/* Buscador */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar por nombre o código de barras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-sm text-gray-600 mt-2">
                Mostrando {filteredProducts.length} de {products.length} productos
              </p>
            )}
          </div>

          {/* Alertas de stock crítico */}
          {filteredProducts.filter(p => p.stock <= (p.low_stock_threshold || 5)).length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-yellow-800">
                    {filteredProducts.filter(p => p.stock <= (p.low_stock_threshold || 5)).length} productos con stock bajo
                  </p>
                  <p className="text-sm text-yellow-700">
                    Considera reabastecer pronto
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className={p.stock <= (p.low_stock_threshold || 5) ? 'bg-yellow-50' : ''}>
                    <td className="px-6 py-4 text-sm text-gray-800">{p.sku || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{p.name}</td>
                    <td 
                      className="px-6 py-4 text-sm text-gray-800 cursor-pointer hover:bg-blue-50"
                      onDoubleClick={() => handlePriceDoubleClick(p)}
                      title="Doble clic para editar"
                    >
                      {editingPriceId === p.id ? (
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handlePriceSave(p.id);
                              if (e.key === 'Escape') setEditingPriceId(null);
                            }}
                            className="w-24 px-2 py-1 border rounded"
                            autoFocus
                          />
                          <button
                            onClick={() => handlePriceSave(p.id)}
                            className="px-2 py-1 bg-green-500 text-white rounded text-xs"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingPriceId(null)}
                            className="px-2 py-1 bg-gray-500 text-white rounded text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        `$${p.price.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-800">
                      {(p as any).is_bulk ? `${(p.stock / 1000).toFixed(2)} kg` : String(p.stock)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {p.stock <= (p.low_stock_threshold || 5) ? (
                        <span className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs font-semibold">
                          ⚠️ Bajo
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-semibold">
                          ✓ OK
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(p)}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                onKeyDown={(e) => {
                  // Detectar escaneo (Enter después de escribir el código)
                  if (e.key === 'Enter' && formData.sku && !editingId) {
                    e.preventDefault();
                    
                    // Buscar si el producto ya existe
                    const existingProduct = products.find(
                      (p) => p.sku?.toLowerCase() === formData.sku.toLowerCase()
                    );
                    
                    if (existingProduct) {
                      toast.success(`Producto encontrado: ${existingProduct.name}. Abriendo para editar...`);
                      setShowModal(false);
                      setTimeout(() => {
                        handleEdit(existingProduct);
                      }, 100);
                    }
                  }
                }}
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

          {/* Modal de Impresión de Códigos de Barras */}
          <Modal
            isOpen={showBarcodeModal}
            onClose={() => {
              setShowBarcodeModal(false);
              setSelectedBarcodes(new Set());
            }}
            title="Seleccionar Productos para Imprimir"
            className="max-w-2xl"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Selecciona los productos cuyos códigos de barras deseas imprimir
                </p>
                <Button
                  onClick={toggleAllBarcodes}
                  variant="secondary"
                  size="sm"
                >
                  {selectedBarcodes.size === products.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                </Button>
              </div>

              <div className="max-h-96 overflow-y-auto border rounded p-3 space-y-2">
                {products.map((product) => (
                  <label
                    key={product.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded cursor-pointer border border-gray-200"
                  >
                    <input
                      type="checkbox"
                      checked={selectedBarcodes.has(product.id)}
                      onChange={() => toggleBarcodeSelection(product.id)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">
                        SKU: {product.sku || 'Sin código'} | Precio: ${product.price.toFixed(2)}
                      </p>
                    </div>
                  </label>
                ))}
                {products.length === 0 && (
                  <p className="text-gray-500 text-center py-8">No hay productos disponibles</p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-gray-700">
                  Se imprimirán <strong>{selectedBarcodes.size}</strong> códigos de barras
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <Button
                  onClick={() => {
                    setShowBarcodeModal(false);
                    setSelectedBarcodes(new Set());
                  }}
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handlePrintBarcodes}
                  disabled={selectedBarcodes.size === 0}
                >
                  Imprimir {selectedBarcodes.size > 0 && `(${selectedBarcodes.size})`}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal de Importar Excel */}
          <Modal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            title="Importar Productos desde Excel"
            className="max-w-2xl"
          >
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Formato requerido:</strong> El archivo Excel debe tener las siguientes columnas:
                </p>
                <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li><strong>Nombre</strong> (obligatorio)</li>
                  <li><strong>SKU</strong> o Código (opcional)</li>
                  <li><strong>Precio</strong> (obligatorio)</li>
                  <li><strong>Costo</strong> (opcional)</li>
                  <li><strong>Stock</strong> (opcional, por defecto 0)</li>
                  <li><strong>Stock Minimo</strong> (opcional, por defecto 5)</li>
                  <li><strong>Descripcion</strong> (opcional)</li>
                  <li><strong>Es Granel</strong> (opcional: "si" o "no")</li>
                </ul>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportExcel}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  onClick={() => setShowImportModal(false)}
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
