-- rls_en_tablas_publicas
--
-- Supabase expone el esquema public por su API REST automática (PostgREST) con la clave pública «anon». La
-- aplicación no usa esa API: la web habla con la Edge Function, que entra en la base como el rol postgres,
-- dueño de las tablas, al que la seguridad por filas no afecta (igual que a la consola y a las copias).
-- Con RLS activo y sin políticas, anon y authenticated no pueden leer ni escribir nada; además se les quitan
-- los privilegios sobre el esquema, también para lo que se cree después. Las tablas nuevas deben activar RLS
-- en su migración (lo comprueba tests/integration/schema.test.ts).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  -- Los roles de la API REST solo existen en Supabase; en la base local no hay nada que revocar.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;
