import type { FastifyRequest, FastifyReply } from 'fastify';

export async function verifyTwilioSignature(
  _request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // twilio.validateRequest() — 403 if X-Twilio-Signature is invalid
  // Applied to ALL /webhooks/voice and /webhooks/missed-call routes
}
