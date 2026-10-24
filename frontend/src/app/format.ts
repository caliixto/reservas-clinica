import { CLINIC_TZ } from './config';

export const euros = (cents: number) =>
  (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TZ });

export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: CLINIC_TZ,
  });

/** "2026-10-30" en la zona horaria de la clínica. */
export const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });

export const STATUS_LABEL: Record<string, string> = {
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  completada: 'Vino',
  no_show: 'No vino · señal retenida',
  cancelada: 'Cancelada · señal devuelta',
  cancelada_tarde: 'Cancelada tarde · señal retenida',
  expirada: 'Expirada',
};

/** Color de texto legible (blanco o casi negro) sobre el color de marca de la clínica. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.35 ? '#10201c' : '#ffffff';
}

/** Hora (0-23) de un instante en la zona horaria de la clínica. */
export const hourOf = (iso: string) => parseInt(timeLabel(iso).split(':')[0], 10);

/** Iniciales para el monograma (hasta 2 palabras). */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
