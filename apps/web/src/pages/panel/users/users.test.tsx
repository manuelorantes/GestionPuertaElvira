import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, SUPERADMIN, mockApi, renderApp } from '@/test/render';

const USERS = [
  {
    id: 'u0',
    email: 'junta@club.es',
    fullName: 'Administración Pruebas',
    role: 'superadministrator',
    status: 'active',
    mustChangePassword: false,
    createdAt: '2026-10-01T08:00:00.000Z',
    lastSeenAt: '2026-10-07T06:40:00.000Z',
  },
  {
    id: 'u2',
    email: 'club@ejemplo.com',
    fullName: 'Club Ajedrez',
    role: 'administrator',
    status: 'active',
    mustChangePassword: true,
    createdAt: '2026-10-07T08:00:00.000Z',
    lastSeenAt: null,
  },
  {
    id: 'u3',
    email: 'antigua@ejemplo.com',
    fullName: 'Cuenta Antigua',
    role: 'teacher',
    status: 'disabled',
    mustChangePassword: false,
    createdAt: '2026-09-01T08:00:00.000Z',
    lastSeenAt: '2026-09-15T16:00:00.000Z',
  },
];

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: SUPERADMIN }],
    'GET /api/admin/users': [200, { items: USERS }],
    ...extra,
  });
}

const postBody = (spy: ReturnType<typeof mockApi>, url: string) =>
  JSON.parse(
    String(
      spy.mock.calls.find(([u, init]) => u === url && init?.method && init.method !== 'GET')?.[1]
        ?.body ?? 'null',
    ),
  ) as unknown;

describe('Usuarios', () => {
  it('lists active accounts with their last connection and filters by status', async () => {
    api();
    renderApp('/panel/usuarios');

    const table = await screen.findByRole('table', { name: 'Cuentas de usuario' });
    const me = within(table).getByRole('row', { name: /Administración Pruebas/ });
    expect(me).toHaveTextContent('07/10/2026 08:40');
    expect(me).toHaveTextContent('(tú)');
    expect(within(me).queryByRole('button', { name: /Desactivar/ })).not.toBeInTheDocument();
    const club = within(table).getByRole('row', { name: /Club Ajedrez/ });
    expect(club).toHaveTextContent('Nunca');
    expect(club).toHaveTextContent('Contraseña temporal');
    expect(within(table).queryByRole('row', { name: /Cuenta Antigua/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Desactivados' }));
    expect(screen.getByRole('row', { name: /Cuenta Antigua/ })).toHaveTextContent('Desactivada');
  });

  it('creates an account and shows its temporary password once', async () => {
    const spy = api({
      'POST /api/admin/users': [201, { id: 'u9', temporaryPassword: 'Temporal-123456' }],
    });
    renderApp('/panel/usuarios');

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva cuenta' });
    await userEvent.type(within(dialog).getByLabelText('Email'), 'nueva@ejemplo.com');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Cuenta Nueva');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta' }));

    const shown = await screen.findByRole('dialog', { name: 'Contraseña temporal' });
    expect(within(shown).getByLabelText('Contraseña temporal')).toHaveTextContent(
      'Temporal-123456',
    );
    expect(postBody(spy, '/api/admin/users')).toEqual({
      email: 'nueva@ejemplo.com',
      fullName: 'Cuenta Nueva',
      role: 'administrator',
    });
  });

  it('resets a password, disables an account and changes a role after confirming', async () => {
    const spy = api({
      'POST /api/admin/users/u2/password-reset': [200, { temporaryPassword: 'Otra-987654321' }],
      'POST /api/admin/users/u2/disable': [204],
      'PUT /api/admin/users/u2/role': [204],
    });
    renderApp('/panel/usuarios');

    const row = await screen.findByRole('row', { name: /Club Ajedrez/ });
    await userEvent.click(within(row).getByRole('button', { name: /Restablecer la contraseña/ }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Restablecer contraseña' })).getByRole('button', {
        name: 'Restablecer',
      }),
    );
    expect(await screen.findByText('Otra-987654321')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }));

    await userEvent.click(within(row).getByRole('button', { name: 'Desactivar a Club Ajedrez' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Desactivar cuenta' })).getByRole('button', {
        name: 'Desactivar',
      }),
    );
    await waitFor(() =>
      expect(spy.mock.calls.some(([u]) => u === '/api/admin/users/u2/disable')).toBe(true),
    );

    await userEvent.selectOptions(within(row).getByLabelText('Rol de Club Ajedrez'), 'teacher');
    await waitFor(() =>
      expect(postBody(spy, '/api/admin/users/u2/role')).toEqual({ role: 'teacher' }),
    );
  });

  it('enters as another account after confirming, and shows who is acting', async () => {
    const spy = api({
      'POST /api/admin/users/u2/impersonate': [
        200,
        {
          user: {
            id: 'u2',
            fullName: 'Club Ajedrez',
            email: 'club@ejemplo.com',
            role: 'administrator',
            mustChangePassword: false,
            impersonatedBy: { id: 'u0', fullName: 'Administración Pruebas' },
          },
        },
      ],
      'GET /api/admin/dashboard': [500, {}],
    });
    renderApp('/panel/usuarios');

    const table = await screen.findByRole('table', { name: 'Cuentas de usuario' });
    const me = within(table).getByRole('row', { name: /Administración Pruebas/ });
    expect(within(me).queryByRole('button', { name: /Entrar como/ })).not.toBeInTheDocument();
    const club = within(table).getByRole('row', { name: /Club Ajedrez/ });
    await userEvent.click(within(club).getByRole('button', { name: 'Entrar como Club Ajedrez' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Entrar como esta cuenta' })).getByRole('button', {
        name: 'Entrar',
      }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Estás usando la aplicación como Club Ajedrez',
    );
    expect(screen.getByRole('button', { name: 'Volver a mi cuenta' })).toBeInTheDocument();
    expect(spy.mock.calls.some(([u]) => u === '/api/admin/users/u2/impersonate')).toBe(true);
  });

  it('sends a plain administrator back to the summary', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: ADMIN }], 'GET /api/admin/users': [403, {}] });
    renderApp('/panel/usuarios');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('table', { name: 'Cuentas de usuario' })).not.toBeInTheDocument();
  });
});
