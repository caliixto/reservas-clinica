import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhook.js';
import { DEMO_MODE } from './lib/payments.js';

export const app = express();

// 1. MODIFICA EL CORS: Permitir temporalmente cualquier origen en desarrollo local (o IPs de tu red)
app.use(cors({ 
  origin: true // Permite cualquier origen dinámicamente durante las pruebas locales
}));

// El webhook va ANTES de express.json() porque necesita el body en crudo.
app.use('/api/webhooks', webhookRoutes);
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, demoMode: DEMO_MODE }));
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

// Express 4 no captura errores async solos: red de seguridad básica.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

export async function start() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/reservas-clinica';
  await mongoose.connect(uri);
  const port = process.env.PORT ?? 3000;
  
  // 2. AÑADE '0.0.0.0' AQUÍ PARA QUE ESCUCHE EN LA RED LOCAL
  app.listen(port, '0.0.0.0', () =>
    console.log(`API en :${port} · ${DEMO_MODE ? 'MODO DEMO (sin Stripe)' : 'Stripe activo'}`)
  );
}

start();