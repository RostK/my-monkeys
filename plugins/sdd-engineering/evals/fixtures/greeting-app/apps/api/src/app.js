import { greetingsRoutes } from './modules/greetings/routes.js';

/** Registers every module on the app (one import + one register call each). */
export async function buildApp(app) {
  await app.register(greetingsRoutes);
  return app;
}
