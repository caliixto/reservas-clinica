import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateClinicSettings, validateService, validateAvailability, isEmail } from '../src/lib/validate.js';

test('ajustes de clínica válidos', () => {
  const r = validateClinicSettings({ name: ' AMP FISIO ', color: '#0f766e', cancelHours: '24' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { name: 'AMP FISIO', color: '#0f766e', cancelHours: 24, tagline: '', address: '', phone: '', showName: true, website: '' });
});

test('ajustes de clínica inválidos', () => {
  assert.equal(validateClinicSettings({ name: 'A', color: '#0f766e', cancelHours: 24 }).ok, false);
  assert.equal(validateClinicSettings({ name: 'AMP', color: 'rojo', cancelHours: 24 }).ok, false);
  assert.equal(validateClinicSettings({ name: 'AMP', color: '#0f766e', cancelHours: -1 }).ok, false);
  assert.equal(validateClinicSettings({ name: 'AMP', color: '#0f766e', cancelHours: 2.5 }).ok, false);
});

test('servicio válido: la señal puede igualar al precio', () => {
  assert.equal(validateService({ name: 'Fisio', durationMin: 45, priceCents: 4000, depositCents: 1000 }).ok, true);
  assert.equal(validateService({ name: 'Fisio', durationMin: 45, priceCents: 1000, depositCents: 1000 }).ok, true);
});

test('servicio inválido', () => {
  const base = { name: 'Fisio', durationMin: 45, priceCents: 4000, depositCents: 1000 };
  assert.equal(validateService({ ...base, depositCents: 49 }).ok, false); // menos del mínimo de Stripe
  assert.equal(validateService({ ...base, depositCents: 5000 }).ok, false); // señal > precio
  assert.equal(validateService({ ...base, priceCents: 0 }).ok, false);
  assert.equal(validateService({ ...base, durationMin: 5 }).ok, false);
  assert.equal(validateService({ ...base, name: '' }).ok, false);
});

test('horarios válidos', () => {
  const r = validateAvailability([
    { weekday: 1, start: '10:00', end: '14:00' },
    { weekday: 1, start: '16:00', end: '20:00' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.value.length, 2);
  assert.equal(validateAvailability([]).ok, true); // sin horario = cerrado
});

test('horarios inválidos', () => {
  assert.equal(validateAvailability([{ weekday: 8, start: '10:00', end: '14:00' }]).ok, false);
  assert.equal(validateAvailability([{ weekday: 1, start: '10:00', end: '25:00' }]).ok, false);
  assert.equal(validateAvailability([{ weekday: 1, start: '14:00', end: '10:00' }]).ok, false);
  assert.equal(
    validateAvailability([
      { weekday: 2, start: '10:00', end: '14:00' },
      { weekday: 2, start: '13:00', end: '18:00' },
    ]).ok,
    false
  );
  assert.equal(validateAvailability('no').ok, false);
});

test('datos de marca: frase, dirección y teléfono', () => {
  const base = { name: 'AMP FISIO', color: '#0f766e', cancelHours: 24 };
  const ok = validateClinicSettings({ ...base, tagline: ' Fisio y nutrición ', address: 'Calle Mayor 1, Madrid', phone: '+34 655 12 08 77' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.tagline, 'Fisio y nutrición');
  assert.equal(validateClinicSettings({ ...base, phone: 'llámame' }).ok, false);
  assert.equal(validateClinicSettings({ ...base, tagline: 'x'.repeat(91) }).ok, false);
  assert.equal(validateClinicSettings({ ...base, address: 'x'.repeat(121) }).ok, false);
});

test('showName: por defecto true, solo false si se pide explícitamente', () => {
  const base = { name: 'AMP', color: '#0f766e', cancelHours: 24 };
  assert.equal(validateClinicSettings(base).value.showName, true);
  assert.equal(validateClinicSettings({ ...base, showName: false }).value.showName, false);
});

test('web de la clínica: vacía o http(s) válida', () => {
  const base = { name: 'AMP', color: '#0f766e', cancelHours: 24 };
  assert.equal(validateClinicSettings({ ...base, website: 'https://ampfisio.es' }).ok, true);
  assert.equal(validateClinicSettings({ ...base, website: '' }).ok, true);
  assert.equal(validateClinicSettings({ ...base, website: 'ampfisio.es' }).ok, false);
  assert.equal(validateClinicSettings({ ...base, website: 'javascript:alert(1)' }).ok, false);
});

test('isEmail', () => {
  assert.equal(isEmail('ana@gmail.com'), true);
  assert.equal(isEmail(' ana@gmail.com '), true);
  assert.equal(isEmail('ana@gmail'), false);
  assert.equal(isEmail('ana gmail.com'), false);
  assert.equal(isEmail(''), false);
  assert.equal(isEmail(undefined), false);
});
