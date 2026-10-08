-- Una cuenta de profesorado se vincula a la ficha de su profesor (una cuenta por profesor): así ve solo lo suyo.
ALTER TABLE public.identity_user
  ADD COLUMN teacher_id uuid REFERENCES public.teachers_teacher (id) ON DELETE SET NULL,
  ADD CONSTRAINT identity_user_teacher_only_for_teachers CHECK (teacher_id IS NULL OR role = 'teacher');

CREATE UNIQUE INDEX identity_user_teacher_unique ON public.identity_user (teacher_id) WHERE teacher_id IS NOT NULL;
