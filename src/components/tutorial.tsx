'use client';

import { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  icon: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    title: '¡Bienvenido a Tiendita C.P.S!',
    description: 'Este tutorial te ayudará a conocer las funciones principales del sistema. Puedes omitirlo en cualquier momento.',
    icon: '👋'
  },
  {
    title: 'Dashboard',
    description: 'Aquí verás estadísticas clave: ventas, ganancias, productos con stock bajo y clientes con deuda. También incluye gráficas de tendencias.',
    icon: '📊'
  },
  {
    title: 'Punto de Venta (POS)',
    description: 'Escanea productos o búscalos manualmente. Calcula el cambio automáticamente y usa atajos: F1 (efectivo), F2 (crédito), ESC (limpiar).',
    icon: '🛒'
  },
  {
    title: 'Inventario',
    description: 'Gestiona tus productos. Usa el buscador, escanea códigos de barras, edita precios con doble clic y recibe alertas de stock bajo.',
    icon: '📦'
  },
  {
    title: 'Clientes',
    description: 'Administra tu cartera de clientes. Busca por nombre/teléfono/email, consulta historial de compras y envía recordatorios por WhatsApp.',
    icon: '👥'
  },
  {
    title: 'Créditos',
    description: 'Controla las deudas pendientes. Filtra por periodo (semana, mes, vencidos) y realiza seguimiento de pagos.',
    icon: '💳'
  },
  {
    title: 'Búsqueda Global',
    description: 'Presiona Ctrl+K en cualquier momento para buscar productos, clientes o ventas rápidamente desde cualquier parte del sistema.',
    icon: '🔍'
  },
  {
    title: 'Modo Oscuro',
    description: 'Activa el modo oscuro desde el botón en la barra superior para reducir la fatiga visual durante sesiones largas.',
    icon: '🌙'
  },
  {
    title: '¡Listo para empezar!',
    description: 'Ya conoces las funciones principales. Puedes volver a ver este tutorial cuando quieras desde el Dashboard.',
    icon: '🎉'
  }
];

export default function Tutorial() {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    return !hasSeenTutorial;
  });
  const [currentStep, setCurrentStep] = useState(0);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('hasSeenTutorial', 'true');
  };

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  const step = tutorialSteps[currentStep];
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Progress Bar */}
        <div className="h-2 bg-gray-200 dark:bg-gray-700">
          <div 
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="text-5xl">{step.icon}</div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Omitir tutorial"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
            {step.title}
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
            {step.description}
          </p>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {currentStep + 1} de {tutorialSteps.length}
            </div>
            <div className="flex gap-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
              >
                {currentStep === tutorialSteps.length - 1 ? 'Finalizar' : 'Siguiente'}
                {currentStep !== tutorialSteps.length - 1 && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
