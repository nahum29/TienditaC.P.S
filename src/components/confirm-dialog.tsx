'use client';

import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar'
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const icons = {
    danger: <XCircle className="w-12 h-12 text-red-600" />,
    warning: <AlertTriangle className="w-12 h-12 text-yellow-600" />,
    info: <Info className="w-12 h-12 text-blue-600" />,
    success: <CheckCircle className="w-12 h-12 text-green-600" />
  };

  const buttonColors = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-yellow-600 hover:bg-yellow-700',
    info: 'bg-blue-600 hover:bg-blue-700',
    success: 'bg-green-600 hover:bg-green-700'
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex flex-col items-center text-center mb-6">
            {icons[type]}
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-4">
              {title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              {message}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`flex-1 px-4 py-2 rounded-lg text-white font-medium ${buttonColors[type]}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
