const MIN_PASSWORD_LENGTH = 12;

export interface PasswordRule {
  id: 'length' | 'notEmail';
  label: string;
  met: boolean;
}

/** Mismas reglas que la política del servidor, para guiar mientras se escribe. */
export function passwordRules(candidate: string, email: string): PasswordRule[] {
  return [
    {
      id: 'length',
      label: `Al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      met: [...candidate].length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: 'notEmail',
      label: 'Distinta de tu email',
      met: candidate.trim().toLowerCase() !== email.toLowerCase(),
    },
  ];
}
