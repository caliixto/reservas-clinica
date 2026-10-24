import { Router } from 'express';
import crypto from 'node:crypto';
import { DateTime } from 'luxon';
import { Clinic, Service, Booking } from '../models/index.js';
import { getSlotGrid, isSlotFree } from '../lib/slots.js';
import { createDepositCheckout, DEMO_MODE } from '../lib/payments.js';
import { buildIcs } from '../lib/ics.js';
import { isEmail } from '../lib/validate.js';
import { cancelBooking, confirmBooking, expireStaleHolds, HOLD_MINUTES } from '../lib/bookings.js';

const router = Router();

/** a***@gmail.com: confirma al paciente dónde se envió el email sin exponerlo entero. */
function maskEmail(e = '') {
  const [user, domain] = e.split('@');
  return user && domain ? `${user[0]}***@${domain}` : '';
}

async function loadClinic(req, res, next) {
  const clinic = await Clinic.findOne({ slug: req.params.slug });
  if (!clinic) return res.status(404).json({ error: 'Clínica no encontrada' });
  req.clinic = clinic;
  next();
}

/** Datos para pintar la página de reservas de una clínica. */
router.get('/clinics/:slug', loadClinic, async (req, res) => {
  const { clinic } = req;
  const services = await Service.find({ clinicId: clinic._id, active: true });
  res.json({
    name: clinic.name,
    slug: clinic.slug,
    color: clinic.color,
    logoUrl: clinic.logoUrl,
    showName: clinic.showName !== false,
    tagline: clinic.tagline,
    address: clinic.address,
    phone: clinic.phone,
    website: clinic.website,
    cancelHours: clinic.cancelHours,
    demoMode: DEMO_MODE,
    services: services.map((s) => ({
      id: s._id,
      name: s.name,
      durationMin: s.durationMin,
      priceCents: s.priceCents,
      depositCents: s.depositCents,
    })),
  });
});

/** Huecos libres: /clinics/amp-fisio/slots?serviceId=...&date=2026-10-30 */
router.get('/clinics/:slug/slots', loadClinic, async (req, res) => {
  await expireStaleHolds();
  const service = await Service.findOne({ _id: req.query.serviceId, clinicId: req.clinic._id });
  if (!service) return res.status(400).json({ error: 'Servicio no válido' });
  const grid = await getSlotGrid(req.clinic, service, String(req.query.date));
  // slots = libres; taken = ocupados (ya reservados o bloqueados por la clínica), para mostrarlos en gris.
  res.json({ slots: grid.filter((s) => s.free).map((s) => s.start), taken: grid.filter((s) => !s.free).map((s) => s.start) });
});

/** Crea la reserva (pendiente de pago) y devuelve dónde pagar la señal. */
router.post('/clinics/:slug/bookings', loadClinic, async (req, res) => {
  const { clinic } = req;
  const { serviceId, start, patient } = req.body ?? {};

  if (!patient?.name?.trim() || !patient?.phone?.trim()) {
    return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
  }
  if (!isEmail(patient.email)) {
    return res.status(400).json({ error: 'Escribe un email válido: te enviaremos la confirmación y el enlace para gestionar tu cita.' });
  }
  const service = await Service.findOne({ _id: serviceId, clinicId: clinic._id, active: true });
  if (!service) return res.status(400).json({ error: 'Servicio no válido' });

  await expireStaleHolds();
  if (!(await isSlotFree(clinic, service, start))) {
    return res.status(409).json({ error: 'Esa hora acaba de ocuparse. Elige otra.' });
  }

  const startDate = DateTime.fromISO(start, { zone: 'utc' });
  let booking;
  try {
    booking = await Booking.create({
      clinicId: clinic._id,
      serviceId: service._id,
      start: startDate.toJSDate(),
      end: startDate.plus({ minutes: service.durationMin }).toJSDate(),
      patient: {
        name: patient.name.trim(),
        phone: patient.phone.trim(),
        email: patient.email.trim().toLowerCase(),
      },
      depositCents: service.depositCents,
      cancelToken: crypto.randomBytes(24).toString('hex'),
      holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
    });
  } catch (err) {
    // El índice único salta si dos personas pillan el mismo hueco a la vez.
    if (err.code === 11000) return res.status(409).json({ error: 'Esa hora acaba de ocuparse. Elige otra.' });
    throw err;
  }

  if (DEMO_MODE) {
    return res.status(201).json({ bookingId: booking._id, cancelToken: booking.cancelToken, demo: true });
  }

  const origin = process.env.FRONTEND_URL ?? 'http://localhost:4200';
  let session;
  try {
    session = await createDepositCheckout({
      clinic,
      service,
      booking,
      successUrl: `${origin}/c/${clinic.slug}/cita/${booking.cancelToken}?pago=ok`,
      cancelUrl: `${origin}/c/${clinic.slug}?pago=cancelado`,
    });
    booking.stripeSessionId = session.id;
    await booking.save();
  } catch (err) {
    // Si no se pudo abrir el pago, el hueco no debe quedar retenido 30 min.
    console.error('Error creando el pago en Stripe:', err.message);
    await Booking.updateOne({ _id: booking._id }, { $set: { status: 'expirada' } });
    return res.status(502).json({ error: 'No hemos podido iniciar el pago. Inténtalo de nuevo en unos minutos; no se ha cobrado nada.' });
  }
  res.status(201).json({ bookingId: booking._id, cancelToken: booking.cancelToken, checkoutUrl: session.url });
});

/** Solo modo demo: simula que el pago de la señal se ha completado. */
router.post('/bookings/:token/demo-pay', async (req, res) => {
  if (!DEMO_MODE) return res.status(404).end();
  const booking = await Booking.findOne({ cancelToken: req.params.token });
  if (!booking) return res.status(404).json({ error: 'Cita no encontrada' });
  await confirmBooking(booking._id, 'demo_pi');
  res.json({ ok: true });
});

/** Ver una cita con el enlace privado (el que recibe el paciente). */
router.get('/bookings/:token', async (req, res) => {
  const booking = await Booking.findOne({ cancelToken: req.params.token });
  if (!booking) return res.status(404).json({ error: 'Cita no encontrada' });
  const [clinic, service] = await Promise.all([
    Clinic.findById(booking.clinicId),
    Service.findById(booking.serviceId),
  ]);
  const hoursLeft = (booking.start.getTime() - Date.now()) / 36e5;
  res.json({
    clinic: clinic.name,
    service: service.name,
    start: booking.start,
    status: booking.status,
    depositCents: booking.depositCents,
    cancelHours: clinic.cancelHours,
    freeCancellation: hoursLeft >= clinic.cancelHours,
    emailHint: maskEmail(booking.patient.email),
  });
});

/** Descarga la cita como evento de calendario (.ics). Solo para citas confirmadas. */
router.get('/bookings/:token/calendar.ics', async (req, res) => {
  const booking = await Booking.findOne({ cancelToken: req.params.token });
  if (!booking || booking.status !== 'confirmada') return res.status(404).json({ error: 'Cita no encontrada' });
  const [clinic, service] = await Promise.all([Clinic.findById(booking.clinicId), Service.findById(booking.serviceId)]);
  const manageUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/c/${clinic.slug}/cita/${booking.cancelToken}`;
  const ics = buildIcs({
    uid: `${booking._id}@reservas-clinica`,
    start: booking.start,
    end: booking.end,
    summary: `${service?.name ?? 'Cita'} · ${clinic.name}`,
    location: clinic.address,
    description: `Gestiona tu cita: ${manageUrl}`,
  });
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="cita.ics"' });
  res.send(ics);
});

/** Cancelar con el enlace privado. */
router.post('/bookings/:token/cancel', async (req, res) => {
  const booking = await Booking.findOne({ cancelToken: req.params.token });
  if (!booking) return res.status(404).json({ error: 'Cita no encontrada' });
  const clinic = await Clinic.findById(booking.clinicId);
  const result = await cancelBooking(booking, clinic);
  res.status(result.ok ? 200 : 400).json(result);
});

export default router;
