'use client';

import { useState } from 'react';
import { Download, Upload, Database } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

export default function BackupManager() {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient()!;

  const handleExportBackup = async () => {
    setLoading(true);
    toast.loading('Generando respaldo...');

    try {
      // Obtener todos los datos
      const [productsRes, customersRes, salesRes, saleItemsRes, creditsRes, paymentsRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('sales').select('*'),
        supabase.from('sale_items').select('*'),
        supabase.from('credits').select('*'),
        supabase.from('payments').select('*')
      ]);

      // Crear workbook con múltiples hojas
      const workbook = XLSX.utils.book_new();
      
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsRes.data || []), 'Productos');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customersRes.data || []), 'Clientes');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRes.data || []), 'Ventas');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(saleItemsRes.data || []), 'Items de Venta');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(creditsRes.data || []), 'Créditos');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(paymentsRes.data || []), 'Pagos');

      // Agregar hoja de metadatos
      const metadata = [
        { campo: 'Fecha de Respaldo', valor: new Date().toLocaleString('es-MX') },
        { campo: 'Productos', valor: productsRes.data?.length || 0 },
        { campo: 'Clientes', valor: customersRes.data?.length || 0 },
        { campo: 'Ventas', valor: salesRes.data?.length || 0 },
        { campo: 'Créditos', valor: creditsRes.data?.length || 0 },
        { campo: 'Pagos', valor: paymentsRes.data?.length || 0 }
      ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metadata), 'Metadata');

      // Descargar archivo
      const fileName = `respaldo_tiendita_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.dismiss();
      toast.success('Respaldo descargado exitosamente');
      
      // Guardar fecha del último respaldo
      localStorage.setItem('lastBackupDate', new Date().toISOString());
    } catch (error) {
      toast.dismiss();
      toast.error('Error al generar respaldo');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getLastBackupDate = () => {
    const lastDate = localStorage.getItem('lastBackupDate');
    if (!lastDate) return 'Nunca';
    
    const date = new Date(lastDate);
    const daysDiff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) return 'Hoy';
    if (daysDiff === 1) return 'Ayer';
    return `Hace ${daysDiff} días`;
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-all z-40"
        title="Gestionar Respaldos"
      >
        <Database className="w-6 h-6" />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">
              Gestión de Respaldos
            </h3>

            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong>Último respaldo:</strong> {getLastBackupDate()}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Se recomienda hacer respaldos semanalmente
                </p>
              </div>

              <button
                onClick={handleExportBackup}
                disabled={loading}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {loading ? 'Generando...' : 'Descargar Respaldo (Excel)'}
              </button>

              <div className="border-t dark:border-gray-600 pt-4">
                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2 text-sm">
                  El respaldo incluye:
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>✓ Productos e inventario</li>
                  <li>✓ Clientes y contactos</li>
                  <li>✓ Ventas y transacciones</li>
                  <li>✓ Créditos y pagos</li>
                </ul>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
