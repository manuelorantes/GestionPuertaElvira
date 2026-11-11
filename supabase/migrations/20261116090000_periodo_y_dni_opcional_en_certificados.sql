-- Los certificados de matrícula pueden certificar un curso («2026/2027») o un año natural («2026»), y el DNI o NIE es
-- opcional (sin él, el certificado no lo menciona).
ALTER TABLE public.students_certificate RENAME COLUMN season TO period;
ALTER TABLE public.students_certificate
  ADD COLUMN period_kind character varying(6) NOT NULL DEFAULT 'season'
    CHECK (period_kind IN ('season', 'year'));
ALTER TABLE public.students_certificate ALTER COLUMN national_id DROP NOT NULL;
