'use client';

import { useEffect, useState } from 'react';
import { Search, Package, Users, ShoppingCart, DollarSign, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface SearchResult {
  type: 'product' | 'customer' | 'sale';
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient()!;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        setResults([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      const searchResults: SearchResult[] = [];

      // Buscar productos
      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, barcode')
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.ilike.%${query}%`)
        .limit(5);

      if (products) {
        products.forEach((p: any) => {
          searchResults.push({
            type: 'product',
            id: p.id,
            title: p.name,
            subtitle: `SKU: ${p.sku || '-'} | Código: ${p.barcode || '-'}`,
            link: '/inventory'
          });
        });
      }

      // Buscar clientes
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, email')
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5);

      if (customers) {
        customers.forEach((c: any) => {
          searchResults.push({
            type: 'customer',
            id: c.id,
            title: c.name,
            subtitle: `${c.phone || ''} ${c.email || ''}`.trim(),
            link: '/customers'
          });
        });
      }

      // Buscar ventas por ID o monto
      const { data: sales } = await supabase
        .from('sales')
        .select('id, total_amount, created_at, status')
        .order('created_at', { ascending: false })
        .limit(5);

      if (sales) {
        sales
          .filter((s: any) => s.id.toLowerCase().includes(query.toLowerCase()) || s.total_amount.toString().includes(query))
          .forEach((s: any) => {
            searchResults.push({
              type: 'sale',
              id: s.id,
              title: `Venta ${s.id.slice(0, 8)}`,
              subtitle: `$${s.total_amount.toFixed(2)} - ${new Date(s.created_at).toLocaleDateString()}`,
              link: '/sales'
            });
          });
      }

      if (!cancelled) {
        setResults(searchResults);
        setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(searchTimeout);
    };
  }, [query]);

  const handleResultClick = (result: SearchResult) => {
    router.push(result.link);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-20">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center border-b dark:border-gray-700 px-4 py-3">
          <Search className="w-5 h-5 text-gray-400 mr-2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos, clientes, ventas... (Ctrl+K)"
            className="flex-1 outline-none bg-transparent text-gray-800 dark:text-gray-100"
            autoFocus
          />
          <button onClick={() => setIsOpen(false)} className="ml-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {loading && (
            <div className="text-center py-8 text-gray-500">Buscando...</div>
          )}
          
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="text-center py-8 text-gray-500">No se encontraron resultados</div>
          )}

          {!loading && results.length === 0 && query.trim().length < 2 && (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-2">Escribe al menos 2 caracteres para buscar</p>
              <p className="text-sm">Presiona <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd> para cerrar</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, idx) => (
                <button
                  key={`${result.type}-${result.id}-${idx}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
                >
                  {result.type === 'product' && <Package className="w-5 h-5 text-blue-600" />}
                  {result.type === 'customer' && <Users className="w-5 h-5 text-green-600" />}
                  {result.type === 'sale' && <ShoppingCart className="w-5 h-5 text-purple-600" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{result.title}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{result.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
