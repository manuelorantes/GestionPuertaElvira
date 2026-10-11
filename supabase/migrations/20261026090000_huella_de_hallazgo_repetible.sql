-- Un caso cerrado (aceptado o resuelto solo) puede volver a darse con los mismos datos: el diagnóstico lo encuentra
-- como un hallazgo nuevo con la misma huella, así que la huella deja de ser única (los descartados se siguen
-- reconociendo por ella).
ALTER TABLE public.diagnostics_finding DROP CONSTRAINT diagnostics_finding_fingerprint_key;
CREATE INDEX diagnostics_finding_fingerprint_idx ON public.diagnostics_finding (fingerprint);
