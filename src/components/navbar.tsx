'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { useState } from 'react';

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-blue-600 text-white p-4 shadow-lg">
      <div className="flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold">
          Tiendita C.P.S
        </Link>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>
    </nav>
  );
}
