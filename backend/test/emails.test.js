import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from '../src/lib/ics.js';
import { bookingConfirmationEmail, esc } from '../src/lib/emails.js';
import { sendMail, setTransport } from '../src/lib/mailer.js';

const clinic = {
  name: 'AMP <FISIO> & Cía',
  color: '#1d4ed8',
  timezone: 'Europe/Madrid',
  address: 'Calle Mayor 1, Madrid',
  phone: '+34 655 12 08 77',
  cancelHours: 24,
  logoUrl: 'https://res.cloudinary.com/x/logo.png',
};
const service = { name: 'Sesión de fisioterapia', priceCents: 4000 };
const booking = {
  patient: { name: '<script>alert(1)</script> Ana', phone: '600', email: 'ana@gmail.com' },
  start: new Date('2026-10-30T09:30:00Z'), // 10:30 en Madrid (CET)
  end: new Date('2026-10-30T10:15:00Z'),
  depositCents: 1000,
};

test('esc neutraliza HTML', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('email de confirmación: contenido, hora local y enlace', () => {
  const { subject, text, html } = bookingConfirmationEmail({ clinic, service, booking, manageUrl: 'https://x.es/c/amp/cita/tok' });
  assert.match(subject, /Viernes 30 de octubre a las 10:30/);
  assert.match(text, /Señal pagada: 10,00/);
  assert.match(text, /En la clínica pagarás 30,00/);
  assert.match(text, /https:\/\/x\.es\/c\/amp\/cita\/tok/);
  assert.match(html, /Ver o cancelar mi cita/);
  assert.match(html, /logo\.png/);
});

test('email de confirmación: el texto del usuario va escapado en el HTML', () => {
  const { html } = bookingConfirmationEmail({ clinic, service, booking, manageUrl: 'https://x.es/c/amp/cita/tok' });
  assert.ok(!html.includes('<script>'), 'no debe haber <script> sin escapar');
  assert.ok(!html.includes('<FISIO>'), 'el nombre de la clínica debe ir escapado');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /AMP &lt;FISIO&gt; &amp; Cía/);
});

test('email de confirmación: logo http (no https) no se incrusta', () => {
  const { html } = bookingConfirmationEmail({
    clinic: { ...clinic, logoUrl: 'http://evil.example/logo.png' },
    service,
    booking,
    manageUrl: 'https://x.es/c/amp/cita/tok',
  });
  assert.ok(!html.includes('evil.example'));
});

test('ics: estructura, horas en UTC, escapes y saltos CRLF', () => {
  const ics = buildIcs({
    uid: 'abc@reservas',
    start: booking.start,
    end: booking.end,
    summary: 'Sesión, fisio; hoy',
    location: 'Calle Mayor 1, Madrid',
    description: 'Línea 1\nLínea 2',
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART:20261030T093000Z\r\n/);
  assert.match(ics, /DTEND:20261030T101500Z\r\n/);
  assert.match(ics, /SUMMARY:Sesión\\, fisio\\; hoy\r\n/);
  assert.match(ics, /DESCRIPTION:Línea 1\\nLínea 2\r\n/);
  assert.ok(!/[^\r]\n/.test(ics), 'todos los saltos de línea deben ser CRLF');
});

test('ics: las líneas largas se pliegan a 75 bytes', () => {
  const ics = buildIcs({ uid: 'u', start: booking.start, end: booking.end, summary: 'ñ'.repeat(120) });
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `línea de ${Buffer.byteLength(line)} bytes`);
});

test('sendMail usa el transporte configurado y adjunta lo que se le pasa', async () => {
  let sent;
  setTransport({ sendMail: async (m) => ((sent = m), { ok: true }) });
  await sendMail({ to: 'a@b.es', subject: 'Hola', text: 't', html: '<p>h</p>', attachments: [{ filename: 'cita.ics', content: 'x' }] });
  assert.equal(sent.to, 'a@b.es');
  assert.equal(sent.attachments[0].filename, 'cita.ics');
  setTransport(null);
});

test('sin transporte, sendMail no falla (modo simulado)', async () => {
  setTransport(null);
  const r = await sendMail({ to: 'a@b.es', subject: 'Hola', text: 'texto' });
  assert.equal(r.simulated, true);
});
