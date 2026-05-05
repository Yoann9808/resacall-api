import { Queue, Worker } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { MissedCall } from '../models/MissedCall';
import { Restaurant } from '../models/Restaurant';
import { sendWhatsApp } from '../services/whatsapp.service';

function isTwilioPermanentError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number' &&
    (err as { status: number }).status >= 400 &&
    (err as { status: number }).status < 500
  );
}

export interface WhatsappJobPayload {
  restaurant_id: string;
  caller_number: string;
  missed_call_id: string;
}

const redisHost = new URL(env.UPSTASH_REDIS_REST_URL).hostname;

const connection = {
  host: redisHost,
  port: 6379,
  password: env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
  maxRetriesPerRequest: null,
};

export const whatsappQueue = new Queue<WhatsappJobPayload>('whatsapp-outbound', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60_000, // 1min / 5min / 15min
    },
  },
});

export async function addWhatsappJob(payload: WhatsappJobPayload): Promise<void> {
  await whatsappQueue.add('send', payload);
}

export function startWhatsappWorker(log: FastifyBaseLogger): Worker<WhatsappJobPayload> {
  const worker = new Worker<WhatsappJobPayload>(
    'whatsapp-outbound',
    async (job) => {
      const { restaurant_id, caller_number, missed_call_id } = job.data;

      // Idempotency: skip if already sent (retry after partial success)
      const missedCall = await MissedCall.findById(missed_call_id);
      if (!missedCall || missedCall.whatsapp_sent_at) return;

      // Deduplication: skip if WA already sent to this caller in last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const alreadySent = await MissedCall.findOne({
        restaurant_id: new Types.ObjectId(restaurant_id),
        caller_number,
        called_at: { $gte: since },
        whatsapp_sent_at: { $ne: null },
        _id: { $ne: missedCall._id },
      });
      if (alreadySent) {
        log.info({ missed_call_id, caller_number }, 'WA deduplicated — already sent in 24h');
        return;
      }

      const restaurant = await Restaurant.findById(restaurant_id);
      if (!restaurant) {
        log.warn({ missed_call_id, restaurant_id }, 'Restaurant not found — skipping WA');
        return;
      }
      if (restaurant.status !== 'active') {
        log.info({ missed_call_id, restaurant_id, status: restaurant.status }, 'Restaurant suspended — skipping WA');
        return;
      }

      try {
        await sendWhatsApp(restaurant, caller_number, restaurant.settings.welcome_message);
      } catch (err) {
        // Twilio 4xx = permanent error (invalid number, not on WhatsApp) — no retry
        if (isTwilioPermanentError(err)) {
          log.warn({ missed_call_id, caller_number, err }, 'WA send failed — invalid or non-WA number, no retry');
          return; // missed_call stays 'pending'
        }
        throw err; // temporary error (5xx, timeout) — BullMQ will retry
      }

      await MissedCall.findByIdAndUpdate(missed_call_id, {
        whatsapp_sent_at: new Date(),
        status: 'sent',
      });

      log.info({ missed_call_id, caller_number }, 'WhatsApp sent');
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'WhatsApp job failed after all retries');
  });

  return worker;
}
