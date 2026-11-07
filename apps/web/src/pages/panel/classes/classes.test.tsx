import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth, shiftMonth } from '@/features/billing/money';
import { ADMIN, mockApi, renderApp, SUPERADMIN } from '@/test/render';

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

const MONTH = currentMonth();
const ATTENDANCE = {
  groupId: 'g1',
  name: 'Iniciación A',
  month: MONTH,
  days: [
    { date: `${MONTH}-05`, status: 'taken' },
    { date: `${MONTH}-07`, status: 'taken' },
    { date: `${MONTH}-12`, status: 'holiday' },
    { date: `${MONTH}-14`, status: 'pending' },
  ],
  students: [
    {
      id: 's1',
      name: 'Ana Ruiz Gil',
      marks: ['present', 'absent', null, 'unknown'],
      attended: 1,
      classes: 2,
      member: true,
    },
    {
      id: 's2',
      name: 'Pablo Gil Ruiz',
      marks: ['present', 'present', null, 'unknown'],
      attended: 2,
      classes: 2,
    },
    {
      id: 's3',
      name: 'Luis Mora Gil',
      marks: [null, null, null, 'unknown'],
      attended: 0,
      classes: 0,
    },
  ],
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
  it('opens a group straight from its link', async () => {
    api({ 'GET /api/admin/groups/g1': [200, { ...GROUP, students: [] }] });
    renderApp('/panel/clases?grupo=g1');

    expect(await screen.findByRole('dialog', { name: 'Iniciación A' })).toBeInTheDocument();
  });

  it('should show each group in the weekly schedule with its teacher and occupancy', async () => {
    api();
    renderApp('/panel/clases');

    expect(await screen.findByRole('heading', { name: 'Clases' })).toBeVisible();
    expect(await screen.findByText('Lunes a viernes · 4 aulas · 1 grupos')).toBeVisible();
    const blocks = await screen.findAllByRole('button', { name: /iniciación a/i });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent('Lucía Moreno13/12 plazas');
    expect(blocks[0]).not.toHaveTextContent('17:00');
    expect(screen.getByText('Particulares')).toBeVisible();
  });

  it('shows a single classroom with full details when it is selected', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/clases');

    const [block] = await screen.findAllByRole('button', { name: /iniciación a/i });
    expect(block).not.toHaveTextContent('17:00');

    await user.click(screen.getByRole('button', { name: 'Aula Alfil' }));
    const detailed = await screen.findAllByRole('button', { name: /iniciación a/i });
    expect(detailed[0]).toHaveTextContent('Iniciación');
    expect(detailed[0]).toHaveTextContent('17:00–18:00');
    expect(detailed[0]).toHaveTextContent('Lucía Moreno Gil · 13/12');

    const schedule = screen.getByRole('region', { name: 'Horario semanal' });
    const shownDays = () =>
      within(schedule)
        .getAllByRole('group')
        .map((day) => day.getAttribute('aria-label'));
    const wholeWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    expect(shownDays()).toEqual(wholeWeek);

    await user.click(screen.getByRole('button', { name: 'Aula Peón' }));
    expect(screen.queryByRole('button', { name: /iniciación a/i })).not.toBeInTheDocument();
    expect(shownDays()).toEqual(wholeWeek);

    await user.click(screen.getByRole('button', { name: 'Todas' }));
    expect(await screen.findAllByRole('button', { name: /iniciación a/i })).toHaveLength(2);
  });

  it('hides a classroom on a day it has no groups, and the day when no classroom has any', async () => {
    api({
      'GET /api/admin/groups': [
        200,
        {
          items: [
            GROUP,
            { ...GROUP, id: 'g2', name: 'Avanzado B', days: ['mon'], classroom: 'peon' },
          ],
        },
      ],
    });
    renderApp('/panel/clases');

    const schedule = await screen.findByRole('region', { name: 'Horario semanal' });
    await within(schedule).findAllByRole('button', { name: /iniciación a/i });
    const monday = within(schedule).getByRole('group', { name: 'Lunes' });
    expect(within(monday).getByText('Alfil')).toBeVisible();
    expect(within(monday).getByText('Peón')).toBeVisible();
    expect(within(monday).queryByText('Caballo')).not.toBeInTheDocument();
    const wednesday = within(schedule).getByRole('group', { name: 'Miércoles' });
    expect(within(wednesday).getByText('Alfil')).toBeVisible();
    expect(within(wednesday).queryByText('Peón')).not.toBeInTheDocument();
    expect(within(schedule).queryByRole('group', { name: 'Martes' })).not.toBeInTheDocument();
  });

  it('shows groups that share a classroom side by side under a single classroom heading', async () => {
    api({
      'GET /api/admin/groups': [
        200,
        {
          items: [
            GROUP,
            { ...GROUP, id: 'g2', name: 'Intermedio B', days: ['mon'], start: '17:30' },
            { ...GROUP, id: 'g3', name: 'Rey A', days: ['mon'], classroom: 'rey' },
          ],
        },
      ],
    });
    renderApp('/panel/clases');

    const schedule = await screen.findByRole('region', { name: 'Horario semanal' });
    const monday = within(schedule).getByRole('group', { name: 'Lunes' });
    const [first] = await within(monday).findAllByRole('button', { name: /iniciación a/i });
    const second = within(monday).getByRole('button', { name: /intermedio b/i });
    const rey = within(monday).getByRole('button', { name: /rey a/i });
    expect(within(monday).getAllByText('Alfil')).toHaveLength(1);
    expect(within(monday).getByText('Alfil')).toHaveStyle({ gridColumn: '1 / span 2' });
    expect(within(monday).getByText('Rey Batallador')).toHaveStyle({ gridColumn: '3 / span 1' });
    expect(first).toHaveStyle({ gridColumn: '1' });
    expect(second).toHaveStyle({ gridColumn: '2' });
    expect(rey).toHaveStyle({ gridColumn: '3' });
    expect(screen.getByRole('button', { name: 'Aula Rey Batallador' })).toBeVisible();
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

  it('sorts the groups from the headers, by name unless another column is chosen', async () => {
    const user = userEvent.setup();
    const avanzado = {
      ...GROUP,
      id: 'g2',
      name: 'Avanzado',
      level: 'advanced',
      days: ['tue'],
      start: '16:00',
      slotLabel: 'Mar · 16:00–17:00',
      classroom: 'caballo',
      occupied: 3,
    };
    api({ 'GET /api/admin/groups': [200, { items: [GROUP, avanzado] }] });
    renderApp('/panel/clases');
    await user.click(await screen.findByRole('tab', { name: 'Grupos' }));
    const table = await screen.findByRole('table', { name: 'Grupos' });
    const names = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

    expect(names()).toEqual(['Avanzado', 'Iniciación A']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por nivel' }));
    expect(names()).toEqual(['Avanzado', 'Iniciación A']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por nivel' }));
    expect(names()).toEqual(['Iniciación A', 'Avanzado']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por horario' }));
    expect(names()).toEqual(['Iniciación A', 'Avanzado']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por ocupación' }));
    expect(names()).toEqual(['Avanzado', 'Iniciación A']);
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

  it('asks to confirm a classroom clash and creates the group sharing the classroom', async () => {
    const user = userEvent.setup();
    const fetchSpy = api({
      'POST /api/admin/groups': [
        [
          409,
          {
            error: {
              code: 'classroom_conflict',
              message: 'Coincide en el aula Alfil con «Iniciación A» (Lun y Mié · 17:00–18:00).',
              details: {
                groupId: 'g1',
                groupName: 'Iniciación A',
                slotLabel: 'Lun y Mié · 17:00–18:00',
              },
            },
          },
        ],
        [201, { id: 'g9' }],
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
      'Coincide en el aula Alfil con «Iniciación A» (Lun y Mié · 17:00–18:00). ¿Compartir el aula igualmente?',
    );
    const posts = () =>
      fetchSpy.mock.calls
        .filter(([url, init]) => url === '/api/admin/groups' && init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(posts()[0]).toEqual({
      name: 'Iniciación F',
      level: 'beginner',
      teacherId: 't1',
      days: ['mon'],
      start: '17:00',
      end: '18:00',
      classroom: 'alfil',
      capacity: 10,
    });

    await user.click(within(dialog).getByRole('button', { name: 'Crear igualmente' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(posts()[1]).toMatchObject({ name: 'Iniciación F', confirmClassroomShare: true });
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
    renderApp('/panel/profesores?pestana=equipo');

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
    renderApp('/panel/profesores?pestana=equipo');

    expect(await screen.findByText('16,00 €/h')).toBeInTheDocument();
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

  it('shows the attendance of a group in a month and sorts it by percentage', async () => {
    const user = userEvent.setup();
    api({ [`GET /api/admin/attendance/groups/g1?month=${MONTH}`]: [200, ATTENDANCE] });
    renderApp('/panel/clases?pestana=asistencia');

    expect(screen.queryByRole('tab', { name: 'Profesores' })).not.toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Asistencia de Iniciación A/ });
    expect(within(table).getByText('Festivo')).toBeInTheDocument();
    expect(within(table).getByLabelText(/Ana Ruiz Gil faltó el 07/)).toHaveTextContent('✗');
    const rows = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => (r as HTMLTableRowElement).cells[0]?.textContent);
    expect(rows()).toEqual(['Ana Ruiz Gil', 'Luis Mora Gil', 'Pablo Gil Ruiz']);
    const byPercent = within(table).getByRole('button', {
      name: 'Ordenar por porcentaje de asistencia',
    });
    // Sin clases con lista, al final en los dos sentidos.
    await user.click(byPercent);
    expect(rows()).toEqual(['Pablo Gil Ruiz', 'Ana Ruiz Gil', 'Luis Mora Gil']);
    await user.click(byPercent);
    expect(rows()).toEqual(['Ana Ruiz Gil', 'Pablo Gil Ruiz', 'Luis Mora Gil']);
    await user.click(within(table).getByRole('button', { name: 'Ordenar por alumno' }));
    await user.click(within(table).getByRole('button', { name: 'Ordenar por alumno' }));
    expect(rows()).toEqual(['Pablo Gil Ruiz', 'Luis Mora Gil', 'Ana Ruiz Gil']);
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(within(table).getByText('50 %')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Ana Ruiz Gil' })).toHaveAttribute(
      'href',
      expect.stringMatching(/[?&]ficha=s1$/),
    );
  });

  it('shows the comments of the month under the attendance and adds one from administration', async () => {
    const user = userEvent.setup();
    const comment = (overrides: Record<string, unknown>) => ({
      id: 'c1',
      groupId: 'g1',
      groupName: 'Iniciación A',
      date: `${MONTH}-05`,
      studentId: null,
      studentName: null,
      text: 'Hoy hemos dado mates de torres',
      author: 'Lucía Moreno Gil',
      authorTeacherId: 't1',
      writtenAt: `${MONTH}-05T17:00:00.000Z`,
      ...overrides,
    });
    const spy = api({
      [`GET /api/admin/attendance/groups/g1?month=${MONTH}`]: [200, ATTENDANCE],
      [`GET /api/admin/attendance/groups/g1/comments?month=${MONTH}`]: [
        200,
        {
          items: [
            comment({}),
            comment({
              id: 'c2',
              date: `${MONTH}-07`,
              studentId: 's2',
              studentName: 'Pablo Gil Ruiz',
              text: 'Ha roto un reloj',
            }),
            comment({
              id: 'c3',
              date: `${MONTH}-07`,
              studentId: 's1',
              studentName: 'Ana Ruiz Gil',
              text: 'Ha llegado a mitad de clase',
            }),
          ],
        },
      ],
      'POST /api/admin/attendance/groups/g1/comments': [201, { id: 'c4' }],
    });
    renderApp('/panel/clases?pestana=asistencia');

    const general = await screen.findByRole('list', { name: 'Comentarios de la clase' });
    expect(general).toHaveTextContent('Hoy hemos dado mates de torres');
    expect(general).toHaveTextContent(
      `05/${MONTH.slice(5)}/${MONTH.slice(0, 4)} · Lucía Moreno Gil`,
    );
    const ofStudents = () => screen.getByRole('list', { name: 'Comentarios de los alumnos' });
    expect(ofStudents()).toHaveTextContent('Ha roto un reloj');
    expect(ofStudents()).toHaveTextContent('Ha llegado a mitad de clase');
    expect(within(ofStudents()).getByRole('link', { name: 'Pablo Gil Ruiz' })).toHaveAttribute(
      'href',
      expect.stringMatching(/[?&]ficha=s2$/),
    );
    const who = screen.getByRole('combobox', { name: 'Alumno' });
    await user.selectOptions(who, 'Pablo Gil Ruiz');
    expect(ofStudents()).toHaveTextContent('Ha roto un reloj');
    expect(ofStudents()).not.toHaveTextContent('Ha llegado a mitad de clase');
    await user.selectOptions(who, 'Luis Mora Gil');
    expect(screen.getByText('Luis Mora Gil no tiene comentarios este mes.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Añadir comentario' }));
    const day = screen.getByRole('combobox', { name: 'Día de la clase' });
    expect(
      within(day)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      `14/${MONTH.slice(5)}/${MONTH.slice(0, 4)}`,
      `07/${MONTH.slice(5)}/${MONTH.slice(0, 4)}`,
      `05/${MONTH.slice(5)}/${MONTH.slice(0, 4)}`,
    ]);
    await user.selectOptions(day, `07/${MONTH.slice(5)}/${MONTH.slice(0, 4)}`);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sobre' }), 'Ana Ruiz Gil');
    await user.type(screen.getByLabelText('Comentario'), 'Llamar a su familia');
    await user.click(screen.getByRole('button', { name: 'Guardar comentario' }));
    await waitFor(() =>
      expect(
        spy.mock.calls.find(
          ([u, init]) =>
            u === '/api/admin/attendance/groups/g1/comments' && init?.method === 'POST',
        )?.[1]?.body,
      ).toBe(JSON.stringify({ date: `${MONTH}-07`, studentId: 's1', text: 'Llamar a su familia' })),
    );
  });

  it('marks with an asterisk who came to the group without being part of it', async () => {
    api({
      [`GET /api/admin/attendance/groups/g1?month=${MONTH}`]: [
        200,
        {
          ...ATTENDANCE,
          students: [
            {
              id: 's4',
              name: 'Sara Gil Mora',
              marks: [null, 'special', null, null],
              attended: 0,
              classes: 0,
              member: false,
            },
          ],
        },
      ],
    });
    renderApp('/panel/clases?pestana=asistencia');

    const table = await screen.findByRole('table', { name: /Asistencia de Iniciación A/ });
    expect(
      within(table).getByLabelText(/Sara Gil Mora vino en asistencia especial el 07/),
    ).toHaveTextContent('✓*');
    await userEvent.click(
      within(table).getByRole('button', { name: 'Asistencia especial de Sara Gil Mora' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Asistencia especial de Sara Gil Mora' }),
    ).toHaveTextContent(
      `No es de este grupo: vino en asistencia especial el 07/${MONTH.slice(5)}.`,
    );
  });

  it('shows the attendance of the group in its sheet, under the enrolment', async () => {
    api({
      'GET /api/admin/groups/g1': [200, { ...GROUP, students: [] }],
      [`GET /api/admin/attendance/groups/g1?month=${MONTH}`]: [200, ATTENDANCE],
      [`GET /api/admin/attendance/groups/g1?month=${shiftMonth(MONTH, -1)}`]: [
        200,
        { ...ATTENDANCE, days: [], students: [] },
      ],
      [`GET /api/admin/attendance/groups/g1?month=${shiftMonth(MONTH, -2)}`]: [
        200,
        { ...ATTENDANCE, students: [] },
      ],
    });
    renderApp('/panel/clases?grupo=g1');

    const sheet = await screen.findByRole('dialog', { name: 'Iniciación A' });
    expect(within(sheet).getByRole('heading', { name: 'Asistencia' })).toBeInTheDocument();
    expect(
      await within(sheet).findByRole('table', { name: /Asistencia de Iniciación A/ }),
    ).toHaveTextContent('100 %');
    // El mes anterior: sin clases; el otro, sin nadie inscrito; y si falla, se dice.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mes anterior' }));
    expect(await within(sheet).findByText(/aún no ha habido clases/)).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mes anterior' }));
    expect(await within(sheet).findByText('Nadie estaba inscrito esos días.')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mes anterior' }));
    expect(
      await within(sheet).findByText('No se ha podido cargar la asistencia.'),
    ).toBeInTheDocument();
  });

  it('shows at the bottom of the group sheet who joined and left it, and why', async () => {
    api({
      'GET /api/admin/groups/g1': [200, { ...GROUP, students: [] }],
      'GET /api/admin/groups/g1/history': [
        200,
        {
          items: [
            {
              date: '2026-10-20',
              movement: 'left',
              studentId: 's2',
              studentName: 'Pablo Gil Ruiz',
              reason: 'moved_to',
              otherGroup: 'Avanzado C',
            },
            {
              date: '2026-10-10',
              movement: 'left',
              studentId: 's3',
              studentName: 'Luis Mora Gil',
              reason: 'withdrawn',
              otherGroup: null,
            },
            {
              date: '2026-10-01',
              movement: 'joined',
              studentId: 's2',
              studentName: 'Pablo Gil Ruiz',
              reason: 'moved_from',
              otherGroup: 'Intermedio B',
            },
            {
              date: '2026-09-15',
              movement: 'joined',
              studentId: 's1',
              studentName: 'Ana Ruiz Gil',
              reason: null,
              otherGroup: null,
            },
          ],
        },
      ],
    });
    renderApp('/panel/clases?grupo=g1');

    const sheet = await screen.findByRole('dialog', { name: 'Iniciación A' });
    const history = within(sheet).getByRole('region', { name: 'Historial' });
    const rows = await within(history).findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '20/10/2026Sale · Pablo Gil Ruiz · pasa a Avanzado C',
      '10/10/2026Sale · Luis Mora Gil · baja del club',
      '01/10/2026Entra · Pablo Gil Ruiz · viene de Intermedio B',
      '15/09/2026Entra · Ana Ruiz Gil',
    ]);
    expect(within(history).getByRole('link', { name: 'Ana Ruiz Gil' })).toBeInTheDocument();
    // Es lo último de la ficha.
    const sections = within(sheet).getAllByRole('heading', { level: 3 });
    expect(sections.at(-1)).toHaveTextContent('Historial');
  });

  it('says so when nobody has joined or left the group yet', async () => {
    api({
      'GET /api/admin/groups/g1': [200, { ...GROUP, students: [] }],
      'GET /api/admin/groups/g1/history': [200, { items: [] }],
    });
    renderApp('/panel/clases?grupo=g1');

    const sheet = await screen.findByRole('dialog', { name: 'Iniciación A' });
    expect(
      await within(sheet).findByText('Todavía no ha entrado ni salido nadie de este grupo.'),
    ).toBeInTheDocument();
  });

  it('lets superadministration make a group a special class after confirming it', async () => {
    const user = userEvent.setup();
    const spy = api({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/groups/g1': [
        200,
        {
          ...GROUP,
          specialPriceCents: null,
          students: [{ id: 's1', fullName: 'Ana Ruiz Gil', age: 12, attendanceLabel: null }],
        },
      ],
      'PUT /api/admin/billing/groups/g1/price': [204],
    });
    renderApp('/panel/clases?grupo=g1');

    const sheet = await screen.findByRole('dialog', { name: 'Iniciación A' });
    expect(within(sheet).getByText('Sin precio especial: se paga por horas')).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText('Precio de clase especial (€ al mes)'), '50');
    await user.click(within(sheet).getByRole('button', { name: 'Guardar precio' }));

    const confirm = await screen.findByRole('dialog', { name: 'Precio de la clase especial' });
    expect(confirm).toHaveTextContent(
      'Los 1 alumnos de «Iniciación A» pagarán 50,00 € al mes por esta clase',
    );
    expect(spy.mock.calls.some(([url]) => url === '/api/admin/billing/groups/g1/price')).toBe(
      false,
    );
    await user.click(within(confirm).getByRole('button', { name: 'Guardar precio' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Precio de la clase especial' }),
      ).not.toBeInTheDocument(),
    );
    const call = spy.mock.calls.find(([url]) => url === '/api/admin/billing/groups/g1/price');
    expect(call?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ monthlyPrice: '50' });
  });

  it('shows the price of a special class to administration without letting it change it', async () => {
    api({
      'GET /api/admin/groups': [200, { items: [{ ...GROUP, specialPriceCents: 5000 }] }],
      'GET /api/admin/groups/g1': [200, { ...GROUP, specialPriceCents: 5000, students: [] }],
    });
    renderApp('/panel/clases?grupo=g1');

    const sheet = await screen.findByRole('dialog', { name: 'Iniciación A' });
    expect(within(sheet).getByText('50,00 € al mes')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Guardar precio' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Quitar precio' })).not.toBeInTheDocument();
  });

  it('opens the attendance of a group in the month of its link', async () => {
    const month = shiftMonth(MONTH, -1);
    api({
      'GET /api/admin/groups/g1': [200, { ...GROUP, students: [] }],
      [`GET /api/admin/attendance/groups/g1?month=${month}`]: [
        200,
        { ...ATTENDANCE, month, days: [{ date: `${month}-06`, status: 'confirmed' }] },
      ],
    });
    renderApp(`/panel/clases?grupo=g1&mes=${month}`);

    const sheet = await screen.findByRole('dialog', { name: 'Iniciación A' });
    expect(
      await within(sheet).findByRole('table', { name: /Asistencia de Iniciación A/ }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole('columnheader', { name: new RegExp(`06/${month.slice(5)}`) }),
    ).toBeInTheDocument();
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
