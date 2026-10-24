import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';
import { Clinic, Booking, Service, Availability, Block, ACTIVE_STATUSES } from '../models/index.js';
import { cancelBooking } from '../lib/bookings.js';
import { DEMO_MODE } from '../lib/payments.js';
import { UPLOADS_ENABLED, logoUpload, uploadLogo, deleteLogo } from '../lib/upload.js';
import { validateClinicSettings, validateService, validateAvailability, validateBlock } from '../lib/validate.js';

const router = Router();
const SECRET = process.env.JWT_SECRET ?? 'cambia-esto-en-produccion';

router.post('/login', async (req, res) => {
  const { slug, password } = req.body ?? {};
  const clinic = await Clinic.findOne({ slug });
  if (!clinic || !(await bcrypt.compare(String(password ?? ''), clinic.adminPasswordHash))) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = jwt.sign({ clinicId: String(clinic._id) }, SECRET, { expiresIn: '7d' });
  res.json({ token, clinic: { name: clinic.name, slug: clinic.slug } });
});

async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    const { clinicId } = jwt.verify(token, SECRET);
    req.clinic = await Clinic.findById(clinicId);
    if (!req.clinic) throw new Error('sin clínica');
    next();
  } catch {
    res.status(401).json({ error: 'No autorizado' });
  }
}

router.use(auth);

/** Citas desde hoy (o desde ?from=2026-10-30) en adelante. */
router.get('/bookings', async (req, res) => {
  const { clinic } = req;
  const from = req.query.from
    ? DateTime.fromISO(String(req.query.from), { zone: clinic.timezone }).startOf('day')
    : DateTime.now().setZone(clinic.timezone).startOf('day');

  const bookings = await Booking.find({
    clinicId: clinic._id,
    start: { $gte: from.toUTC().toJSDate() },
    status: { $ne: 'expirada' },
  }).sort({ start: 1 });

  const services = await Service.find({ clinicId: clinic._id });
  const names = Object.fromEntries(services.map((s) => [String(s._id), s.name]));

  res.json(
    bookings.map((b) => ({
      id: b._id,
      start: b.start,
      end: b.end,
      service: names[String(b.serviceId)] ?? '—',
      patient: b.patient,
      status: b.status,
      depositCents: b.depositCents,
      // "Vino / No vino" solo tiene sentido cuando la cita ya ha empezado (en modo demo siempre, para poder probar).
      canMark: DEMO_MODE || b.start.getTime() <= Date.now(),
    }))
  );
});

/** Marcar el resultado de una cita: vino / no vino. */
router.post('/bookings/:id/status', async (req, res) => {
  const { status } = req.body ?? {};
  if (!['completada', 'no_show'].includes(status)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }
  const filter = { _id: req.params.id, clinicId: req.clinic._id, status: 'confirmada' };
  if (!DEMO_MODE) filter.start = { $lte: new Date() };
  const booking = await Booking.findOneAndUpdate(filter, { $set: { status } }, { new: true });
  if (!booking) return res.status(404).json({ error: 'Cita no encontrada, no confirmada o aún no ha empezado' });
  res.json({ ok: true, status: booking.status });
});

/** La clínica cancela una cita: siempre se devuelve la señal (la culpa no es del paciente). */
router.post('/bookings/:id/cancel', async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, clinicId: req.clinic._id });
  if (!booking) return res.status(404).json({ error: 'Cita no encontrada' });
  // Truco: la política de antelación no aplica cuando cancela la clínica.
  const result = await cancelBooking(booking, { ...req.clinic.toObject(), cancelHours: 0 });
  res.status(result.ok ? 200 : 400).json(result);
});

// ---------------- Ajustes de la clínica ----------------

const serviceDto = (s) => ({
  id: s._id,
  name: s.name,
  durationMin: s.durationMin,
  priceCents: s.priceCents,
  depositCents: s.depositCents,
});

router.get('/settings', async (req, res) => {
  const { clinic } = req;
  const [services, windows] = await Promise.all([
    Service.find({ clinicId: clinic._id, active: true }).sort({ createdAt: 1 }),
    Availability.find({ clinicId: clinic._id }),
  ]);
  res.json({
    clinic: {
      name: clinic.name,
      slug: clinic.slug,
      color: clinic.color,
      cancelHours: clinic.cancelHours,
      logoUrl: clinic.logoUrl,
      showName: clinic.showName !== false,
      tagline: clinic.tagline,
      address: clinic.address,
      phone: clinic.phone,
      website: clinic.website,
    },
    uploadsEnabled: UPLOADS_ENABLED,
    services: services.map(serviceDto),
    availability: windows
      .map((w) => ({ weekday: w.weekday, start: w.start, end: w.end }))
      .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
  });
});

router.put('/settings/clinic', async (req, res) => {
  const v = validateClinicSettings(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  Object.assign(req.clinic, v.value);
  await req.clinic.save();
  res.json({ ok: true, ...v.value });
});

/** Subir o reemplazar el logo (multipart, campo "logo"). */
router.post(
  '/settings/logo',
  (_req, res, next) =>
    UPLOADS_ENABLED
      ? next()
      : res.status(503).json({ error: 'La subida de imágenes no está configurada (falta CLOUDINARY_URL en el servidor).' }),
  logoUpload,
  async (req, res) => {
    try {
      const { url, publicId } = await uploadLogo(req.file.buffer, req.clinic._id);
      req.clinic.logoUrl = url;
      req.clinic.logoPublicId = publicId;
      await req.clinic.save();
      res.json({ ok: true, logoUrl: url });
    } catch (err) {
      console.error('Error subiendo el logo:', err.message);
      res.status(502).json({ error: 'No se pudo subir el logo. Inténtalo de nuevo.' });
    }
  }
);

router.delete('/settings/logo', async (req, res) => {
  const { clinic } = req;
  try {
    if (UPLOADS_ENABLED) await deleteLogo(clinic.logoPublicId);
  } catch (err) {
    console.error('Error borrando el logo en Cloudinary:', err.message); // seguimos: lo importante es quitarlo de la página
  }
  clinic.logoUrl = null;
  clinic.logoPublicId = null;
  await clinic.save();
  res.json({ ok: true });
});

router.post('/services', async (req, res) => {
  const v = validateService(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const service = await Service.create({ clinicId: req.clinic._id, ...v.value });
  res.status(201).json(serviceDto(service));
});

router.put('/services/:id', async (req, res) => {
  const v = validateService(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  // Las citas ya hechas conservan su señal (se guarda en cada Booking), así que editar es seguro.
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, clinicId: req.clinic._id, active: true },
    { $set: v.value },
    { new: true }
  );
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });
  res.json(serviceDto(service));
});

/** No se borra de verdad: las citas antiguas lo referencian. Se oculta a los pacientes. */
router.delete('/services/:id', async (req, res) => {
  const service = await Service.findOneAndUpdate(
    { _id: req.params.id, clinicId: req.clinic._id, active: true },
    { $set: { active: false } }
  );
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });
  res.json({ ok: true });
});

/** Sustituye el horario semanal completo. */
router.put('/availability', async (req, res) => {
  const v = validateAvailability(req.body?.windows);
  if (!v.ok) return res.status(400).json({ error: v.error });
  await Availability.deleteMany({ clinicId: req.clinic._id });
  if (v.value.length) {
    await Availability.insertMany(v.value.map((w) => ({ clinicId: req.clinic._id, ...w })));
  }
  res.json({ ok: true, windows: v.value });
});

/** Bloqueos futuros de agenda. */
router.get('/blocks', async (req, res) => {
  const blocks = await Block.find({ clinicId: req.clinic._id, end: { $gt: new Date() } }).sort({ start: 1 });
  res.json(blocks.map((b) => ({ id: b._id, start: b.start, end: b.end, note: b.note })));
});

router.post('/blocks', async (req, res) => {
  const v = validateBlock(req.body, req.clinic.timezone);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const conflicts = await Booking.countDocuments({
    clinicId: req.clinic._id,
    status: { $in: ACTIVE_STATUSES },
    start: { $lt: v.value.end },
    end: { $gt: v.value.start },
  });
  const b = await Block.create({ clinicId: req.clinic._id, ...v.value });
  // Las citas ya reservadas no se cancelan solas: se avisa para que la clínica decida.
  res.status(201).json({ id: b._id, start: b.start, end: b.end, note: b.note, conflicts });
});

router.delete('/blocks/:id', async (req, res) => {
  await Block.deleteOne({ _id: req.params.id, clinicId: req.clinic._id });
  res.json({ ok: true });
});

export default router;

