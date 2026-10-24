# Reservas con señal (esqueleto)

Herramienta multi-clínica: el paciente reserva online y paga una señal; si cancela tarde o no viene,
la clínica se la queda. Backend Node/Express + MongoDB + Stripe, frontend Angular.

## Estructura
- `backend/` API (Express, Mongoose, Stripe, luxon)
- `frontend/` Angular 21: `/c/:slug` (reserva del paciente), `/c/:slug/cita/:token` (ver/cancelar), `/panel` (clínica)

## Arrancar en local
1. MongoDB: local (`mongod`) o un cluster gratis de Atlas.
2. Backend:
   ```
   cd backend
   cp .env.example .env     # pon tu MONGODB_URI si usas Atlas
   npm install
   npm run seed             # crea la clínica de ejemplo "demo-fisio"
   npm run dev              # http://localhost:3000
   ```
3. Frontend:
   ```
   cd frontend
   npm install --legacy-peer-deps
   npx ng serve             # http://localhost:4200
   ```
4. Abre `http://localhost:4200/c/demo-fisio` para reservar y `http://localhost:4200/panel`
   (demo-fisio / demo1234) para ver las citas.

## Modo demo vs Stripe
Sin `STRIPE_SECRET_KEY` en `.env` la app funciona en **modo demo**: el pago se simula con un botón.
Sirve para enseñar el flujo sin configurar nada.

Para probar Stripe de verdad (modo test):
1. Crea cuenta en Stripe y copia la clave secreta de test (`sk_test_...`) a `.env`.
2. Instala la Stripe CLI y ejecuta `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
   Copia el `whsec_...` que te da a `STRIPE_WEBHOOK_SECRET`.
3. Paga con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC).

## Qué hace ya
- Huecos libres según horario semanal, duración del servicio y citas existentes.
- Reserva con hueco retenido 30 min hasta pagar; índice único en MongoDB contra dobles reservas.
- Webhook idempotente que confirma la cita al pagar.
- Cancelación por enlace privado: con >= `cancelHours` de antelación se devuelve la señal; si no, se retiene
  y se avisa a la clínica (por ahora, en consola: `backend/src/lib/notify.js`).
- Panel: citas por día, "Vino" / "No vino" / "Cancelar" y total de señales retenidas.

## Pendiente (en este orden)
1. Probar todos los casos con Stripe en modo test (ver lista abajo).
2. Aviso real a la clínica por email.
3. Stripe Connect: que cada clínica conecte su cuenta (`stripeAccountId` ya está en el modelo y
   `payments.js` ya lo usa). Ojo: con Connect los webhooks de cuentas conectadas se configuran aparte.
4. Lista de espera y WhatsApp (API de WhatsApp Business, plantillas aprobadas).
5. Editar servicios y horarios desde el panel (ahora se hace con `seed.js`).
6. Contraseñas y textos legales (política de privacidad y condiciones de cancelación) antes del primer cliente real.

## Casos a probar
- Paga y viene (Vino) · Paga y no viene (No vino) · Cancela a tiempo (reembolso) · Cancela tarde (sin reembolso)
- Cierra la ventana de Stripe sin pagar (la reserva expira a los 30 min)
- Dos personas reservan el mismo hueco a la vez
- Tarjeta rechazada (`4000 0000 0000 0002`) · Webhook repetido

## Despliegue
- Frontend en Vercel (build `ng build`, salida `dist/frontend/browser`). Cambia `API_URL` en `frontend/src/app/config.ts`.
- Backend en Render con las variables de `.env.example`. Poner `FRONTEND_URL` con la URL de Vercel.
- Base de datos en MongoDB Atlas.
- Render gratis se duerme: abre la API una vez antes de enseñar la demo.
