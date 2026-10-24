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
  // Obtenemos la URL de producción desde variables de entorno
  const baseUrl = process.env.FRONTEND_URL || 'https://reservas-clinica-frontend.vercel.app';

  // Si la URL que le entra a la función contiene 'localhost', la cambiamos por la URL real
  const finalSuccessUrl = successUrl.includes('localhost') 
    ? successUrl.replace(/http:\/\/localhost:\d+/, baseUrl) 
    : successUrl;

  const finalCancelUrl = cancelUrl.includes('localhost') 
    ? cancelUrl.replace(/http:\/\/localhost:\d+/, baseUrl) 
    : cancelUrl;

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
