-- Luna y Mario Gonzalez Puche estaban como socios provisionales (alta el 04/11, con la cuota de socio pagada por
-- transferencia y conciliada) y se les ha dado de alta otra vez con su hoja de inscripción (socios 167 y 166, con
-- grupo y familia). Se fusiona cada provisional en su ficha nueva: la ficha nueva recibe la fecha de nacimiento, la
-- licencia federativa, el cobro de la cuota de socio y los remitentes de transferencias, y la provisional desaparece.
-- Solo actúa si las cuatro fichas siguen como se dejaron (en cualquier otra base de datos no existen y no hace nada).

SELECT set_config('audit.label', 'Fusionar socios provisionales Luna y Mario Gonzalez Puche', true);

DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('01a1a772-6f31-761f-8773-f8e3dab13a2a'::uuid, '01a20eaa-5ff6-7a82-b631-b63ad9998a6d'::uuid),  -- Luna, socia 167
      ('01a1a773-ba3d-7297-9bbc-c625c5ea3d16'::uuid, '01a20ea9-d553-76ab-9a62-c44b71e8d9bc'::uuid)   -- Mario, socio 166
    ) AS p (provisional_id, member_id)
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.students_student
                               WHERE id = pair.provisional_id AND provisional)
              OR NOT EXISTS (SELECT 1 FROM public.students_student
                              WHERE id = pair.member_id AND NOT provisional);

    UPDATE public.students_student m
       SET birth_date = COALESCE(m.birth_date, p.birth_date),
           federation_licence = COALESCE(m.federation_licence, p.federation_licence),
           national_id = COALESCE(m.national_id, p.national_id),
           contact_email = COALESCE(m.contact_email, p.contact_email),
           own_phone = COALESCE(m.own_phone, p.own_phone)
      FROM public.students_student p
     WHERE m.id = pair.member_id AND p.id = pair.provisional_id;

    -- La cuota de socio de la ficha nueva queda pagada con el cobro de la provisional.
    UPDATE public.billing_charge m
       SET paid_by = p.paid_by
      FROM public.billing_charge p
     WHERE m.student_id = pair.member_id AND m.kind = 'membership'
       AND p.student_id = pair.provisional_id AND p.kind = 'membership'
       AND m.paid_by IS NULL;

    UPDATE public.billing_payment SET student_id = pair.member_id WHERE student_id = pair.provisional_id;

    INSERT INTO public.accounting_bank_payer (counterparty, student_id)
    SELECT counterparty, pair.member_id FROM public.accounting_bank_payer WHERE student_id = pair.provisional_id
    ON CONFLICT DO NOTHING;

    DELETE FROM public.billing_charge WHERE student_id = pair.provisional_id;
    DELETE FROM public.billing_account WHERE student_id = pair.provisional_id;
    DELETE FROM public.students_student WHERE id = pair.provisional_id;
  END LOOP;
END
$$;
