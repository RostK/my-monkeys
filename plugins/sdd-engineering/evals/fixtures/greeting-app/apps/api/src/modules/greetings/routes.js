import { getGreeting } from './service.js';
import { greetingsRepository } from './repository.js';

/** Fastify-style plugin: GET /greetings/:userId */
export async function greetingsRoutes(app) {
  app.get('/greetings/:userId', async (req, reply) => {
    const greeting = await getGreeting(greetingsRepository, req.params.userId);
    if (greeting === null) return reply.code(404).send({ error: 'not_found' });
    return greeting;
  });
}
