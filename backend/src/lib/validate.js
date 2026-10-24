/** Validaciones de los ajustes que edita la clínica. Devuelven { ok, value } o { ok:false, error }. */
import { DateTime } from 'luxon';

const MIN_DEPOSIT_CENTS = 50; // Stripe no admite cobros de menos de 0,50 €
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const PHONE_RE = /^\+?[0-9 ()-]{6,20}$/;

const fail = (error) => ({ ok: false, error });

export const isEmail = (v) => typeof v === 'string' && v.length <= 120 && EMAIL_RE.test(v.trim());

export function validateClinicSettings(input = {}) {
  const name = String(input.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return fail('El nombre debe tener entre 2 y 80 caracteres.');

  const color = String(input.color ?? '');
  if (!COLOR_RE.test(color)) return fail('El color debe tener formato #RRGGBB.');

  const cancelHours = Number(input.cancelHours);
  if (!Number.isInteger(cancelHours) || cancelHours < 0 || cancelHours > 168) {
    return fail('El plazo de cancelación debe ser un número entero de horas entre 0 y 168.');
  }

  const tagline = String(input.tagline ?? '').trim();
  if (tagline.length > 90) return fail('La frase de presentación no puede pasar de 90 caracteres.');

  const address = String(input.address ?? '').trim();
  if (address.length > 120) return fail('La dirección no puede pasar de 120 caracteres.');

  const phone = String(input.phone ?? '').trim();
  if (phone && !PHONE_RE.test(phone)) return fail('El teléfono solo puede tener números, espacios, + ( ) y guiones.');

  const showName = input.showName !== false;

  const website = String(input.website ?? '').trim();
  if (website && (website.length > 200 || !URL_RE.test(website))) {
    return fail('La web debe empezar por http:// o https:// (por ejemplo https://ampfisio.es).');
  }

  return { ok: true, value: { name, color, cancelHours, tagline, address, phone, showName, website } };
}

export function validateService(input = {}) {
  const name = String(input.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return fail('El nombre del servicio debe tener entre 2 y 80 caracteres.');

  const durationMin = Number(input.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 10 || durationMin > 240) {
    return fail('La duración debe ser un número entero de minutos entre 10 y 240.');
  }
  const priceCents = Number(input.priceCents);
  if (!Number.isInteger(priceCents) || priceCents <= 0 || priceCents > 100_000) {
    return fail('El precio no es válido.');
  }
  const depositCents = Number(input.depositCents);
  if (!Number.isInteger(depositCents) || depositCents < MIN_DEPOSIT_CENTS) {
    return fail('La señal mínima es de 0,50 €.');
  }
  if (depositCents > priceCents) return fail('La señal no puede ser mayor que el precio.');

  return { ok: true, value: { name, durationMin, priceCents, depositCents } };
}

export function validateAvailability(windows) {
  if (!Array.isArray(windows) || windows.length > 70) return fail('Horario no válido.');
  const clean = [];
  for (const w of windows) {
    const weekday = Number(w?.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return fail('Día de la semana no válido.');
    if (!TIME_RE.test(w?.start ?? '') || !TIME_RE.test(w?.end ?? '')) return fail('Las horas deben tener formato HH:MM.');
    if (w.start >= w.end) return fail('La hora de inicio debe ser anterior a la de fin.');
    clean.push({ weekday, start: w.start, end: w.end });
  }
  // Tramos solapados el mismo día generarían huecos duplicados.
  for (let day = 1; day <= 7; day++) {
    const list = clean.filter((w) => w.weekday === day).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < list.length; i++) {
      if (list[i].start < list[i - 1].end) return fail('Hay tramos horarios que se solapan el mismo día.');
    }
  }
  return { ok: true, value: clean };
}

/** Bloqueo de agenda: día + (todo el día | desde–hasta) + nota. Devuelve fechas UTC. */
export function validateBlock(input = {}, timezone = 'Europe/Madrid', now = DateTime.now()) {
  const date = String(input.date ?? '');
  const day = DateTime.fromISO(date, { zone: timezone });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day.isValid) return fail('Elige un día válido.');

  let start;
  let end;
  if (input.allDay) {
    start = day.startOf('day');
    end = day.plus({ days: 1 }).startOf('day');
  } else {
    if (!TIME_RE.test(input.from ?? '') || !TIME_RE.test(input.to ?? '')) return fail('Las horas deben tener formato HH:MM.');
    if (input.from >= input.to) return fail('La hora de inicio debe ser anterior a la de fin.');
    const [fh, fm] = input.from.split(':').map(Number);
    const [th, tm] = input.to.split(':').map(Number);
    start = day.set({ hour: fh, minute: fm });
    end = day.set({ hour: th, minute: tm });
  }
  if (end <= now) return fail('Ese bloqueo ya ha pasado.');

  const note = String(input.note ?? '').trim();
  if (note.length > 80) return fail('La nota no puede pasar de 80 caracteres.');

  return { ok: true, value: { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate(), note } };
}
