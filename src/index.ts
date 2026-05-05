import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyFormbody from '@fastify/formbody';
import mongoose from 'mongoose';
import { env } from './config/env';
import { webhooksRoutes } from './routes/webhooks';
import { startWhatsappWorker } from './jobs/whatsappQueue';

// --- Fastify instance ---
const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// --- MongoDB connection + indexes ---
async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ MongoDB connecté');

  const db = mongoose.connection.db!;

  await db.collection('restaurants').createIndex({ phone_number: 1 }, { unique: true });
  await db.collection('missed_calls').createIndex({ twilio_call_sid: 1 }, { unique: true });
  await db
    .collection('missed_calls')
    .createIndex({ restaurant_id: 1, caller_number: 1, called_at: -1 });
  await db.collection('conversations').createIndex({ customer_phone: 1, status: 1 });
  await db.collection('conversations').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection('reservations').createIndex({ restaurant_id: 1, date_time: 1 });

  fastify.log.info('MongoDB connected and indexes ensured');
}

// --- Bootstrap ---
async function bootstrap(): Promise<void> {
  await connectMongo();

  await fastify.register(fastifyCookie);
  await fastify.register(fastifyCors, {
    origin: env.APP_URL,
    credentials: true,
  });
  await fastify.register(fastifyFormbody);

  fastify.register(webhooksRoutes, { prefix: '/webhooks' });

  startWhatsappWorker(fastify.log);

  // Routes — uncomment as each file is implemented:
  // const { authRoutes } = await import('./routes/auth');
  // const { restaurantsRoutes } = await import('./routes/restaurants');
  // const { reservationsRoutes } = await import('./routes/reservations');
  // const { conversationsRoutes } = await import('./routes/conversations');
  // const { statsRoutes } = await import('./routes/stats');
  // const { missedCallsRoutes } = await import('./routes/missedCalls');
  // const { adminRoutes } = await import('./routes/admin');
  // const { utilsRoutes } = await import('./routes/utils');
  //
  // fastify.register(authRoutes, { prefix: '/auth' });
  // fastify.register(restaurantsRoutes, { prefix: '/restaurants' });
  // fastify.register(reservationsRoutes, { prefix: '/restaurants' });
  // fastify.register(conversationsRoutes, { prefix: '/restaurants' });
  // fastify.register(statsRoutes, { prefix: '/restaurants' });
  // fastify.register(missedCallsRoutes, { prefix: '/restaurants' });
  // fastify.register(adminRoutes, { prefix: '/admin' });
  // fastify.register(utilsRoutes);

  fastify.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
