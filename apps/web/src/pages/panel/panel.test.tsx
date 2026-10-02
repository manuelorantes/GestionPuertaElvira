import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, NO_SESSION, mockApi, renderApp } from '@/test/render';

describe('armazón del panel', () => {
  it('should show the sections with only the summary available, and the person with their role', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: { ...ADMIN, role: 'teacher' } }] });

    renderApp('/panel');

    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByRole('link', { name: /resumen/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const section of ['Alumnos', 'Clases', 'Profesores', 'Cobros y cuotas', 'Contabilidad']) {
      expect(within(nav).getByText(section).closest('[aria-disabled="true"]')).not.toBeNull();
    }
    expect(within(nav).getAllByText('Próximamente')).toHaveLength(5);
    expect(screen.getAllByText('Lucía Moreno Gil').length).toBeGreaterThan(0);
    expect(screen.getByText('Profesorado')).toBeVisible();
    expect(screen.getByText('Hola, Lucía')).toBeVisible();
  });

  it('should log out, forget the session and return to the home page', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /api/health': [200, {}],
      'GET /api/auth/me': [[200, { user: ADMIN }], NO_SESSION],
      'POST /api/auth/logout': [204],
    });
    renderApp('/panel');

    const [sidebarLogout] = await screen.findAllByRole('button', { name: /cerrar sesión/i });
    if (!sidebarLogout) throw new Error('Falta el botón de cerrar sesión');
    await user.click(sidebarLogout);

    expect(await screen.findByRole('button', { name: /acceso administración/i })).toBeVisible();
    expect(screen.queryByRole('heading', { name: /resumen del club/i })).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('cambio de contraseña obligatorio', () => {
  const TEMPORARY = { user: { ...ADMIN, mustChangePassword: true } };

  it('should mark the password rules as they are satisfied', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/auth/me': [200, TEMPORARY] });
    renderApp('/panel/cambiar-contrasena');

    const rules = await screen.findByRole('list', { name: /requisitos/i });
    expect(within(rules).getByText('Al menos 12 caracteres')).toHaveAttribute('data-met', 'false');

    await user.type(screen.getByLabelText('Nueva contraseña'), 'alfil-y-caballo');

    expect(within(rules).getByText('Al menos 12 caracteres')).toHaveAttribute('data-met', 'true');
  });

  it('should refuse to submit when the confirmation does not match', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'GET /api/auth/me': [200, TEMPORARY] });
    renderApp('/panel/cambiar-contrasena');

    await user.type(await screen.findByLabelText('Contraseña actual'), 'temporal-1234');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'alfil-y-caballo');
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'alfil-y-caballa');
    await user.click(screen.getByRole('button', { name: 'Guardar y entrar' }));

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeVisible();
    expect(api).not.toHaveBeenCalledWith('/api/auth/password', expect.anything());
  });

  it('should save the new password and enter the panel', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/auth/me': [
        [200, TEMPORARY],
        [200, { user: ADMIN }],
      ],
      'PUT /api/auth/password': [204],
    });
    renderApp('/panel/cambiar-contrasena');

    await user.type(await screen.findByLabelText('Contraseña actual'), 'temporal-1234');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'alfil-y-caballo');
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'alfil-y-caballo');
    await user.click(screen.getByRole('button', { name: 'Guardar y entrar' }));

    expect(await screen.findByRole('heading', { name: /resumen del club/i })).toBeVisible();
  });

  it('should show the reason given by the API when the change is refused', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/auth/me': [200, TEMPORARY],
      'PUT /api/auth/password': [
        422,
        {
          error: {
            code: 'current_password_mismatch',
            message: 'La contraseña actual no es correcta.',
          },
        },
      ],
    });
    renderApp('/panel/cambiar-contrasena');

    await user.type(await screen.findByLabelText('Contraseña actual'), 'equivocada-123');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'alfil-y-caballo');
    await user.type(screen.getByLabelText('Repite la nueva contraseña'), 'alfil-y-caballo');
    await user.click(screen.getByRole('button', { name: 'Guardar y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La contraseña actual no es correcta.',
    );
  });
});
