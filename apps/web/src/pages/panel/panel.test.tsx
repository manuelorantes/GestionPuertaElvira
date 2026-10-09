import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, NO_SESSION, SUPERADMIN, TEACHER, mockApi, renderApp } from '@/test/render';

describe('armazón del panel', () => {
  it('should link every section and show the person with their role', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: ADMIN }] });

    renderApp('/panel');

    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByRole('link', { name: /resumen/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).queryByText('Próximamente')).not.toBeInTheDocument();
    for (const [name, href] of [
      [/Cobros y cuotas/, '/panel/cobros'],
      [/Profesores/, '/panel/profesores'],
      [/Contabilidad/, '/panel/contabilidad'],
    ] as const) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getAllByText('Lucía Moreno Gil').length).toBeGreaterThan(0);
    expect(screen.getByText('Administración')).toBeVisible();
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

describe('cabecera móvil', () => {
  it('should show the title of the current section', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/groups': [200, { items: [] }],
      'GET /api/admin/teachers': [200, { items: [] }],
    });

    renderApp('/panel/clases');

    expect(await screen.findByText('Clases', { selector: 'header p' })).toBeInTheDocument();
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

  it('shows the history section only to superadministrators', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: ADMIN }] });
    renderApp('/panel');
    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(within(nav).queryByRole('link', { name: /Historial/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Usuarios/ })).not.toBeInTheDocument();
    expect(screen.getByText('Administración')).toBeInTheDocument();
  });

  it('shows the history section to superadministrators', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: SUPERADMIN }] });
    renderApp('/panel');
    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByRole('link', { name: /Historial/ })).toHaveAttribute(
      'href',
      '/panel/historial',
    );
    expect(within(nav).getByRole('link', { name: /Usuarios/ })).toHaveAttribute(
      'href',
      '/panel/usuarios',
    );
    expect(screen.getByText('Superadministración')).toBeInTheDocument();
  });
});

describe('profesorado', () => {
  it('shows only the teacher menu and sends club sections back to their classes', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: TEACHER }] });
    renderApp('/panel/cobros');

    expect(await screen.findByRole('heading', { name: 'Mis clases' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByRole('link', { name: /Mis clases/ })).toHaveAttribute('href', '/panel');
    for (const name of [/Resumen/, /Alumnos$/, /Cobros/, /Profesores/, /Contabilidad/]) {
      expect(within(nav).queryByRole('link', { name })).not.toBeInTheDocument();
    }
    const mobile = screen.getByRole('navigation', { name: 'Secciones móvil' });
    expect(within(mobile).queryByRole('link', { name: /Cobrar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/no está vinculada/)).not.toBeInTheDocument();
  });

  it('tells an unlinked teacher account to ask administration', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: { ...TEACHER, teacherId: null } }] });
    renderApp('/panel');
    expect(
      await screen.findByText('Tu cuenta aún no está vinculada a ningún profesor.'),
    ).toBeInTheDocument();
  });
});

describe('barra de actualización', () => {
  it('shows while club data loads and goes away when it arrives', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      'GET /api/teacher/students': [200, { items: [] }],
    });
    // La respuesta de los alumnos se retiene hasta que el test la suelta.
    const reply = spy.getMockImplementation();
    let release: () => void = () => undefined;
    spy.mockImplementation((input, init) =>
      String(input) === '/api/teacher/students'
        ? new Promise((resolve) => {
            release = () => resolve(reply?.(input, init) as Promise<Response>);
          })
        : (reply?.(input, init) as Promise<Response>),
    );
    renderApp('/panel/mis-alumnos');

    expect(await screen.findByRole('progressbar', { name: 'Actualizando datos' })).toBeVisible();
    release();
    expect(await screen.findByText('No tienes clases asignadas.')).toBeVisible();
    expect(
      screen.queryByRole('progressbar', { name: 'Actualizando datos' }),
    ).not.toBeInTheDocument();
  });
});

describe('administración que también da clases', () => {
  const LINKED_ADMIN = { ...ADMIN, teacherId: 't1' };
  /** El botón de la barra lateral (el del móvil es el segundo). */
  const sidebarButton = (name: string) => {
    const [button] = screen.getAllByRole('button', { name });
    if (!button) throw new Error(`Falta el botón «${name}»`);
    return button;
  };

  it('should switch to the teacher space and back from the sidebar', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/auth/me': [200, { user: LINKED_ADMIN }] });
    renderApp('/panel/alumnos');

    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    await user.click(sidebarButton('Cambiar a profesor'));

    expect(await screen.findByRole('heading', { name: 'Mis clases' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: /Mis alumnos/ })).toBeVisible();
    expect(within(nav).queryByRole('link', { name: /Cobros y cuotas/ })).not.toBeInTheDocument();
    expect(screen.getByText('Profesorado')).toBeVisible();

    await user.click(sidebarButton('Cambiar a administración'));

    expect(await screen.findByRole('heading', { name: /resumen del club/i })).toBeVisible();
    expect(within(nav).getByRole('link', { name: /Cobros y cuotas/ })).toBeVisible();
  });

  it('should keep the teacher space on reload and send it back to its classes from administration', async () => {
    sessionStorage.setItem('panel-view', 'teacher');
    mockApi({ 'GET /api/auth/me': [200, { user: LINKED_ADMIN }] });

    renderApp('/panel/cobros');

    expect(await screen.findByRole('heading', { name: 'Mis clases' })).toBeVisible();
  });

  it('should not offer the switch to administration that is not linked to a teacher', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: SUPERADMIN }] });
    renderApp('/panel');

    await screen.findByRole('heading', { name: /resumen del club/i });
    expect(screen.queryByRole('button', { name: 'Cambiar a profesor' })).not.toBeInTheDocument();
  });

  it('should always start in administration after logging in', async () => {
    sessionStorage.setItem('panel-view', 'teacher');
    const user = userEvent.setup();
    mockApi({
      'GET /api/health': [200, {}],
      'GET /api/auth/me': [NO_SESSION, [200, { user: LINKED_ADMIN }]],
      'POST /api/auth/login': [200, { user: LINKED_ADMIN }],
    });
    renderApp('/?acceso=1');

    await user.type(await screen.findByLabelText('Email'), 'junta@club.es');
    await user.type(screen.getByLabelText('Contraseña'), 'torre-de-marfil');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: /resumen del club/i })).toBeVisible();
  });
});
