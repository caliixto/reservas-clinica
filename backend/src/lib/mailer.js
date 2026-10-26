import nodemailer from 'nodemailer';

/**
 * Envío de emails desde el SERVIDOR (no desde el navegador). Orden de preferencia:
 *  1. Resend (API por HTTPS): RESEND_API_KEY + MAIL_FROM. Funciona en Render gratis (que bloquea SMTP).
 *  2. SMTP (Gmail, Brevo...): SMTP_HOST/USER/PASS. Ojo: Render gratis bloquea los puertos 25/465/587.
 *  3. Sin configurar: no falla, escribe el email en la consola ("simulado").
 */
const { RESEND_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

export const MAIL_ENABLED = Boolean(RESEND_API_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS));

/** Transporte con la misma forma que el de nodemailer ({ sendMail }), pero hablando con la API de Resend. */
export function createResendTransport(apiKey, fetchFn = fetch) {
  return {
    async sendMail({ from, to, subject, text, html, replyTo, attachments = [] }) {
      const res = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html,
          reply_to: replyTo,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content).toString('base64'),
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Resend ${res.status}: ${body.message ?? 'error desconocido'}`);
      }
      return res.json();
    },
  };
}

let transport = RESEND_API_KEY
  ? createResendTransport(RESEND_API_KEY)
  : SMTP_HOST && SMTP_USER && SMTP_PASS
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

export async function sendMail({ to, subject, text, html, attachments, replyTo }) {
  if (!transport) {
    console.log(`\n[EMAIL simulado → ${to}] ${subject}\n${text}\n`);
    return { simulated: true };
  }
  return transport.sendMail({ from: MAIL_FROM ?? SMTP_USER, to, subject, text, html, attachments, replyTo });
}
