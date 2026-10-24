import { DateTime } from 'luxon';

/** Escapa texto del usuario antes de meterlo en HTML (nombre, dirección, etc.). */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const euros = (cents) => (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

function when(date, zone) {
  const d = DateTime.fromJSDate(date, { zone }).setLocale('es');
  const text = d.toFormat("cccc d 'de' LLLL 'a las' HH:mm");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Texto legible (blanco u oscuro) sobre el color de marca. */
function ink(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.35 ? '#10201c' : '#ffffff';
}

/** Email al paciente tras confirmar la cita: detalles, política y enlace para verla o cancelarla. */
export function bookingConfirmationEmail({ clinic, service, booking, manageUrl }) {
  const date = when(booking.start, clinic.timezone);
  const color = /^#[0-9a-f]{6}$/i.test(clinic.color) ? clinic.color : '#0f766e';
  const rest = service.priceCents - booking.depositCents;
  const subject = `Cita confirmada en ${clinic.name}: ${date}`;

  const text = [
    `Hola ${booking.patient.name},`,
    '',
    `Tu cita en ${clinic.name} está confirmada.`,
    '',
    `${service.name}`,
    `${date}`,
    clinic.address ? `Dónde: ${clinic.address}` : null,
    '',
    `Señal pagada: ${euros(booking.depositCents)}. En la clínica pagarás ${euros(rest)}.`,
    `Puedes cancelar gratis hasta ${clinic.cancelHours} h antes y te devolvemos la señal. Si cancelas más tarde o no vienes, la clínica la conserva.`,
    '',
    `Ver o cancelar tu cita: ${manageUrl}`,
    clinic.phone ? `¿Dudas? Llama al ${clinic.phone}.` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const logo =
    clinic.logoUrl && /^https:\/\//.test(clinic.logoUrl)
      ? `<img src="${esc(clinic.logoUrl)}" alt="${esc(clinic.name)}" height="40" style="display:block;max-width:180px;height:40px;object-fit:contain;background:#fff;padding:8px 10px;border-radius:10px;margin:0 0 12px">`
      : '';

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#14211e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="background:${color};color:${ink(color)};padding:24px">
    ${logo}
    <div style="font-size:22px;font-weight:700">${esc(clinic.name)}</div>
    <div style="margin-top:6px;font-size:15px;opacity:.9">Tu cita está confirmada</div>
  </td></tr>
  <tr><td style="padding:24px">
    <p style="margin:0 0 16px;font-size:16px">Hola ${esc(booking.patient.name)},</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f3;border-radius:12px"><tr><td style="padding:16px">
      <div style="font-size:17px;font-weight:700">${esc(service.name)}</div>
      <div style="margin-top:4px;font-size:15px">${esc(date)}</div>
      ${clinic.address ? `<div style="margin-top:4px;font-size:14px;color:#5b6965">${esc(clinic.address)}</div>` : ''}
    </td></tr></table>
    <p style="margin:16px 0 0;font-size:15px;line-height:1.5">
      Has pagado una señal de <strong>${euros(booking.depositCents)}</strong>. En la clínica pagarás <strong>${euros(rest)}</strong>.
    </p>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#5b6965">
      Puedes cancelar gratis hasta ${clinic.cancelHours} h antes y te devolvemos la señal. Si cancelas más tarde o no vienes, la clínica la conserva.
    </p>
    <p style="margin:24px 0 8px"><a href="${esc(manageUrl)}" style="display:inline-block;background:${color};color:${ink(color)};text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Ver o cancelar mi cita</a></p>
    <p style="margin:12px 0 0;font-size:13px;color:#5b6965">Guarda este email: es la forma de gestionar tu cita.${clinic.phone ? ` ¿Dudas? Llama al ${esc(clinic.phone)}.` : ''}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}
