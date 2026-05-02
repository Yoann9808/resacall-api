import type { FastifyInstance } from 'fastify';

export async function utilsRoutes(_fastify: FastifyInstance): Promise<void> {
  // GET /health  — Railway healthcheck (<10ms, zero business logic)
  // GET /restaurants/:id/availability/slots
}
