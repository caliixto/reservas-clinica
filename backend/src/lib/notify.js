import { sendMail } from './mailer.js';

/**
 * Aviso a la clínica (por email a la dirección de la clínica).
 * Nunca debe romper el flujo de reservas: si el envío falla, solo se registra el error.
 * Más adelante: WhatsApp Business API para avisar a la lista de espera.
 */
export async function notifyClinic(clinic, subject, body) {
  try {
    await sendMail({ to: clinic.email, subject, text: body });
  } catch (err) {
    console.error(`No se pudo avisar a la clínica (${clinic.email}):`, err.message);
  }
}
