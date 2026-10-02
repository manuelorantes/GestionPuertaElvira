import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, NO_SESSION, mockApi, renderApp } from '@/test/render';

describe('acceso al panel', () => {
  it('should open the login dialog from the home page and enter the panel with valid credentials', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /api/health': [200, { status: 'healthy', database: 'reachable' }],
      'GET /api/auth/me': [NO_SESSION, [200, { user: ADMIN }]],
      'POST /api/auth/login': [200, { user: ADMIN }],
    });
    renderApp('/');

    await user.click(screen.getByRole('button', { name: /acceso administración/i }));
    const dialog = screen.getByRole('dialog', { name: /acceso administración/i });
    await user.type(screen.getByLabelText('Email'), 'junta@club.es');
    await user.type(screen.getByLabelText('Contraseña'), 'torre-de-marfil');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: /resumen del club/i })).toBeVisible();
    expect(dialog).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ email: 'junta@club.es', password: 'torre-de-marfil' }),
      }),
    );
  });

  it('should show the generic error and keep the dialog open when credentials are wrong', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/health': [200, { status: 'healthy', database: 'reachable' }],
      'GET /api/auth/me': NO_SESSION,
      'POST /api/auth/login': [
        401,
        { error: { code: 'invalid_credentials', message: 'Email o contraseña incorrectos.' } },
      ],
    });
    renderApp('/?acceso=1');

    await user.type(await screen.findByLabelText('Email'), 'junta@club.es');
    await user.type(screen.getByLabelText('Contraseña'), 'mala-contraseña');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('should explain how long to wait when attempts are blocked', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/health': [200, { status: 'healthy', database: 'reachable' }],
      'GET /api/auth/me': NO_SESSION,
      'POST /api/auth/login': [
        429,
        { error: { code: 'too_many_requests', message: 'x' } },
        { 'Retry-After': '840' },
      ],
    });
    renderApp('/?acceso=1');

    await user.type(await screen.findByLabelText('Email'), 'junta@club.es');
    await user.type(screen.getByLabelText('Contraseña'), 'lo-que-sea-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Prueba de nuevo en 14 minutos.',
    );
  });

  it('should ask for both fields before calling the API', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'GET /api/health': [200, {}], 'GET /api/auth/me': NO_SESSION });
    renderApp('/?acceso=1');

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Escribe tu email.')).toBeVisible();
    expect(screen.getByText('Escribe tu contraseña.')).toBeVisible();
    expect(api).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });

  it('should send people without a session from the panel to the home page with the dialog open', async () => {
    mockApi({ 'GET /api/health': [200, {}], 'GET /api/auth/me': NO_SESSION });

    renderApp('/panel');

    expect(await screen.findByRole('dialog', { name: /acceso administración/i })).toBeVisible();
    expect(screen.queryByRole('heading', { name: /resumen del club/i })).not.toBeInTheDocument();
  });

  it('should send accounts with a temporary password to the password change page', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: { ...ADMIN, mustChangePassword: true } }] });

    renderApp('/panel');

    expect(await screen.findByRole('heading', { name: /elige tu contraseña/i })).toBeVisible();
  });

  it('should go straight to the panel from the home button when already logged in', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/health': [200, {}], 'GET /api/auth/me': [200, { user: ADMIN }] });
    renderApp('/');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /acceso administración/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: /acceso administración/i }));

    expect(await screen.findByRole('heading', { name: /resumen del club/i })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
