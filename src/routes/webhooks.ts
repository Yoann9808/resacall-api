import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyTwilioSignature } from '../middleware/verifyTwilioSignature';
import { Restaurant } from '../models/Restaurant';
import { MissedCall } from '../models/MissedCall';
import { addWhatsappJob } from '../jobs/whatsappQueue';

const TWIML_HANGUP = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

const voiceBodySchema = z.object({
  CallSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
});

export async function webhooksRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /webhooks/voice — Twilio Voice URL
  // Triggered on every incoming call = missed call (restaurant configured call forwarding here)
  fastify.post(
    '/voice',
    { preHandler: verifyTwilioSignature },
    async (request, reply) => {
      const parsed = voiceBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).header('Content-Type', 'text/xml').send(TWIML_HANGUP);
      }

      const { CallSid, From, To } = parsed.data;

      const restaurant = await Restaurant.findOne({ phone_number: To });
      if (!restaurant) {
        fastify.log.warn({ event: 'restaurant_not_found', phone_number: To, CallSid });
        return reply.status(404).send({ error: 'Restaurant not found' });
      }

      const missedCall = await MissedCall.findOneAndUpdate(
        { twilio_call_sid: CallSid },
        {
          $setOnInsert: {
            restaurant_id: restaurant._id,
            caller_number: From,
            called_at: new Date(),
            status: 'pending',
            whatsapp_sent_at: null,
            conversation_id: null,
          },
        },
        { upsert: true, new: true },
      );

      reply.header('Content-Type', 'text/xml').send(TWIML_HANGUP);

      if (!missedCall) return;

      await addWhatsappJob({
        restaurant_id: restaurant._id.toString(),
        caller_number: From,
        missed_call_id: missedCall._id.toString(),
      });
    },
  );

  // GET  /webhooks/whatsapp — Meta handshake (hub.challenge)
  // POST /webhooks/whatsapp — Meta inbound message (async BullMQ)
}
