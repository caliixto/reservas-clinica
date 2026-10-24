import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Clinic, Service, Availability, Booking } from './models/index.js';

/**
 * Crea clínicas de ejemplo. Es seguro ejecutarlo varias veces: solo crea las que no existen.
 * Para borrar TODO y empezar de cero:  npm run seed -- --reset
 *
 * Una vez creada la clínica, servicios, precios, señal y horarios se editan desde el panel (pestaña Ajustes).
 */
const RESET = process.argv.includes('--reset');

// Edita esta lista para dar de alta clínicas. Los servicios son ORIENTATIVOS: cámbialos en Ajustes.
const CLINICS = [
  {
    name: 'Clínica Demo Fisio',
    slug: 'demo-fisio',
    email: 'demo@example.com',
    password: 'demo1234',
    color: '#0f766e',
    services: [
      { name: 'Fisioterapia (50 min)', durationMin: 50, priceCents: 5000, depositCents: 1000 },
      { name: 'Masaje deportivo (30 min)', durationMin: 30, priceCents: 3500, depositCents: 1000 },
      { name: 'Consulta de nutrición (45 min)', durationMin: 45, priceCents: 4000, depositCents: 1000 },
    ],
  },
  {
    name: 'AMP FISIO',
    slug: 'amp-fisio',
    email: 'cambia-este-email@example.com',
    password: process.env.AMP_PASSWORD ?? 'amp1234', // cámbiala antes de dársela a Álvaro
    color: '#0f766e', // pon aquí el color de su marca
    services: [
      // Precios y duraciones de EJEMPLO: no son los reales de AMP FISIO. Ajústalos desde el panel.
      { name: 'Sesión de fisioterapia', durationMin: 45, priceCents: 4000, depositCents: 1000 },
      { name: 'Consulta de nutrición', durationMin: 45, priceCents: 4000, depositCents: 1000 },
    ],
  },
];

await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/reservas-clinica');

if (RESET) {
  await Promise.all([Clinic.deleteMany({}), Service.deleteMany({}), Availability.deleteMany({}), Booking.deleteMany({})]);
  console.log('Base de datos vaciada (--reset).');
}

for (const c of CLINICS) {
  if (await Clinic.findOne({ slug: c.slug })) {
    console.log(`Ya existe: ${c.slug} (no se toca)`);
    continue;
  }
  const clinic = await Clinic.create({
    name: c.name,
    slug: c.slug,
    email: c.email,
    adminPasswordHash: await bcrypt.hash(c.password, 10),
    color: c.color,
    cancelHours: 24,
  });
  await Service.create(c.services.map((s) => ({ ...s, clinicId: clinic._id })));

  // Lunes a viernes: mañana y tarde
  const windows = [];
  for (let weekday = 1; weekday <= 5; weekday++) {
    windows.push({ clinicId: clinic._id, weekday, start: '10:00', end: '14:00' });
    windows.push({ clinicId: clinic._id, weekday, start: '16:00', end: '20:00' });
  }
  await Availability.create(windows);

  console.log(`Creada: ${c.slug}`);
  console.log(`   Reservas: /c/${c.slug}`);
  console.log(`   Panel:    /panel  (clínica: ${c.slug} · contraseña: ${c.password})`);
}

await mongoose.disconnect();
