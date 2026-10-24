import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Estados en los que una cita ocupa el hueco. */
export const ACTIVE_STATUSES = ['pendiente_pago', 'confirmada'];

const clinicSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true },
    adminPasswordHash: { type: String, required: true },
    color: { type: String, default: '#0f766e' },
    // Marca visible en la página de reservas
    logoUrl: { type: String, default: null },
    logoPublicId: { type: String, default: null },
    showName: { type: Boolean, default: true }, // mostrar el nombre junto al logo
    tagline: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    website: { type: String, default: '' }, // web de la clínica, para el botón "Volver a la web"
    timezone: { type: String, default: 'Europe/Madrid' },
    // Política de cancelación: horas mínimas de antelación para recuperar la señal.
    cancelHours: { type: Number, default: 24 },
    // Si la clínica conecta su propia cuenta de Stripe (Connect), el dinero va directo a ella.
    stripeAccountId: { type: String, default: null },
  },
  { timestamps: true }
);

const serviceSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    name: { type: String, required: true },
    durationMin: { type: Number, required: true },
    priceCents: { type: Number, required: true },
    depositCents: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const availabilitySchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  // 1 = lunes ... 7 = domingo (formato luxon)
  weekday: { type: Number, min: 1, max: 7, required: true },
  start: { type: String, required: true }, // "10:00"
  end: { type: String, required: true }, // "14:00"
});

/** Bloqueo puntual de la agenda (vacaciones, comida, cita médica...). */
const blockSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  note: { type: String, default: '' },
});

const bookingSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    patient: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: [
        'pendiente_pago',
        'confirmada',
        'completada',
        'no_show', // no vino: la clínica se queda la señal
        'cancelada', // canceló a tiempo: señal devuelta
        'cancelada_tarde', // canceló tarde: la clínica se queda la señal
        'expirada', // no pagó a tiempo
      ],
      default: 'pendiente_pago',
    },
    depositCents: { type: Number, required: true },
    stripeSessionId: { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null },
    // Enlace que recibe el paciente para cancelar sin tener cuenta.
    cancelToken: { type: String, required: true, unique: true },
    holdExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Protege contra dobles reservas del mismo hueco (condición de carrera):
// dos reservas activas no pueden empezar a la vez en la misma clínica.
bookingSchema.index(
  { clinicId: 1, start: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ACTIVE_STATUSES } } }
);

export const Clinic = mongoose.model('Clinic', clinicSchema);
export const Service = mongoose.model('Service', serviceSchema);
export const Availability = mongoose.model('Availability', availabilitySchema);
export const Block = mongoose.model('Block', blockSchema);
export const Booking = mongoose.model('Booking', bookingSchema);
