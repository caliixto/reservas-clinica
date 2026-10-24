import { Router } from 'express';
import express from 'express';
import { stripe } from '../lib/payments.js';
import { confirmBooking } from '../lib/bookings.js';

const router = Router();

/**
 * Webhook de Stripe. IMPORTANTE: necesita el body SIN parsear (raw)
 * para poder verificar la firma. Por eso se monta antes de express.json().
 *
 * En local:  stripe listen --forward-to localhost:3000/api/webhooks/stripe
 * (la CLI te da el STRIPE_WEBHOOK_SECRET que empieza por whsec_)
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(404).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Firma no válida: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      await confirmBooking(session.metadata.bookingId, session.payment_intent);
    }
  }
  res.json({ received: true });
});

export default router;
