-- Emails adicionales de una cuenta: con cualquiera de ellos se entra en la misma cuenta (misma contraseña y perfil).
-- Ninguno puede ser el email (principal o adicional) de otra cuenta; lo comprueba la aplicación al añadirlo.
CREATE TABLE public.identity_user_email (
    email character varying(254) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.identity_user (id) ON DELETE CASCADE
);

CREATE INDEX identity_user_email_user ON public.identity_user_email (user_id);

-- Sin captura del historial (como identity_user, no se deshace desde ahí): queda como evento de seguridad.
