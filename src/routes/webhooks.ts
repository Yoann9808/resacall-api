import type { FastifyInstance } from 'fastify';

export async function webhooksRoutes(_fastify: FastifyInstance): Promise<void> {
  // GET  /webhooks/whatsapp  — Meta handshake (hub.challenge)
  // POST /webhooks/voice     — Twilio voice webhook (TwiML)
  // POST /webhooks/missed-call — Twilio missed call (async BullMQ)
  // POST /webhooks/whatsapp  — Meta inbound message (async BullMQ)
}
