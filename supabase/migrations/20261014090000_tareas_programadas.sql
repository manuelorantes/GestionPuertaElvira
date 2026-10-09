-- Ejecuciones de las tareas programadas (workflows de GitHub Actions): cada workflow apunta la suya al terminar, y la
-- sección Sistema compara con su horario si se hizo, se retrasó o no llegó. Sin historial: no son datos del club.
CREATE TABLE public.system_task_run (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task character varying(40) NOT NULL,
    started_at timestamp(0) with time zone NOT NULL,
    finished_at timestamp(0) with time zone,
    outcome character varying(20) NOT NULL CHECK (outcome IN ('success', 'failure')),
    manual boolean NOT NULL DEFAULT false,
    url character varying(300)
);

CREATE INDEX system_task_run_task_started ON public.system_task_run (task, started_at);

-- Las ejecuciones que GitHub ya tenía registradas antes de que los workflows las apuntaran.
INSERT INTO public.system_task_run (task, started_at, finished_at, outcome, manual, url) VALUES
  ('horas-automaticas', '2026-10-08T21:01:47Z', '2026-10-08T21:02:21Z', 'success', true,
   'https://github.com/manuelorantes/GestionPuertaElvira/actions/runs/37843827916'),
  ('horas-automaticas', '2026-10-09T01:20:54Z', '2026-10-09T01:21:26Z', 'success', false,
   'https://github.com/manuelorantes/GestionPuertaElvira/actions/runs/37869336236'),
  ('copia-seguridad', '2026-10-05T22:02:17Z', '2026-10-05T22:02:41Z', 'success', true,
   'https://github.com/manuelorantes/GestionPuertaElvira/actions/runs/37379846503'),
  ('keep-alive', '2026-10-07T13:19:41Z', '2026-10-07T13:20:02Z', 'success', false,
   'https://github.com/manuelorantes/GestionPuertaElvira/actions/runs/37627613006');
