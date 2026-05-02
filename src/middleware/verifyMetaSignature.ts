import type { FastifyRequest, FastifyReply } from 'fastify';

export async function verifyMetaSignature(
  _request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // Verify Meta webhook signature — 403 if invalid
  // Applied to POST /webhooks/whatsapp
}
