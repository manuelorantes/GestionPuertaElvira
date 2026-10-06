import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp, SUPERADMIN } from '@/test/render';

const SHEET =
  ',Cuota Anual,Septiembre,Octubre,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail\nHector Perez Ratkovsky,50,55,55,19/9/2016,Lenka,699615279,lenka@ejemplo.com\nJulio Requena Montenegro,50,20,,7/2/17,Torcuato,690666005,torcuato@ejemplo.com\nHector Perez,,30,,11/8/2017,Luis,678810154,luis@ejemplo.com';

const PREVIEW = {
  rows: [
    {
      line: 2,
      fullName: 'Hector Perez Ratkovsky',
      birthDate: '2016-09-19',
      guardianName: 'Lenka',
      guardianPhone: '699615279',
      email: 'lenka@ejemplo.com',
      membershipCents: 5000,
      kitCents: null,
      federationCents: null,
      monthlyCents: { '2026-09': 5500, '2026-10': 5500 },
      warnings: [],
      match: { id: 's1', fullName: 'Héctor Pérez Ratkovsky' },
      suggestions: [],
      groups: [],
    },
    {
      line: 3,
      fullName: 'Julio Requena Montenegro',
      birthDate: '2017-02-07',
      guardianName: 'Torcuato',
      guardianPhone: null,
      email: 'torcuato@ejemplo.com',
      membershipCents: 5000,
      kitCents: null,
      federationCents: null,
      monthlyCents: { '2026-09': 2000 },
      warnings: ['«69066600» no es un teléfono válido.'],
      match: null,
      suggestions: [],
      groups: [{ text: 'Lun 17:00', groupId: 'g1' }],
    },
    {
      line: 4,
      fullName: 'Hector Perez',
      birthDate: '2017-08-11',
      guardianName: 'Luis',
      guardianPhone: '678810154',
      email: 'luis@ejemplo.com',
      membershipCents: null,
      kitCents: null,
      federationCents: null,
      monthlyCents: { '2026-09': 3000 },
      warnings: [],
      match: null,
      suggestions: [{ id: 's1', fullName: 'Héctor Pérez Ratkovsky' }],
      groups: [],
    },
  ],
};

const result = (overrides: Record<string, unknown>) => ({
  line: 2,
  action: 'link',
  studentId: 's1',
  studentName: 'Hector Perez Ratkovsky',
  payments: 3,
  member: true,
  entries: 0,
  ...overrides,
});

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: SUPERADMIN }],
    'GET /api/admin/groups': [
      200,
      {
        items: [
          {
            id: 'g1',
            name: 'Iniciación A',
            level: 'beginner',
            teacher: { id: 't1', fullName: 'Lucía' },
            days: ['mon'],
            start: '17:00',
            end: '18:00',
            slotLabel: 'Lun · 17:00–18:00',
            classroom: 'alfil',
            capacity: 12,
            occupied: 3,
            occupancyByDay: {},
            customName: true,
            weeklyPlan: 'one_hour',
          },
          {
            id: 'g2',
            name: 'Iniciación miércoles 17:00',
            level: 'beginner',
            teacher: { id: 't2', fullName: 'Roxanny' },
            days: ['wed'],
            start: '17:00',
            end: '18:00',
            slotLabel: 'Mié · 17:00–18:00',
            classroom: 'peon',
            capacity: 12,
            occupied: 0,
            occupancyByDay: {},
            customName: true,
            weeklyPlan: 'one_hour',
          },
        ],
      },
    ],
    'GET /api/admin/students?filter=active': [
      200,
      {
        items: [
          {
            id: 's1',
            fullName: 'Héctor Pérez Ratkovsky',
            age: 10,
            status: 'active',
            groups: [],
            hasSiblings: false,
          },
        ],
        total: 1,
      },
    ],
    'POST /api/admin/import/preview': [200, PREVIEW],
    ...extra,
  });
}

async function review() {
  renderApp('/panel/importar');
  await userEvent.type(await screen.findByLabelText('Celdas pegadas o contenido del CSV'), SHEET);
  await userEvent.click(screen.getByRole('button', { name: 'Revisar la hoja' }));
  const list = within(await screen.findByRole('list', { name: 'Filas de la hoja' }));
  return {
    hector: list.getByRole('listitem', { name: 'Hector Perez Ratkovsky' }),
    julio: list.getByRole('listitem', { name: 'Julio Requena Montenegro' }),
    lookalike: list.getByRole('listitem', { name: 'Hector Perez' }),
  };
}

function sentRows(fetch: ReturnType<typeof api>) {
  return fetch.mock.calls
    .filter(([url]) => url === '/api/admin/import/rows')
    .map(([, init]) => (JSON.parse(String(init?.body)) as { row: Record<string, unknown> }).row);
}

describe('Importar hoja', () => {
  it('sends a plain administrator back to the summary', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/dashboard': [
        200,
        {
          month: '2026-10',
          today: '2026-10-04',
          collectedCents: 0,
          expectedCents: 0,
          pendingCents: 0,
          expensesCents: 0,
          activeStudents: 0,
          registeredStudents: 0,
          chart: [],
          occupancy: { percent: 0, fullGroups: 0, emptiest: [] },
          overdue: [],
          latest: [],
        },
      ],
    });
    renderApp('/panel/importar');
    expect(await screen.findByRole('heading', { name: 'Resumen del club' })).toBeInTheDocument();
    expect(screen.queryByText('Revisar la hoja')).not.toBeInTheDocument();
  });

  it('reviews the sheet: matched rows link, unknown rows propose a new student, lookalikes are flagged', async () => {
    api();
    const { hector, julio, lookalike } = await review();

    expect(hector).toHaveTextContent('Encontrado: Héctor Pérez Ratkovsky');
    expect(hector).toHaveTextContent('2 meses (sep, oct) · 110 €');
    expect(within(hector).getByRole('button', { name: 'Vincular a un alumno' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(julio).toHaveTextContent('Nuevo');
    expect(within(julio).getByRole('button', { name: 'Crear alumno' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(julio).getByLabelText('Nombre y apellidos')).toHaveValue(
      'Julio Requena Montenegro',
    );
    expect(within(julio).getByText('«69066600» no es un teléfono válido.')).toBeInTheDocument();
    // Solo el nombre es obligatorio: la fila se puede aceptar aunque falte el teléfono.
    expect(
      within(julio).getByRole('button', { name: 'Aceptar fila Julio Requena Montenegro' }),
    ).toBeEnabled();
    expect(within(julio).getByLabelText('Grupo')).toHaveValue('g1');

    expect(lookalike).toHaveTextContent('Posible duplicado: Héctor Pérez Ratkovsky');
  });

  it('imports each accepted row on its own and keeps going when one fails', async () => {
    const fetch = api({
      'POST /api/admin/import/rows': [
        [200, result({})],
        [
          422,
          {
            error: {
              code: 'missing_contact',
              message: 'Un alumno menor necesita al menos un tutor con teléfono.',
            },
          },
        ],
      ],
    });
    const { hector, julio } = await review();

    await userEvent.click(
      within(hector).getByRole('button', { name: 'Aceptar fila Hector Perez Ratkovsky' }),
    );
    expect(
      await within(hector).findByText('Importada: vinculada · 3 cobros · socio'),
    ).toBeInTheDocument();
    expect(within(hector).queryByRole('button', { name: /Aceptar fila/ })).not.toBeInTheDocument();

    await userEvent.type(within(julio).getByLabelText('Teléfono del tutor'), '690666005');
    await userEvent.selectOptions(within(julio).getByLabelText('Grupo'), 'g1');
    // Quien viene dos días se apunta a dos grupos de un día.
    await userEvent.click(within(julio).getByRole('button', { name: 'Añadir otro grupo' }));
    await userEvent.selectOptions(within(julio).getByLabelText('Otro grupo'), 'g2');
    await userEvent.click(
      within(julio).getByRole('button', { name: 'Aceptar fila Julio Requena Montenegro' }),
    );
    expect(
      await within(julio).findByText('Un alumno menor necesita al menos un tutor con teléfono.'),
    ).toBeInTheDocument();
    expect(
      within(julio).getByRole('button', { name: 'Aceptar fila Julio Requena Montenegro' }),
    ).toBeEnabled();

    expect(sentRows(fetch)).toEqual([
      { line: 2, action: 'link', studentId: 's1' },
      expect.objectContaining({
        line: 3,
        action: 'create',
        groupIds: ['g1', 'g2'],
        guardianPhone: '690666005',
      }),
    ]);
    expect(screen.getByText(/1 importadas · 2 pendientes/)).toBeInTheDocument();
  });

  it('warns about a possible duplicate and lets you link or create anyway', async () => {
    const fetch = api({
      'POST /api/admin/import/rows': [
        [
          409,
          {
            error: {
              code: 'possible_duplicate',
              message: 'Posible duplicado: ya existe «Héctor Pérez Ratkovsky».',
              details: { candidates: 's1' },
            },
          },
        ],
        [
          200,
          result({
            line: 4,
            action: 'create',
            studentId: 's9',
            studentName: 'Hector Perez',
            payments: 1,
            member: false,
          }),
        ],
      ],
    });
    const { lookalike } = await review();

    await userEvent.selectOptions(within(lookalike).getByLabelText('Grupo'), 'g1');
    await userEvent.click(
      within(lookalike).getByRole('button', { name: 'Aceptar fila Hector Perez' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Posible duplicado' });
    expect(dialog).toHaveTextContent('ya existe «Héctor Pérez Ratkovsky»');
    expect(
      within(dialog).getByRole('button', {
        name: 'Es la misma persona: vincular a Héctor Pérez Ratkovsky',
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Es otra persona: crear igualmente' }),
    );

    expect(
      await within(lookalike).findByText('Importada: alumno creado · 1 cobro'),
    ).toBeInTheDocument();
    expect(sentRows(fetch)[1]).toEqual(
      expect.objectContaining({ line: 4, action: 'create', confirmDuplicate: true }),
    );
  });

  it('imports all reviewed rows in order, leaving the lookalike for manual confirmation', async () => {
    const fetch = api({ 'POST /api/admin/import/rows': [200, result({})] });
    const { julio, lookalike } = await review();
    await userEvent.click(within(julio).getByRole('button', { name: 'Omitir' }));
    await userEvent.selectOptions(within(lookalike).getByLabelText('Grupo'), 'g1');

    await userEvent.click(screen.getByRole('button', { name: 'Importar todas las revisadas (2)' }));

    await waitFor(() =>
      expect(screen.getByText(/1 importadas · 1 pendientes · 1 omitidas/)).toBeInTheDocument(),
    );
    expect(sentRows(fetch)).toEqual([{ line: 2, action: 'link', studentId: 's1' }]);
  });
});
