import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from './apiErrorMessage';
import { passwordRules } from './passwordRules';
import { useChangePassword } from './useChangePassword';

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function useChangePasswordForm(email: string, onChanged: () => void) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const change = useChangePassword();
  const rules = passwordRules(newPassword, email);

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      ...(currentPassword === '' && { currentPassword: 'Escribe tu contraseña actual.' }),
      ...(!rules.every((rule) => rule.met) && {
        newPassword: 'La nueva contraseña no cumple los requisitos.',
      }),
      ...(confirmPassword !== newPassword && { confirmPassword: 'Las contraseñas no coinciden.' }),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    change.reset();
    change.mutate({ currentPassword, newPassword }, { onSuccess: onChanged });
  }

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    rules,
    fieldErrors,
    submit,
    isSubmitting: change.isPending,
    errorMessage: change.isError ? apiErrorMessage(change.error) : null,
  };
}
