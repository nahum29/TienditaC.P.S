// Utilidades para el sistema de créditos semanales (Sábado a Sábado)

/**
 * Obtiene el inicio de la semana de crédito (sábado a las 00:00)
 * @param date Fecha para la cual calcular el inicio de semana
 * @returns Fecha del sábado que inicia la semana
 */
export function getWeekStart(date: Date = new Date()): Date {
  const dayOfWeek = date.getDay(); // 0=domingo, 6=sábado
  const result = new Date(date);
  
  // Si es sábado, verificar si es el inicio (00:00:00)
  if (dayOfWeek === 6) {
    result.setHours(0, 0, 0, 0);
    return result;
  }
  
  // Si no es sábado, retroceder al sábado anterior
  const daysToSubtract = dayOfWeek === 0 ? 1 : dayOfWeek + 1;
  result.setDate(result.getDate() - daysToSubtract);
  result.setHours(0, 0, 0, 0);
  
  return result;
}

/**
 * Obtiene el fin de la semana de crédito (viernes a las 23:59:59)
 * @param weekStart Fecha de inicio de la semana
 * @returns Fecha del viernes que termina la semana
 */
export function getWeekEnd(weekStart: Date): Date {
  const result = new Date(weekStart);
  result.setDate(result.getDate() + 6); // Sábado + 6 días = Viernes
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Formatea el rango de fechas de la semana para mostrar
 * @param weekStart Fecha de inicio de la semana
 * @returns String con el rango "DD/MM - DD/MM"
 */
export function formatWeekRange(weekStart: Date): string {
  const weekEnd = getWeekEnd(weekStart);
  
  const formatDate = (date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  };
  
  return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
}

/**
 * Convierte una fecha a formato ISO para la base de datos (solo fecha, sin hora)
 * @param date Fecha a convertir
 * @returns String en formato YYYY-MM-DD
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Verifica si una fecha está dentro de la semana actual de créditos
 * @param date Fecha a verificar
 * @returns true si la fecha está en la semana actual
 */
export function isCurrentWeek(date: Date): boolean {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(weekStart);
  
  return date >= weekStart && date <= weekEnd;
}
