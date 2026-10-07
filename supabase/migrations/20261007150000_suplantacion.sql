-- Suplantación: una sesión abierta por superadministración en nombre de otra cuenta recuerda quién la abrió.
ALTER TABLE public.identity_session
  ADD COLUMN impersonator_id uuid REFERENCES public.identity_user (id) ON DELETE CASCADE;
