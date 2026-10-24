import { DateTime } from 'luxon';
import { Booking, Clinic, Service } from '../models/index.js';
import { refundDeposit } from './payments.js';
import { notifyClinic } from './notify.js';
import { sendMail } from './mailer.js';
import { buildIcs } from './ics.js';
import { bookingConfirmationEmail } from './emails.js';

export const HOLD_MINUTES = 30;

/** Libera los huecos de reservas que nunca se pagaron. */
export async function expireStaleHolds() {
  await Booking.updateMany(
    { status: 'pendiente_pago', holdExpiresAt: { $lt: new Date() } },
    { $set: { status: 'expirada' } }
  );
}

/** Pasa una reserva a confirmada. Idempotente: Stripe puede repetir el webhook. */
export async function confirmBooking(bookingId, paymentIntentId = null) {
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: { $in: ['pendiente_pago', 'expirada'] } },
    { $set: { status: 'confirmada', stripePaymentIntentId: paymentIntentId, holdExpiresAt: null } },
    { new: true }
  );
  if (booking) {
    const [clinic, service] = await Promise.all([Clinic.findById(booking.clinicId), Service.findById(booking.serviceId)]);
    // Sin await: el envío de emails no debe retrasar la respuesta al webhook de Stripe.
    Promise.allSettled([
      notifyClinic(
        clinic,
        'Nueva cita confirmada',
        `${booking.patient.name} (${booking.patient.phone}) · ${service?.name ?? ''} · ${fmt(booking.start, clinic.timezone)}`
      ),
      sendPatientConfirmation(clinic, service, booking),
    ]).then((results) => {
      // Un fallo de email nunca debe romper la confirmación (ni hacer que Stripe reintente el webhook).
      for (const r of results) if (r.status === 'rejected') console.error('Error enviando aviso:', r.reason?.message ?? r.reason);
    });
  }
  return booking;
}

/** Email al paciente con los detalles, el enlace para gestionar la cita y el evento de calendario. */
export async function sendPatientConfirmation(clinic, service, booking) {
  if (!booking.patient.email || !service) return;
  const manageUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/c/${clinic.slug}/cita/${booking.cancelToken}`;
  const { subject, text, html } = bookingConfirmationEmail({ clinic, service, booking, manageUrl });
  const ics = buildIcs({
    uid: `${booking._id}@reservas-clinica`,
    start: booking.start,
    end: booking.end,
    summary: `${service.name} · ${clinic.name}`,
    location: clinic.address,
    description: `Gestiona tu cita: ${manageUrl}`,
  });
  await sendMail({
    to: booking.patient.email,
    subject,
    text,
    html,
    attachments: [{ filename: 'cita.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }],
  });
}

/**
 * Cancela una cita aplicando la política de la clínica.
 * - Con antelación suficiente: se devuelve la señal.
 * - Tarde: la clínica se queda la señal y se le avisa (aquí engancharías la lista de espera).
 */
export async function cancelBooking(booking, clinic) {
  if (!['confirmada', 'pendiente_pago'].includes(booking.status)) {
    return { ok: false, reason: 'La cita ya no se puede cancelar.' };
  }
  const hoursLeft = (booking.start.getTime() - Date.now()) / 36e5;
  const inTime = hoursLeft >= clinic.cancelHours;

  if (booking.status === 'pendiente_pago') {
    booking.status = 'cancelada';
  } else if (inTime) {
    await refundDeposit(clinic, booking.stripePaymentIntentId);
    booking.status = 'cancelada';
  } else {
    booking.status = 'cancelada_tarde';
  }
  await booking.save();

  if (booking.status === 'cancelada_tarde') {
    await notifyClinic(
      clinic,
      'Cancelación tardía: hueco libre',
      `${booking.patient.name} canceló ${fmt(booking.start, clinic.timezone)}. Te quedas la señal.`
    );
  }
  return { ok: true, status: booking.status, refunded: booking.status === 'cancelada' };
}

export function fmt(date, zone) {
  return DateTime.fromJSDate(date, { zone }).setLocale('es').toFormat("cccc d LLL, HH:mm");
}
