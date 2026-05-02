import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import mongoose from 'mongoose';
import { z } from 'zod';

// --- Env validation (crashes on startup if any var is missing/invalid) ---
const envSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  TWILIO_ACCOUNT_SID: z.string().min(1, 'TWILIO_ACCOUNT_SID is required'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'TWILIO_AUTH_TOKEN is required'),
  TWILIO_WEBHOOK_BASE_URL: z.string().min(1, 'TWILIO_WEBHOOK_BASE_URL is required'),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_VERIFY_TOKEN is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  UPSTASH_REDIS_REST_URL: z.string().min(1, 'UPSTASH_REDIS_REST_URL is required'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  RESEND_FROM_EMAIL: z.string().email().default('noreply@resacall.com'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ADMIN_SECRET: z.string().min(1, 'ADMIN_SECRET is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().default('https://app.resacall.com'),
});

const envResult = envSchema.safeParse(process.env);
if (!envResult.success) {
  console.error('❌ Invalid environment variables:');
  const errors = envResult.error.flatten().fieldErrors;
  for (const [key, messages] of Object.entries(errors)) {
    console.error(`  ${key}: ${messages?.join(', ')}`);
  }
  process.exit(1);
}

export const env = envResult.data;

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

  const db = mongoose.connection.db!;

  await db.collection('restaurants').createIndex({ phone_number: 1 }, { unique: true });
  await db.collection('missed_calls').createIndex({ twilio_call_sid: 1 }, { unique: true });
  await db
    .collection('missed_calls')
    .createIndex({ restaurant_id: 1, caller_number: 1, called_at: -1 });
  await db.collection('conversations').createIndex({ customer_phone: 1, status: 1 });
  await db
    .collection('conversations')
    .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
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

  // Routes — uncomment as each file is implemented:
  // const { webhooksRoutes } = await import('./routes/webhooks');
  // const { authRoutes } = await import('./routes/auth');
  // const { restaurantsRoutes } = await import('./routes/restaurants');
  // const { reservationsRoutes } = await import('./routes/reservations');
  // const { conversationsRoutes } = await import('./routes/conversations');
  // const { statsRoutes } = await import('./routes/stats');
  // const { missedCallsRoutes } = await import('./routes/missedCalls');
  // const { adminRoutes } = await import('./routes/admin');
  // const { utilsRoutes } = await import('./routes/utils');
  //
  // fastify.register(webhooksRoutes, { prefix: '/webhooks' });
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
