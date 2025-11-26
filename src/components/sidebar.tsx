'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  Box,
  Users,
  TrendingUp,
  FileText,
  CreditCard,
} from 'lucide-react';
import clsx from 'clsx';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: TrendingUp },
  { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
  { href: '/inventory', label: 'Inventario', icon: Box },
  { href: '/customers', label: 'Clientes', icon: Users },
  { href: '/credits', label: 'Créditos', icon: CreditCard },
  { href: '/sales', label: 'Ventas', icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:block w-64 bg-gray-900 text-white min-h-screen shadow-lg">
      <div className="p-6">
        <h2 className="text-lg font-bold mb-8">Menú</h2>
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-800 text-gray-300'
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
