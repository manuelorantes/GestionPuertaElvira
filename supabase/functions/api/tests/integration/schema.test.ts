import { assertEquals } from '@std/assert';

import { db } from '../support/http.ts';

/**
 * Supabase expone el esquema public por su API REST con la clave anon: toda tabla debe tener RLS activo (sin
 * políticas nadie entra por ahí; la API usa el rol dueño, al que no afecta). Una tabla nueva lo activa en su
 * migración: `ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY`.
 */
Deno.test('schema should keep row level security enabled on every public table', async () => {
  const rows = await db()`SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ORDER BY c.relname`;
  assertEquals(
    rows.map((r) => r.relname),
    [],
    'tablas sin RLS: actívalo en su migración',
  );
});
