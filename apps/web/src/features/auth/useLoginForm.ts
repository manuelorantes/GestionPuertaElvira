import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from './apiErrorMessage';
import type { SessionUser } from './api';
import { useLogin } from './useLogin';

interface FieldErrors {
  email?: string;
  password?: string;
}

export function useLoginForm(onLoggedIn: (user: SessionUser) => void) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const login = useLogin();

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      ...(email.trim() === '' && { email: 'Escribe tu email.' }),
      ...(password === '' && { password: 'Escribe tu contraseña.' }),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    login.reset();
    login.mutate({ email, password }, { onSuccess: onLoggedIn });
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    fieldErrors,
    submit,
    isSubmitting: login.isPending,
    errorMessage: login.isError ? apiErrorMessage(login.error) : null,
  };
}
