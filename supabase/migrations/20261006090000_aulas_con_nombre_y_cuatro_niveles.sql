-- Las aulas pasan de 1 y 2 a tres con nombre de pieza (alfil, caballo, peon), y los niveles quedan
-- en cuatro: iniciación, intermedio, avanzado y particular. Los grupos de «peques y jóvenes» pasan a
-- iniciación y los de «adultos» a intermedio.
ALTER TABLE public.classes_group
    ALTER COLUMN classroom TYPE character varying(10)
    USING CASE classroom WHEN 1 THEN 'alfil' WHEN 2 THEN 'caballo' ELSE 'peon' END;

UPDATE public.classes_group SET level = 'beginner' WHERE level = 'juniors';
UPDATE public.classes_group SET level = 'intermediate' WHERE level = 'adults';
