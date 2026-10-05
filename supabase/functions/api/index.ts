// Punto de entrada de la Edge Function `api` (ver specs/decisions/backend-en-deno-sobre-supabase.md).
// Supabase la publica en /functions/v1/api/*, así que las rutas internas conservan el prefijo /api.
// En local se ejecuta igual con `deno task serve` (PORT) contra el PostgreSQL de Compose.
import { buildApp, configFromEnv } from './src/container.ts';

const api = buildApp(configFromEnv());

Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000) }, api.hono.fetch);
