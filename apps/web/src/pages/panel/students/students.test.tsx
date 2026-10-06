import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const GROUPS = [
  {
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
    occupied: 11,
    occupancyByDay: {},
    customName: true,
    weeklyPlan: 'two_hours',
  },
  {
    id: 'g2',
    name: 'Peques B',
    level: 'beginner',
    teacher: { id: 't1', fullName: 'Lucía Moreno Gil' },
    days: ['tue'],
    start: '16:00',
    end: '17:00',
    slotLabel: 'Mar · 16:00–17:00',
    classroom: 'caballo',
    capacity: 1,
    occupied: 1,
    occupancyByDay: {},
    customName: true,
    weeklyPlan: 'one_hour',
  },
];
const MARTINA = {
  id: 's1',
  fullName: 'Martina López Herrera',
  age: 12,
  status: 'active',
  groups: [{ id: 'g1', name: 'Iniciación A', slotLabel: 'Lun y Mié · 17:00–18:00' }],
  hasSiblings: true,
};
const HUGO = {
  id: 's2',
  fullName: 'Hugo Martín Castillo',
  age: 14,
  status: 'withdrawn',
  groups: [],
  hasSiblings: false,
};
const DETAIL = {
  id: 's1',
  fullName: 'Martina López Herrera',
  birthDate: '2014-03-12',
  age: 12,
  nationalId: '12345678Z',
  contactEmail: 'familia@ejemplo.com',
  guardians: [{ name: 'Rocío Herrera', phone: '612 48 19 30' }],
  ownPhone: null,
  federationLicence: 'AND-20417',
  imageConsent: true,
  missingData: [],
  joinedOn: '2026-09-15',
  withdrawnOn: null,
  status: 'active',
  groups: [
    {
      id: 'g1',
      name: 'Iniciación A',
      slotLabel: 'Lun y Mié · 17:00–18:00',
      teacherName: 'Lucía Moreno Gil',
      classroom: 'alfil',
    },
  ],
  siblings: [{ id: 's3', fullName: 'Pablo López Herrera' }],
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/students/pending-data': [200, { items: [] }],
    'GET /api/admin/groups': [200, { items: GROUPS }],
    'GET /api/admin/teachers': [200, { items: [] }],
    'GET /api/admin/students?filter=all': [200, { items: [MARTINA, HUGO], total: 2 }],
    'GET /api/admin/students?filter=withdrawn': [200, { items: [HUGO], total: 2 }],
    'GET /api/admin/students?filter=all&q=lopez': [200, { items: [MARTINA], total: 2 }],
    'GET /api/admin/students/s1': [200, DETAIL],
    ...extra,
  });
}

function postBody(spy: ReturnType<typeof api>, url: string) {
  const call = spy.mock.calls.find(([u, init]) => u === url && init?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body));
}

describe('Alumnos', () => {
  it('should list students with their groups and status, and filter them', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/alumnos');

    expect(await screen.findByRole('button', { name: /martina lópez herrera/i })).toHaveTextContent(
      'Iniciación A',
    );
    expect(screen.getByText('2 de 2 mostrados')).toBeVisible();
    expect(screen.getByRole('button', { name: /hugo martín castillo/i })).toHaveTextContent(
      'De baja',
    );

    await user.click(screen.getByRole('button', { name: 'De baja' }));
    expect(await screen.findByText('1 de 2 mostrados')).toBeVisible();
    expect(screen.queryByRole('button', { name: /martina/i })).not.toBeInTheDocument();
  });

  it('should search by name after a short pause', async () => {
    const user = userEvent.setup();
    const spy = api();
    renderApp('/panel/alumnos');

    await user.type(await screen.findByRole('searchbox', { name: 'Buscar alumnos' }), 'lopez');

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('/api/admin/students?filter=all&q=lopez', expect.anything()),
    );
    expect(await screen.findByText('1 de 2 mostrados')).toBeVisible();
  });

  it('should open the student card with personal data, contact and groups', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/alumnos');

    await user.click(await screen.findByRole('button', { name: /martina lópez herrera/i }));

    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    expect(within(card).getByText('12/03/2014')).toBeVisible();
    expect(within(card).getByText('Sí · AND-20417')).toBeVisible();
    expect(within(card).getByRole('link', { name: '612 48 19 30' })).toHaveAttribute(
      'href',
      'tel:612481930',
    );
    expect(within(card).getByText('Pablo López Herrera')).toBeVisible();
    expect(within(card).getByText('Aula Alfil · Lucía Moreno Gil')).toBeVisible();
  });

  it('should show what the student pays and why, the points and the history on the card', async () => {
    const user = userEvent.setup();
    const account = {
      preferredPlan: 'monthly',
      member: false,
      privateRate: null,
      points: 2,
      suggestedMonths: 1,
      remainingMonths: 9,
      weeklyHours: 2,
      monthlyFeeCents: 4050,
      familyDiscount: true,
      hasPrivateLessons: false,
      membershipPaid: false,
      membershipFeeCents: 5000,
    };
    const spy = api({
      'GET /api/admin/billing/accounts/s1': [
        [200, account],
        [200, { ...account, points: 3 }],
      ],
      'GET /api/admin/billing/payments?studentId=s1': [
        200,
        {
          items: [
            {
              id: 'p1',
              receiptNumber: 'R-2026-0001',
              paidOn: '2026-09-03',
              studentId: 's1',
              studentName: 'Martina López Herrera',
              kind: 'monthly',
              concept: 'Septiembre 2026',
              method: 'cash',
              totalCents: 4050,
              invoiceNumber: null,
            },
          ],
        },
      ],
      'POST /api/admin/billing/accounts/s1/points': [200, { points: 3 }],
    });
    renderApp('/panel/alumnos/s1');

    const history = await screen.findByRole('list', { name: 'Historial de cobros' });
    expect(within(history).getByText('Septiembre 2026')).toBeInTheDocument();
    expect(within(history).getByText('40,50 €')).toBeInTheDocument();
    expect(screen.getByText('2 h semanales')).toBeInTheDocument();
    expect(screen.getByText('Sí, por hermanos')).toBeInTheDocument();
    expect(screen.getByText('Pendiente · 50 €')).toBeInTheDocument();
    expect(screen.queryByLabelText('Forma de pago preferida')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Socio del club' })).not.toBeInTheDocument();
    expect(screen.getByText('Puntos:')).toHaveTextContent('Puntos: 2');

    await user.click(screen.getByRole('button', { name: 'Sumar un punto' }));
    expect(postBody(spy, '/api/admin/billing/accounts/s1/points')).toEqual({ delta: 1 });
    expect(await screen.findByText('Puntos:')).toHaveTextContent('Puntos: 3');
  });

  it('should keep «Alumnos» highlighted while a student card is open', async () => {
    api();
    renderApp('/panel/alumnos/s1');

    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByRole('link', { name: /Alumnos/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('should register with only a name, announcing what stays pending and the member without classes', async () => {
    const user = userEvent.setup();
    const spy = api({ 'POST /api/admin/students': [201, { id: 's9' }] });
    renderApp('/panel/alumnos');

    await user.click(await screen.findByRole('button', { name: 'Nuevo alumno' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo alumno' });
    await user.type(within(dialog).getByLabelText('Nombre y apellidos'), 'Socio Sin Clases');
    expect(dialog).toHaveTextContent('pendiente: fecha de nacimiento, tutor y email');
    expect(dialog).toHaveTextContent('se dará de alta como socio sin clases');
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));

    const sent = spy.mock.calls.find(
      ([url, init]) => url === '/api/admin/students' && init?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual(
      expect.objectContaining({
        fullName: 'Socio Sin Clases',
        birthDate: null,
        guardians: [],
        ownPhone: null,
        enrolments: [],
      }),
    );
  });

  it('should list the students with pending data grouped by what is missing', async () => {
    api({
      'GET /api/admin/students/pending-data': [
        200,
        {
          items: [
            { id: 's1', fullName: 'Martina López Herrera', missing: ['email'] },
            { id: 's2', fullName: 'Pepe Sin Datos', missing: ['birth_date', 'guardian', 'email'] },
          ],
        },
      ],
    });
    renderApp('/panel/alumnos/pendientes');

    expect(await screen.findByRole('heading', { name: 'Datos pendientes' })).toBeVisible();
    expect(await screen.findByText('2 alumnos con datos por completar')).toBeVisible();
    const noEmail = within(screen.getByRole('list', { name: 'Sin email' }));
    expect(noEmail.getAllByRole('listitem')).toHaveLength(2);
    const noGuardian = within(screen.getByRole('list', { name: 'Sin tutor' }));
    expect(noGuardian.getByText('Pepe Sin Datos')).toBeVisible();
    expect(noGuardian.getByText('Pendiente: fecha de nacimiento, tutor y email')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Sin teléfono' })).not.toBeInTheDocument();
  });

  it('should enrol a student in a group with a special schedule (some days, part of the time)', async () => {
    const user = userEvent.setup();
    const spy = api({ 'POST /api/admin/students/s1/enrolments': [204] });
    renderApp('/panel/alumnos/s1');

    const panel = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    await user.click(within(panel).getByRole('button', { name: 'Añadir grupo' }));
    const dialog = screen.getByRole('dialog', { name: 'Añadir grupo' });
    await user.selectOptions(within(dialog).getByLabelText('Grupo'), 'g2');
    await user.click(within(dialog).getByRole('switch', { name: 'Horario especial' }));
    await user.selectOptions(within(dialog).getByLabelText('Empieza'), '16:30');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));

    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students/s1/enrolments')).toEqual({
        groupId: 'g2',
        confirmOverCapacity: false,
        attendance: { days: ['tue'], start: '16:30', end: '17:00' },
      }),
    );
  });

  it('should register a student and confirm when the group is full', async () => {
    const user = userEvent.setup();
    const spy = api({
      'POST /api/admin/students': [
        [
          409,
          {
            error: {
              code: 'group_full',
              message: 'El grupo está completo (1/1).',
              details: { occupied: 1, capacity: 1 },
            },
          },
        ],
        [201, { id: 's9' }],
      ],
      'GET /api/admin/students/s9': [
        200,
        { ...DETAIL, id: 's9', fullName: 'Lucía Fernández Ortiz' },
      ],
      'POST /api/admin/groups/resolve-schedule': [
        200,
        {
          enrolments: [
            {
              groupId: 'g2',
              groupName: 'Peques B',
              slotLabel: 'Mar · 16:00–17:00',
              attendance: null,
              attendanceLabel: null,
            },
          ],
          uncovered: [],
          choices: [],
          problems: [],
        },
      ],
    });
    renderApp('/panel/alumnos');

    await user.click(await screen.findByRole('button', { name: 'Nuevo alumno' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo alumno' });
    await user.type(within(dialog).getByLabelText('Nombre y apellidos'), 'Lucía Fernández Ortiz');
    await user.selectOptions(within(dialog).getByLabelText('Día'), '7');
    await user.selectOptions(within(dialog).getByLabelText('Mes'), 'marzo');
    await user.selectOptions(within(dialog).getByLabelText('Año'), '2015');
    await user.type(within(dialog).getByLabelText('Tutor 1'), 'Carmen Ortiz');
    await user.type(within(dialog).getByLabelText('Teléfono tutor 1'), '612000111');
    // El horario se traduce a grupos: martes 16:00–17:00 es «Peques B».
    await user.click(within(dialog).getByRole('button', { name: 'Añadir horario' }));
    const block = within(within(dialog).getByRole('group', { name: 'Horario 1' }));
    await user.selectOptions(block.getByLabelText('Día'), 'tue');
    await user.selectOptions(block.getByLabelText('Empieza'), '16:00');
    await user.selectOptions(block.getByLabelText('Termina'), '17:00');
    expect(await within(dialog).findByText('Peques B')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));

    const confirm = await screen.findByRole('dialog', { name: 'Grupo completo' });
    expect(confirm).toHaveTextContent('El grupo está completo (1/1). ¿Inscribir igualmente?');
    await user.click(within(confirm).getByRole('button', { name: 'Inscribir igualmente' }));

    expect(await screen.findByRole('dialog', { name: 'Lucía Fernández Ortiz' })).toBeVisible();
    const lastPost = spy.mock.calls
      .filter(([u, init]) => u === '/api/admin/students' && init?.method === 'POST')
      .at(-1);
    expect(JSON.parse(String(lastPost?.[1]?.body))).toMatchObject({
      fullName: 'Lucía Fernández Ortiz',
      birthDate: '2015-03-07',
      guardians: [{ name: 'Carmen Ortiz', phone: '612000111' }],
      enrolments: [{ groupId: 'g2', attendance: null }],
      confirmOverCapacity: true,
    });
  });

  it('should withdraw a student with a date', async () => {
    const user = userEvent.setup();
    const spy = api({ 'POST /api/admin/students/s1/withdrawal': [204] });
    renderApp('/panel/alumnos/s1');

    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    const dialog = screen.getByRole('dialog', { name: /dar de baja a martina/i });
    await user.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        '/api/admin/students/s1/withdrawal',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(postBody(spy, '/api/admin/students/s1/withdrawal').date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should explain why the only group cannot be removed', async () => {
    const user = userEvent.setup();
    api({
      'DELETE /api/admin/students/s1/enrolments/g1': [
        409,
        {
          error: {
            code: 'last_enrolment',
            message:
              'Es su único grupo: para dejarlo, da de baja al alumno o muévelo a otro grupo.',
          },
        },
      ],
    });
    renderApp('/panel/alumnos/s1');

    await user.click(await screen.findByRole('button', { name: 'Quitar de Iniciación A' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Es su único grupo');
  });

  it('should move a student to another group', async () => {
    const user = userEvent.setup();
    const spy = api({ 'POST /api/admin/students/s1/enrolments/g1/move': [204] });
    renderApp('/panel/alumnos/s1');

    await user.click(await screen.findByRole('button', { name: 'Mover de Iniciación A' }));
    const dialog = screen.getByRole('dialog', { name: 'Mover de Iniciación A' });
    await user.selectOptions(within(dialog).getByLabelText('Grupo'), 'g2');
    await user.click(within(dialog).getByRole('button', { name: 'Mover' }));

    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students/s1/enrolments/g1/move')).toEqual({
        toGroupId: 'g2',
        confirmOverCapacity: false,
      }),
    );
  });
});

describe('ficha de grupo', () => {
  it('should list enrolled students and enrol another from the group', async () => {
    const user = userEvent.setup();
    const spy = api({
      'GET /api/admin/groups/g1': [
        200,
        { ...GROUPS[0], students: [{ id: 's1', fullName: 'Martina López Herrera', age: 12 }] },
      ],
      'GET /api/admin/students?filter=active': [
        200,
        {
          items: [
            MARTINA,
            { ...HUGO, status: 'active', id: 's4', fullName: 'Nerea Villar Campos' },
          ],
          total: 2,
        },
      ],
      'POST /api/admin/students/s4/enrolments': [204],
    });
    renderApp('/panel/clases');

    const [block] = await screen.findAllByRole('button', { name: /iniciación a, lun y mié/i });
    if (!block) throw new Error('Falta el bloque del grupo');
    await user.click(block);
    const panel = await screen.findByRole('dialog', { name: 'Iniciación A' });
    expect(within(panel).getByText('Martina López Herrera')).toBeVisible();

    await user.type(within(panel).getByLabelText('Buscar alumno'), 'villar');
    expect(
      within(panel).getByRole('option', { name: /Elige un alumno \(1\)/ }),
    ).toBeInTheDocument();
    await user.selectOptions(within(panel).getByLabelText('Inscribir alumno'), 's4');
    await user.click(within(panel).getByRole('button', { name: 'Inscribir' }));

    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students/s4/enrolments')).toEqual({
        groupId: 'g1',
        confirmOverCapacity: false,
        attendance: null,
      }),
    );
  });
});
