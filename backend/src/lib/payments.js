import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;

/** Sin clave de Stripe la app funciona en "modo demo": el pago se simula. */
export const DEMO_MODE = !key;
export const stripe = key ? new Stripe(key) : null;

/** Opciones para operar sobre la cuenta de la clínica (Stripe Connect, cargos directos). */
function connectOpts(clinic) {
  return clinic.stripeAccountId ? { stripeAccount: clinic.stripeAccountId } : undefined;
}

export async function createDepositCheckout({ clinic, service, booking, successUrl, cancelUrl }) {
  // Forzamos la base URL de Vercel para producción (o la que tú uses)
  const baseUrl = process.env.FRONTEND_URL || 'https://reservas-clinica-frontend.vercel.app';

  // Si la ruta contiene '/c/', extraemos esa parte exacta (ej: /c/fisio-lugo/exito)
  // Si no, montamos una por defecto con el slug de la clínica.
  const successRoute = successUrl && successUrl.includes('/c/') 
    ? successUrl.substring(successUrl.indexOf('/c/')) 
    : `/c/${clinic.slug}/exito`;

  const cancelRoute = cancelUrl && cancelUrl.includes('/c/') 
    ? cancelUrl.substring(cancelUrl.indexOf('/c/')) 
    : `/c/${clinic.slug}`;

  // Construimos las URLs finales utilizando siempre el dominio de producción
  const finalSuccessUrl = `${baseUrl}${successRoute}`;
  const finalCancelUrl = `${baseUrl}${cancelRoute}`;

  console.log("URL de éxito generada para Stripe:", finalSuccessUrl); // 👈 Esto saldrá en los logs de Render para que lo veas

  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      customer_email: booking.patient.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: booking.depositCents,
            product_data: { name: `Señal de reserva · ${service.name} · ${clinic.name}` },
          },
        },
      ],
      metadata: { bookingId: String(booking._id), clinicId: String(clinic._id) },
    },
    connectOpts(clinic)
  );
}

export async function refundDeposit(clinic, paymentIntentId) {
  if (DEMO_MODE || !paymentIntentId) return null;
  return stripe.refunds.create({ payment_intent: paymentIntentId }, connectOpts(clinic));
}
