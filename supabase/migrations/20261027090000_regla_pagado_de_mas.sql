-- La regla «Lo cubierto no cuadra con lo cobrado» (del club entero) se sustituye por «Ha pagado más que sus cuotas»
-- (por alumno): sus hallazgos, abiertos o cerrados, ya no tienen regla en el catálogo.
DELETE FROM public.diagnostics_finding WHERE rule = 'covered_payments_mismatch';
