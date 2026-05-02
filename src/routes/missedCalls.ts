import type { FastifyInstance } from 'fastify';

export async function missedCallsRoutes(_fastify: FastifyInstance): Promise<void> {
  // GET  /restaurants/:id/missed-calls
  // POST /restaurants/:id/missed-calls/:missedCallId/ignore
}
