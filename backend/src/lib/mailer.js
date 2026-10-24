import nodemailer from 'nodemailer';

/**
 * Envío de emails desde el SERVIDOR (no desde el navegador).
 * Funciona con cualquier SMTP: Gmail (contraseña de aplicación), Brevo, Resend SMTP, etc.
 * Sin configurar, no falla: escribe el email en la consola ("simulado"), igual que el modo demo de Stripe.
 */
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

export const MAIL_ENABLED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transport = MAIL_ENABLED
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT) === 465, // 465 = TLS directo; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

/** Solo para tests: sustituye el transporte real por uno falso. */
export function setTransport(t) {
  transport = t;
}

export async function sendMail({ to, subject, text, html, attachments }) {
  if (!transport) {
    console.log(`\n[EMAIL simulado → ${to}] ${subject}\n${text}\n`);
    return { simulated: true };
  }
  return transport.sendMail({ from: MAIL_FROM ?? SMTP_USER, to, subject, text, html, attachments });
}
