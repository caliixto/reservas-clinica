import { DateTime } from 'luxon';
import { Availability, Block, Booking, ACTIVE_STATUSES } from '../models/index.js';

const SLOT_STEP_MIN = 30; // los huecos empiezan cada 30 min
const MIN_NOTICE_MIN = 60; // no se puede reservar con menos de 1h de antelación

/**
 * Lógica pura (sin base de datos): rejilla de huecos de un día.
 * Devuelve cada hueco con `free`. Los huecos pasados o con poca antelación no se incluyen.
 * @param {{day: DateTime, windows: {start:string,end:string}[], durationMin: number,
 *          busy: {start: Date, end: Date}[], now?: DateTime}} p
 * @returns {{start: string, free: boolean}[]}
 */
export function computeSlotGrid({ day, windows, durationMin, busy, now = DateTime.now() }) {
  const earliest = now.plus({ minutes: MIN_NOTICE_MIN });
  const grid = [];
  for (const w of windows) {
    const [sh, sm] = w.start.split(':').map(Number);
    const [eh, em] = w.end.split(':').map(Number);
    const windowEnd = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    let cursor = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    while (cursor.plus({ minutes: durationMin }) <= windowEnd) {
      const slotEnd = cursor.plus({ minutes: durationMin });
      if (cursor >= earliest) {
        const taken = busy.some((b) => cursor.toMillis() < b.end.getTime() && slotEnd.toMillis() > b.start.getTime());
        grid.push({ start: cursor.toUTC().toISO(), free: !taken });
      }
      cursor = cursor.plus({ minutes: SLOT_STEP_MIN });
    }
  }
  return grid.sort((a, b) => a.start.localeCompare(b.start));
}

/** Rejilla completa (libres y ocupados) de una clínica para un día "2026-10-30" en su zona horaria. */
export async function getSlotGrid(clinic, service, dateISO) {
  const day = DateTime.fromISO(dateISO, { zone: clinic.timezone });
  if (!day.isValid) return [];

  const windows = await Availability.find({ clinicId: clinic._id, weekday: day.weekday });
  if (windows.length === 0) return [];

  const dayStart = day.startOf('day').toUTC().toJSDate();
  const dayEnd = day.endOf('day').toUTC().toJSDate();
  const overlap = { start: { $lt: dayEnd }, end: { $gt: dayStart } };

  const [bookings, blocks] = await Promise.all([
    Booking.find({ clinicId: clinic._id, status: { $in: ACTIVE_STATUSES }, ...overlap }),
    Block.find({ clinicId: clinic._id, ...overlap }),
  ]);

  return computeSlotGrid({ day, windows, durationMin: service.durationMin, busy: [...bookings, ...blocks] });
}

/** Solo los inicios libres, en ISO UTC. */
export async function getFreeSlots(clinic, service, dateISO) {
  return (await getSlotGrid(clinic, service, dateISO)).filter((s) => s.free).map((s) => s.start);
}

/** Comprueba que un inicio concreto es un hueco válido (para evitar manipular el cliente). */
export async function isSlotFree(clinic, service, startISO) {
  const start = DateTime.fromISO(startISO, { zone: 'utc' });
  if (!start.isValid) return false;
  const dateISO = start.setZone(clinic.timezone).toISODate();
  const free = await getFreeSlots(clinic, service, dateISO);
  return free.includes(start.toUTC().toISO());
}
