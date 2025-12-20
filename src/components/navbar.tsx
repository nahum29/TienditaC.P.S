'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import DarkModeToggle from './dark-mode-toggle';

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-blue-600 dark:bg-gray-900 text-white p-4 shadow-lg transition-colors">
      <div className="flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold">
          Tiendita C.P.S
        </Link>

        <div className="flex items-center gap-4">
          <DarkModeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>
    </nav>
  );
}
