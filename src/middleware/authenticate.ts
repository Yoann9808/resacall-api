import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(
  _request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // Verify Authorization: Bearer <access_token>
  // Attach decoded payload to request for downstream handlers
}
