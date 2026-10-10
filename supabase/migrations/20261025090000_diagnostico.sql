-- Diagnóstico de datos (pestaña «Diagnóstico» de Contabilidad; ver specs/features/diagnostico/spec.md).
-- Hallazgos de las reglas: la huella (`fingerprint`) identifica el caso (regla, entidad y datos que lo motivan); un
-- hallazgo descartado con esa huella no vuelve a salir. Sin triggers de historial: son datos derivados que el
-- diagnóstico nocturno reescribe; quién aceptó o descartó queda en la propia fila, y los cambios que aplica un arreglo
-- quedan en el historial por los triggers de sus tablas.
CREATE TABLE public.diagnostics_finding (
    id uuid PRIMARY KEY,
    rule varchar(40) NOT NULL,
    severity varchar(10) NOT NULL CHECK (severity IN ('money', 'club', 'form')),
    entity_kind varchar(20) NOT NULL,
    entity_id varchar(80) NOT NULL,
    entity_label varchar(160) NOT NULL,
    fingerprint text NOT NULL UNIQUE,
    explanation text NOT NULL,
    proposal text NOT NULL,
    fix jsonb,
    status varchar(10) NOT NULL CHECK (status IN ('open', 'accepted', 'dismissed', 'resolved')),
    detected_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    closed_at timestamptz,
    closed_by varchar(120)
);
CREATE INDEX diagnostics_finding_status_idx ON public.diagnostics_finding (status);
CREATE INDEX diagnostics_finding_entity_idx ON public.diagnostics_finding (entity_kind, entity_id);

-- Cada ejecución del diagnóstico (a mano o la tarea nocturna) y sus contadores.
CREATE TABLE public.diagnostics_run (
    id uuid PRIMARY KEY,
    started_at timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    launched_by varchar(120) NOT NULL,
    open_count integer NOT NULL,
    new_count integer NOT NULL,
    resolved_count integer NOT NULL
);
CREATE INDEX diagnostics_run_started_idx ON public.diagnostics_run (started_at);
