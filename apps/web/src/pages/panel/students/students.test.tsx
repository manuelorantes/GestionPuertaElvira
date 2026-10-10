import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth, monthLabel, shiftMonth } from '@/features/billing/money';
import { todayIso } from '@/features/students/format';
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
  memberNumber: 7,
  fullName: 'Martina López Herrera',
  age: 12,
  status: 'active',
  groups: [{ id: 'g1', name: 'Iniciación A', slotLabel: 'Lun y Mié · 17:00–18:00' }],
  hasSiblings: true,
};
const HUGO = {
  id: 's2',
  memberNumber: 12,
  fullName: 'Hugo Martín Castillo',
  age: 14,
  status: 'withdrawn',
  groups: [],
  hasSiblings: false,
};
const DETAIL = {
  id: 's1',
  memberNumber: 7,
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
  membership: [{ joinedOn: '2026-09-15', withdrawnOn: null }],
  groups: [
    {
      id: 'g1',
      name: 'Iniciación A',
      slotLabel: 'Lun y Mié · 17:00–18:00',
      teacherName: 'Lucía Moreno Gil',
      classroom: 'alfil',
      since: '2026-09-15',
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
    'GET /api/admin/students?filter=active': [200, { items: [MARTINA, HUGO], total: 2 }],
    'GET /api/admin/students?filter=withdrawn': [200, { items: [HUGO], total: 2 }],
    'GET /api/admin/students?filter=active&q=lopez': [200, { items: [MARTINA], total: 2 }],
    'GET /api/admin/students/s1': [200, DETAIL],
    ...extra,
  });
}

function postBodyFor(spy: ReturnType<typeof api>, method: string, url: string) {
  const call = spy.mock.calls.find(([u, init]) => u === url && init?.method === method);
  return JSON.parse(String(call?.[1]?.body ?? 'null')) as unknown;
}

function postBody(spy: ReturnType<typeof api>, url: string) {
  const call = spy.mock.calls.find(([u, init]) => u === url && init?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body));
}

describe('Alumnos', () => {
  it('sorts the list by member number or alphabetically from the headers', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/alumnos');

    const names = async () =>
      (await screen.findAllByRole('button', { name: /mart/i }))
        .map((b) => b.textContent ?? '')
        .filter((t) => /Martina|Hugo/.test(t))
        .map((t) => (t.includes('Martina') ? 'Martina' : 'Hugo'));
    expect(await names()).toEqual(['Hugo', 'Martina']);

    await user.click(screen.getByRole('button', { name: 'Ordenar por número' }));
    expect(await names()).toEqual(['Martina', 'Hugo']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por número' }));
    expect(await names()).toEqual(['Hugo', 'Martina']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por nombre' }));
    expect(await names()).toEqual(['Hugo', 'Martina']);
  });

  it('should list students with their groups and status, and filter them', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/alumnos');

    expect(await screen.findByRole('button', { name: /martina lópez herrera/i })).toHaveTextContent(
      'Iniciación A',
    );
    expect(screen.getByText('2 de 2 mostrados')).toBeVisible();
    expect(screen.getByLabelText('Número de socio 7')).toHaveTextContent('7');
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
      expect(spy).toHaveBeenCalledWith(
        '/api/admin/students?filter=active&q=lopez',
        expect.anything(),
      ),
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
    expect(within(card).getByText('Socio nº 7')).toBeVisible();
    expect(within(card).getByText('Sí · AND-20417')).toBeVisible();
    expect(within(card).getByRole('link', { name: '612 48 19 30' })).toHaveAttribute(
      'href',
      'tel:612481930',
    );
    // Contacto y familia directa, en secciones distintas.
    expect(within(card).getByRole('heading', { name: 'Contacto' })).toBeInTheDocument();
    expect(
      within(card).getByRole('heading', { name: 'Familia directa en el club' }),
    ).toBeInTheDocument();
    expect(within(card).getByText('Pablo López Herrera')).toBeVisible();
    expect(within(card).getByText('Aula Alfil · Lucía Moreno Gil')).toBeVisible();
  });

  it('should show the attendance of the season on the card', async () => {
    const user = userEvent.setup();
    api({
      'GET /api/admin/students/s1/attendance': [
        200,
        {
          season: 2026,
          classes: 8,
          attended: 7,
          absences: [{ date: '2026-10-06', label: 'Iniciación A' }],
          specials: [{ date: '2026-10-08', label: 'Avanzado B' }],
        },
      ],
    });
    renderApp('/panel/alumnos');

    await user.click(await screen.findByRole('button', { name: /martina lópez herrera/i }));
    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    expect(await within(card).findByText(/Vino a/)).toHaveTextContent(
      'Vino a 7 de 8 clases (88 %)',
    );
    expect(within(card).getByRole('list', { name: 'Faltas' })).toHaveTextContent(
      'Faltó el 06/10/2026 · Iniciación A',
    );
    // La asistencia especial (otra clase), aparte.
    expect(within(card).getByRole('list', { name: 'Asistencia especial' })).toHaveTextContent(
      'Vino el 08/10/2026 · Avanzado B',
    );
  });

  it('should change since when the student is in a group from their sheet', async () => {
    const user = userEvent.setup();
    const spy = api({ 'PUT /api/admin/students/s1/enrolments/g1/start': [204] });
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    expect(await within(card).findByText('En el grupo desde 15/09/2026')).toBeVisible();
    await user.click(
      within(card).getByRole('button', { name: 'Desde cuándo está en Iniciación A' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Desde cuándo está en Iniciación A' });
    await user.selectOptions(within(dialog).getByLabelText('Día'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(postBodyFor(spy, 'PUT', '/api/admin/students/s1/enrolments/g1/start')).toEqual({
        from: '2026-09-01',
      }),
    );
  });

  it('should join a withdrawn student again in a group and show their periods', async () => {
    const user = userEvent.setup();
    const WITHDRAWN = {
      ...DETAIL,
      status: 'withdrawn',
      withdrawnOn: '2026-10-02',
      groups: [],
      membership: [{ joinedOn: '2026-09-15', withdrawnOn: '2026-10-02' }],
    };
    const REJOINED = {
      ...DETAIL,
      joinedOn: '2026-11-15',
      membership: [
        { joinedOn: '2026-09-15', withdrawnOn: '2026-10-02' },
        { joinedOn: '2026-11-15', withdrawnOn: null },
      ],
    };
    const spy = api({
      'GET /api/admin/students/s1': [
        [200, WITHDRAWN],
        [200, REJOINED],
      ],
      'POST /api/admin/students/s1/rejoin': [204],
    });
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    expect(within(card).queryByRole('button', { name: /Dar de baja/ })).not.toBeInTheDocument();
    await user.click(await within(card).findByRole('button', { name: /Dar de alta de nuevo/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Dar de alta de nuevo a Martina' });
    await user.click(within(dialog).getByRole('checkbox', { name: /Peques B/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));

    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students/s1/rejoin')).toEqual({
        date: todayIso(),
        groupIds: ['g2'],
        confirmOverCapacity: false,
      }),
    );
    expect(await within(card).findByText('Última alta en el club')).toBeVisible();
    expect(within(card).getByText('Última baja en el club')).toBeVisible();
    expect(within(card).getByRole('list', { name: 'Altas y bajas' })).toHaveTextContent(
      'Desde el 15/11/2026Del 15/09/2026 al 02/10/2026',
    );
  });

  it('should change the join date from «Editar»', async () => {
    const user = userEvent.setup();
    const spy = api({
      'PUT /api/admin/students/s1/joined-on': [204],
      'PUT /api/admin/students/s1': [204],
    });
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    await user.click(await within(card).findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar alumno' });
    const joined = within(within(dialog).getByRole('group', { name: 'Fecha de alta' }));
    await user.selectOptions(joined.getByLabelText('Día'), '1');
    await user.click(within(dialog).getByRole('button', { name: /Guardar/ }));

    await waitFor(() =>
      expect(postBodyFor(spy, 'PUT', '/api/admin/students/s1/joined-on')).toEqual({
        date: '2026-09-01',
      }),
    );
  });

  it('should show the comments of their classes at the bottom of the card, newest first', async () => {
    const user = userEvent.setup();
    api({
      'GET /api/admin/students/s1/class-comments': [
        200,
        {
          items: [
            {
              id: 'c2',
              groupId: 'g1',
              groupName: 'Iniciación A',
              date: '2026-10-13',
              studentId: 's1',
              studentName: 'Martina López Herrera',
              text: 'Ha llegado a mitad de clase',
              author: 'Lucía Moreno Gil',
              authorTeacherId: 't1',
              writtenAt: '2026-10-13T16:10:00.000Z',
            },
            {
              id: 'c1',
              groupId: 'g1',
              groupName: 'Iniciación A',
              date: '2026-10-06',
              studentId: 's1',
              studentName: 'Martina López Herrera',
              text: 'Ha roto un reloj',
              author: 'Junta Pruebas',
              authorTeacherId: null,
              writtenAt: '2026-10-06T16:10:00.000Z',
            },
          ],
        },
      ],
    });
    renderApp('/panel/alumnos');

    await user.click(await screen.findByRole('button', { name: /martina lópez herrera/i }));
    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    const list = await within(card).findByRole('list', { name: 'Comentarios de las clases' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining(
        'Ha llegado a mitad de clase13/10/2026 · Iniciación A · Lucía Moreno Gil',
      ),
      expect.stringContaining('Ha roto un reloj06/10/2026 · Iniciación A · Junta Pruebas'),
    ]);
  });

  it('should show what the student pays and why, the points and the history on the card', async () => {
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
      familyPercent: 0,
      hasPrivateLessons: false,
      membershipPaid: false,
      membershipFeeCents: 5000,
      charges: [],
      balanceCents: 0,
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
    });
    renderApp('/panel/alumnos/s1');

    const history = await screen.findByRole('list', { name: 'Historial de cobros' });
    expect(within(history).getByText('Septiembre 2026')).toBeInTheDocument();
    expect(within(history).getByText('40,50 €')).toBeInTheDocument();
    expect(screen.getByText('2 h semanales')).toBeInTheDocument();
    expect(screen.getByText('Sí, por familia directa')).toBeInTheDocument();
    expect(screen.getByText('Pendiente · 50 €')).toBeInTheDocument();
    expect(screen.queryByLabelText('Forma de pago preferida')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Socio del club' })).not.toBeInTheDocument();
    // Los puntos solo se ven (se gestionan en la sección Puntos).
    expect(screen.getByText(/Puntos de este mes/)).toHaveTextContent('Puntos de este mes: 2');
    expect(screen.queryByRole('button', { name: 'Sumar un punto' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en Puntos' })).toHaveAttribute(
      'href',
      '/panel/puntos?alumno=s1',
    );
    expect(spy).toHaveBeenCalled();
  });

  it('lists the season charges and fixes one by hand for this and the following months', async () => {
    const user = userEvent.setup();
    const account = {
      preferredPlan: 'monthly',
      member: false,
      privateRate: null,
      points: 0,
      suggestedMonths: 1,
      remainingMonths: 9,
      weeklyHours: 3,
      monthlyFeeCents: 5500,
      familyDiscount: true,
      familyPercent: 10,
      hasPrivateLessons: false,
      membershipPaid: true,
      membershipFeeCents: 5000,
      charges: [
        {
          id: 'c9',
          period: '2026-09',
          amountCents: 3600,
          coveredCents: 3600,
          pendingCents: 0,
          status: 'paid',
          manual: false,
          note: null,
          discountPercent: 10,
        },
        {
          id: 'c10',
          period: '2026-10',
          amountCents: 5500,
          coveredCents: 5500,
          pendingCents: 0,
          status: 'paid',
          manual: false,
          note: null,
        },
        {
          id: 'c11',
          period: '2026-11',
          amountCents: 5500,
          coveredCents: 2500,
          pendingCents: 3000,
          status: 'partial',
          manual: true,
          note: 'Cambio de tarifa',
        },
      ],
      balanceCents: 0,
    };
    const spy = api({
      'GET /api/admin/billing/accounts/s1': [200, account],
      'PUT /api/admin/billing/accounts/s1/charges/2026-11': [204],
    });
    renderApp('/panel/alumnos/s1');

    const season = await screen.findByRole('region', { name: 'Cuotas de la temporada' });
    expect(within(season).getByText('Faltan 30 €')).toBeInTheDocument();
    expect(within(season).getByText('Fijada a mano · Cambio de tarifa')).toBeInTheDocument();
    expect(within(season).getByText('−10 % familia · −10 % pago adelantado')).toBeInTheDocument();

    await user.click(
      within(season).getByRole('button', { name: 'Editar la cuota de noviembre 2026' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Cuota de noviembre 2026' });
    const amount = within(dialog).getByLabelText('Importe (€)');
    await user.clear(amount);
    await user.type(amount, '45');
    await user.clear(within(dialog).getByLabelText('Motivo'));
    await user.type(within(dialog).getByLabelText('Motivo'), 'Precio acordado');
    await user.click(within(dialog).getByRole('button', { name: 'Este y los siguientes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(postBodyFor(spy, 'PUT', '/api/admin/billing/accounts/s1/charges/2026-11')).toEqual({
        amountCents: 4500,
        reason: 'Precio acordado',
        scope: 'rest',
      }),
    );
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
        // Por defecto, desde hoy.
        from: todayIso(),
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
    const birth = within(within(dialog).getByRole('group', { name: 'Fecha de nacimiento' }));
    await user.selectOptions(birth.getByLabelText('Día'), '7');
    await user.selectOptions(birth.getByLabelText('Mes'), 'marzo');
    await user.selectOptions(birth.getByLabelText('Año'), '2015');
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
      // Por defecto, de alta hoy.
      joinedOn: todayIso(),
    });
  });

  it('sets a special schedule for a group while registering', async () => {
    const user = userEvent.setup();
    const spy = api({
      'POST /api/admin/students': [201, { id: 's9' }],
      'GET /api/admin/students/s9': [
        200,
        { ...DETAIL, id: 's9', fullName: 'Lucía Fernández Ortiz' },
      ],
      'POST /api/admin/groups/resolve-schedule': [
        200,
        {
          enrolments: [
            {
              groupId: 'g1',
              groupName: 'Iniciación A',
              slotLabel: 'Lun y Mié · 17:00–18:00',
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
    await user.click(within(dialog).getByRole('button', { name: 'Añadir horario' }));
    const block = within(within(dialog).getByRole('group', { name: 'Horario 1' }));
    await user.selectOptions(block.getByLabelText('Día'), 'mon');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Horario especial en Iniciación A' }),
    );

    const schedule = screen.getByRole('dialog', { name: 'Horario en el grupo' });
    await user.click(within(schedule).getByRole('switch', { name: 'Horario especial' }));
    await user.click(
      within(within(schedule).getByRole('group', { name: 'Días' })).getByRole('button', {
        name: 'Mié',
      }),
    );
    await user.click(within(schedule).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByText(/horario especial: Lun · 17:00–18:00/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));
    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students')).toMatchObject({
        enrolments: [
          { groupId: 'g1', attendance: { days: ['mon'], start: '17:00', end: '18:00' } },
        ],
      }),
    );
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

  it('should offer to cancel the pending charges when withdrawing, ticking the later months', async () => {
    const user = userEvent.setup();
    const now = currentMonth();
    const next = shiftMonth(now, 1);
    const pendingCharge = (id: string, period: string) => ({
      id,
      period,
      amountCents: 4500,
      coveredCents: 0,
      pendingCents: 4500,
      status: 'due',
      manual: false,
      note: null,
      discountPercent: 0,
      fullAmountCents: 4500,
      cancelledCents: 0,
    });
    const spy = api({
      'GET /api/admin/billing/accounts/s1': [
        200,
        {
          charges: [pendingCharge('c-now', now), pendingCharge('c-next', next)],
          membershipCharge: { id: 'c-socio', pendingCents: 5000 },
          balanceCents: 0,
        },
      ],
      'POST /api/admin/students/s1/withdrawal': [204],
      'POST /api/admin/billing/charges/c-now/cancel': [204],
      'POST /api/admin/billing/charges/c-next/cancel': [204],
    });
    renderApp('/panel/alumnos/s1');

    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    const dialog = screen.getByRole('dialog', { name: /dar de baja a martina/i });
    const later = await within(dialog).findByRole('checkbox', {
      name: new RegExp(monthLabel(next), 'i'),
    });
    expect(later).toBeChecked();
    const current = within(dialog).getByRole('checkbox', {
      name: new RegExp(monthLabel(now), 'i'),
    });
    expect(current).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Cuota de socio/ })).not.toBeChecked();
    await user.click(current);
    await user.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() =>
      expect(spy.mock.calls.filter(([, init]) => init?.method === 'POST').map(([u]) => u)).toEqual([
        '/api/admin/students/s1/withdrawal',
        '/api/admin/billing/charges/c-now/cancel',
        '/api/admin/billing/charges/c-next/cancel',
      ]),
    );
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

    const picker = within(panel).getByRole('combobox', { name: 'Inscribir alumno' });
    await user.click(picker);
    expect(within(panel).getAllByRole('option')).toHaveLength(1);
    await user.type(picker, 'villar');
    expect(within(panel).getAllByRole('option')).toHaveLength(1);
    await user.click(within(panel).getByRole('option', { name: 'Nerea Villar Campos' }));
    expect(picker).toHaveValue('Nerea Villar Campos');
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
