-- La administración que también da clases se vincula a su ficha de profesor y cambia entre los dos espacios.
-- El asistente sigue sin poder vincularse.
ALTER TABLE public.identity_user
  DROP CONSTRAINT identity_user_teacher_only_for_teachers,
  ADD CONSTRAINT identity_user_teacher_only_for_roles_that_teach
    CHECK (teacher_id IS NULL OR role IN ('teacher', 'administrator', 'superadministrator'));
