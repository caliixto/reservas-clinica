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
  // Forzamos el dominio base de producción en Vercel
  const baseUrl = process.env.FRONTEND_URL || 'https://reservas-clinica-frontend.vercel.app';

  // Extraemos únicamente la ruta final que hay después del dominio (ej: /c/demo-fisio/cita/...)
  // Si successUrl trae algo como http://localhost:4200/c/demo-fisio/cita/xyz, nos quedamos solo con /c/demo-fisio/cita/xyz
  let route = '/c/' + clinic.slug;
  if (successUrl) {
    try {
      // Si es una URL completa, parseamos su pathname y search
      const parsed = new URL(successUrl);
      route = parsed.pathname + parsed.search;
    } catch {
      // Si es una ruta relativa o extraña, buscamos a partir de '/c/'
      const index = successUrl.indexOf('/c/');
      if (index !== -1) {
        route = successUrl.substring(index);
      }
    }
  }

  // Construimos las URLs finales usando obligatoriamente el dominio de Vercel
  const finalSuccessUrl = `${baseUrl}${route}`;
  
  // Para el cancel, igual pero apuntando a la home de la clínica
  const finalCancelUrl = `${baseUrl}/c/${clinic.slug}`;

  console.log("URL de éxito FINAL forzada para Stripe:", finalSuccessUrl);

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
