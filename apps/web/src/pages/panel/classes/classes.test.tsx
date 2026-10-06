import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const TEACHER = {
  id: 't1',
  fullName: 'Lucía Moreno Gil',
  active: true,
  groupCount: 1,
  hourlyRate: '16.00',
};
const GROUP = {
  id: 'g1',
  name: 'Iniciación A',
  level: 'beginner',
  teacher: { id: 't1', fullName: 'Lucía Moreno Gil' },
  days: ['mon', 'wed'],
  start: '17:00',
  end: '18:00',
  slotLabel: 'Lun y Mié · 17:00–18:00',
  classroom: 'alfil',
  capacity: 12,
  occupied: 13,
  occupancyByDay: {},
  customName: true,
  weeklyPlan: 'two_hours',
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/groups': [200, { items: [GROUP] }],
    'GET /api/admin/teachers': [200, { items: [TEACHER] }],
    ...extra,
  });
}

describe('Clases', () => {
  it('should show each group in the weekly schedule with its teacher and occupancy', async () => {
    api();
    renderApp('/panel/clases');

    expect(await screen.findByRole('heading', { name: 'Clases' })).toBeVisible();
    expect(await screen.findByText('Lunes a viernes · 3 aulas · 1 grupos')).toBeVisible();
    const blocks = await screen.findAllByRole('button', { name: /iniciación a/i });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent('Lucía Moreno · 13/12');
    expect(screen.getByText('Particulares')).toBeVisible();
  });

  it('should list groups with level, schedule, plan and an over capacity warning', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/clases');

    await user.click(await screen.findByRole('tab', { name: 'Grupos' }));

    const row = (await screen.findByRole('cell', { name: /iniciación a/i })).closest('tr');
    if (!row) throw new Error('Falta la fila');
    expect(within(row).getByText('Iniciación')).toBeVisible();
    expect(within(row).getByText('2 h semanales')).toBeVisible();
    expect(within(row).getByText('Sobre el cupo')).toBeVisible();
  });

  it('should preview the default name and create a group without one', async () => {
    const user = userEvent.setup();
    const fetchSpy = api({
      'POST /api/admin/groups': [201, { id: 'g9' }],
    });
    renderApp('/panel/clases');

    await user.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo grupo' });
    await user.click(within(dialog).getByRole('button', { name: 'Mié' }));
    await user.click(within(dialog).getByRole('button', { name: 'Aula Peón' }));
    expect(within(dialog).getByLabelText('Nombre del grupo')).toHaveAttribute(
      'placeholder',
      'Miércoles 17:00 · Iniciación · Peón',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Crear grupo' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Grupo «Miércoles 17:00 · Iniciación · Peón» creado',
    );
    const sent = fetchSpy.mock.calls.find(
      ([url, init]) => url === '/api/admin/groups' && init?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual(
      expect.objectContaining({ name: '', classroom: 'peon' }),
    );
  });

  it('should create a group and report a classroom conflict without closing the dialog', async () => {
    const user = userEvent.setup();
    const fetchSpy = api({
      'POST /api/admin/groups': [
        409,
        {
          error: {
            code: 'classroom_conflict',
            message: 'Coincide en el aula 1 con «Iniciación A» (Lun y Mié · 17:00–18:00).',
            details: {
              groupId: 'g1',
              groupName: 'Iniciación A',
              slotLabel: 'Lun y Mié · 17:00–18:00',
            },
          },
        },
      ],
    });
    renderApp('/panel/clases');

    await user.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo grupo' });
    await user.type(within(dialog).getByLabelText('Nombre del grupo'), 'Iniciación F');
    await user.click(within(dialog).getByRole('button', { name: 'Lun' }));
    expect(within(dialog).getByText(/1 h semanales/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Crear grupo' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Coincide en el aula 1 con «Iniciación A»',
    );
    const body = JSON.parse(
      String(
        fetchSpy.mock.calls.find(
          ([url, init]) => url === '/api/admin/groups' && init?.method === 'POST',
        )?.[1]?.body,
      ),
    );
    expect(body).toEqual({
      name: 'Iniciación F',
      level: 'beginner',
      teacherId: 't1',
      days: ['mon'],
      start: '17:00',
      end: '18:00',
      classroom: 'alfil',
      capacity: 12,
    });
  });

  it('should use the first active teacher even if teachers load after the dialog opens', async () => {
    const user = userEvent.setup();
    let releaseTeachers: (value: Response) => void = () => {};
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      if (key === 'GET /api/admin/teachers')
        return new Promise<Response>((resolve) => (releaseTeachers = resolve));
      if (key === 'GET /api/auth/me')
        return new Response(JSON.stringify({ user: ADMIN }), { status: 200 });
      if (key === 'GET /api/admin/groups')
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'g9' }), { status: 201 });
    });
    renderApp('/panel/clases');

    await user.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
    expect(screen.getByText('Cargando profesores…')).toBeVisible();
    releaseTeachers(new Response(JSON.stringify({ items: [TEACHER] }), { status: 200 }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo grupo' });
    await within(dialog).findByLabelText('Profesor');
    await user.type(within(dialog).getByLabelText('Nombre del grupo'), 'Tarde');
    await user.click(within(dialog).getByRole('button', { name: 'Mar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear grupo' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/admin/groups',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const post = fetchSpy.mock.calls.find(
      ([url, init]) => url === '/api/admin/groups' && init?.method === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body)).teacherId).toBe('t1');
  });

  it('should refuse locally a group that ends before it starts', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/clases');

    await user.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Termina'), '16:30');
    await user.click(within(dialog).getByRole('button', { name: 'Crear grupo' }));

    expect(
      within(dialog).getByText('La hora de fin debe ser posterior a la de inicio.'),
    ).toBeVisible();
    expect(within(dialog).getByText('Elige al menos un día.')).toBeVisible();
  });

  it('should add teachers and explain why one with groups cannot be deactivated', async () => {
    const user = userEvent.setup();
    const fetchSpy = api({
      'POST /api/admin/teachers': [201, { id: 't2' }],
      'PUT /api/admin/teachers/t1': [
        409,
        {
          error: {
            code: 'teacher_has_groups',
            message: 'No se puede desactivar: tiene 1 grupo asignados.',
          },
        },
      ],
    });
    renderApp('/panel/clases?pestana=profesores');

    await user.type(await screen.findByLabelText('Nombre y apellidos'), 'Carlos Ruiz');
    await user.click(screen.getByRole('button', { name: 'Añadir profesor' }));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/teachers',
      expect.objectContaining({ method: 'POST', body: '{"fullName":"Carlos Ruiz"}' }),
    );

    await user.click(screen.getByRole('button', { name: 'Editar Lucía Moreno Gil' }));
    await user.click(screen.getByRole('switch', { name: 'Activo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede desactivar');
  });

  it('should show and change the hourly rate of a teacher', async () => {
    const user = userEvent.setup();
    const fetchSpy = api({ 'PUT /api/admin/teachers/t1': [204] });
    renderApp('/panel/clases?pestana=profesores');

    expect(await screen.findByText('16 €/h')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar Lucía Moreno Gil' }));
    const rate = screen.getByLabelText('Tarifa por hora (€)');
    await user.clear(rate);
    await user.type(rate, '17,5');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/admin/teachers/t1',
        expect.objectContaining({
          method: 'PUT',
          body: '{"fullName":"Lucía Moreno Gil","active":true,"hourlyRate":"17,5"}',
        }),
      ),
    );
  });

  it('should be reachable from the panel navigation', async () => {
    api({ 'GET /api/health': [200, {}] });
    renderApp('/panel');

    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByRole('link', { name: /clases/i })).toHaveAttribute(
      'href',
      '/panel/clases',
    );
  });
});
