-- El nombre del grupo pasa a ser opcional: sin nombre propio, el grupo se llama por su día, hora de
-- inicio, nivel y aula («Lunes 17:00 · Iniciación · Peón»). Todos los grupos existentes pasan al nombre
-- por defecto (lo pidió el club); desde ahora la API mantiene ese nombre al cambiar día, hora, nivel o aula.
ALTER TABLE public.classes_group ADD COLUMN custom_name boolean NOT NULL DEFAULT false;
ALTER TABLE public.classes_group ALTER COLUMN name TYPE character varying(80);

WITH dias AS (
    SELECT g.id,
           array_agg(CASE x::int WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
                                 WHEN 4 THEN 'jueves' ELSE 'viernes' END ORDER BY x::int) AS nombres
      FROM public.classes_group g, json_array_elements_text(g.days) AS x
     GROUP BY g.id
), etiqueta AS (
    SELECT id,
           CASE WHEN array_length(nombres, 1) = 1 THEN nombres[1]
                ELSE array_to_string(nombres[1:array_length(nombres, 1) - 1], ', ')
                     || ' y ' || nombres[array_length(nombres, 1)]
           END AS texto
      FROM dias
)
UPDATE public.classes_group g
   SET custom_name = false,
       name = upper(left(e.texto, 1)) || substr(e.texto, 2)
              || ' ' || lpad((g.start_minutes / 60)::text, 2, '0') || ':' || lpad((g.start_minutes % 60)::text, 2, '0')
              || ' · ' || CASE g.level WHEN 'beginner' THEN 'Iniciación' WHEN 'intermediate' THEN 'Intermedio'
                                       WHEN 'advanced' THEN 'Avanzado' ELSE 'Particular' END
              || ' · ' || CASE g.classroom WHEN 'alfil' THEN 'Alfil' WHEN 'caballo' THEN 'Caballo' ELSE 'Peón' END
  FROM etiqueta e
 WHERE e.id = g.id;
