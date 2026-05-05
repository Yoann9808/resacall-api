import type { FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import { env } from '../config/env';

export async function verifyTwilioSignature(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const twilioSignature = request.headers['x-twilio-signature'] as string | undefined;

  if (!twilioSignature) {
    reply.status(403).send({ error: 'Missing Twilio signature' });
    return;
  }

  const url = `${env.TWILIO_WEBHOOK_BASE_URL}${request.url}`;
  const params = (request.body ?? {}) as Record<string, string>;

  const isValid = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, twilioSignature, url, params);

  if (!isValid) {
    reply.status(403).send({ error: 'Invalid Twilio signature' });
  }
}
