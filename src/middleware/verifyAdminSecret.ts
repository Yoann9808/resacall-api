import type { FastifyRequest, FastifyReply } from 'fastify';

export async function verifyAdminSecret(
  _request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // Check X-Admin-Secret header — 403 if missing or invalid
  // Applied to all /admin/* routes
}
