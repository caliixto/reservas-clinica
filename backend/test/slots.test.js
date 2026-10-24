import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { computeSlotGrid } from '../src/lib/slots.js';
import { validateBlock } from '../src/lib/validate.js';

const Z = 'Europe/Madrid';
const day = DateTime.fromISO('2026-11-03', { zone: Z }); // martes
const now = DateTime.fromISO('2026-11-01T08:00', { zone: Z });
const at = (h, m = 0) => day.set({ hour: h, minute: m }).toJSDate();

test('rejilla: marca ocupados las citas y bloqueos, el resto libres', () => {
  const grid = computeSlotGrid({
    day, now, durationMin: 60,
    windows: [{ start: '10:00', end: '13:00' }],
    busy: [{ start: at(11), end: at(12) }],
  });
  const view = grid.map((s) => [DateTime.fromISO(s.start).setZone(Z).toFormat('HH:mm'), s.free]);
  assert.deepEqual(view, [['10:00', true], ['10:30', false], ['11:00', false], ['11:30', false], ['12:00', true]]);
});

test('rejilla: un bloqueo de todo el día deja todo ocupado', () => {
  const grid = computeSlotGrid({
    day, now, durationMin: 30,
    windows: [{ start: '10:00', end: '12:00' }],
    busy: [{ start: day.startOf('day').toJSDate(), end: day.endOf('day').toJSDate() }],
  });
  assert.equal(grid.length, 4);
  assert.ok(grid.every((s) => !s.free));
});

test('rejilla: huecos pasados o con menos de 1 h de antelación no aparecen', () => {
  const grid = computeSlotGrid({
    day, durationMin: 30, windows: [{ start: '10:00', end: '12:00' }], busy: [],
    now: day.set({ hour: 10, minute: 15 }),
  });
  const first = DateTime.fromISO(grid[0].start).setZone(Z).toFormat('HH:mm');
  assert.equal(first, '11:30');
});

test('validateBlock: horas parciales y día completo', () => {
  const ok = validateBlock({ date: '2026-11-03', from: '14:00', to: '16:00', note: 'Médico' }, Z, now);
  assert.ok(ok.ok);
  assert.equal(DateTime.fromJSDate(ok.value.start).setZone(Z).toFormat('HH:mm'), '14:00');
  const all = validateBlock({ date: '2026-11-03', allDay: true }, Z, now);
  assert.ok(all.ok);
  assert.equal(all.value.end - all.value.start, 24 * 36e5);
});

test('validateBlock: rechaza fechas/horas inválidas, pasadas y notas largas', () => {
  assert.equal(validateBlock({ date: 'mañana', allDay: true }, Z, now).ok, false);
  assert.equal(validateBlock({ date: '2026-11-03', from: '16:00', to: '14:00' }, Z, now).ok, false);
  assert.equal(validateBlock({ date: '2026-10-01', allDay: true }, Z, now).ok, false);
  assert.equal(validateBlock({ date: '2026-11-03', allDay: true, note: 'x'.repeat(81) }, Z, now).ok, false);
});
