import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const SHEET =
  ',Cuota Anual,Septiembre,Octubre,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail\nHector Perez Ratkovsky,50,55,55,19/9/2016,Lenka,699615279,lenka@ejemplo.com\nJulio Requena Montenegro,50,20,,7/2/17,Torcuato,690666005,torcuato@ejemplo.com';

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
    },
  ],
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
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
            classroom: 1,
            capacity: 12,
            occupied: 3,
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
  return within(await screen.findByRole('list', { name: 'Filas de la hoja' }));
}

describe('Importar hoja', () => {
  it('reviews the sheet: matched rows link, unknown rows propose a new student with the sheet data', async () => {
    api();
    const rows = await review();

    const hector = rows.getAllByRole('listitem')[0] as HTMLElement;
    expect(hector).toHaveTextContent('Encontrado: Héctor Pérez Ratkovsky');
    expect(hector).toHaveTextContent('2 meses (sep, oct) · 110 €');
    expect(
      within(hector as HTMLElement).getByRole('button', { name: 'Vincular a un alumno' }),
    ).toHaveAttribute('aria-pressed', 'true');

    const julio = rows.getAllByRole('listitem')[1] as HTMLElement;
    expect(julio).toHaveTextContent('Nuevo');
    expect(within(julio).getByRole('button', { name: 'Crear alumno' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(julio).getByLabelText('Nombre y apellidos')).toHaveValue(
      'Julio Requena Montenegro',
    );
    expect(within(julio).getByLabelText('Tutor')).toHaveValue('Torcuato');
    expect(within(julio).getByText('«69066600» no es un teléfono válido.')).toBeInTheDocument();
    expect(within(julio).getByText('Elige un grupo para crear el alumno.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar 2 filas' })).toBeDisabled();
  });

  it('applies the reviewed decisions after confirming and shows the summary', async () => {
    const fetch = api({
      'POST /api/admin/import/apply': [
        200,
        { created: 1, linked: 1, skipped: 0, payments: 4, members: 2, entries: 0 },
      ],
    });
    const rows = await review();
    const julio = rows.getAllByRole('listitem')[1] as HTMLElement;

    await userEvent.type(within(julio).getByLabelText('Teléfono del tutor'), '690666005');
    await userEvent.selectOptions(within(julio).getByLabelText('Grupo'), 'g1');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2 filas' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Importar' }),
    );

    expect(await screen.findByText('Importación hecha')).toBeInTheDocument();
    expect(
      screen.getByText('1 alumnos creados y 1 vinculados (0 filas omitidas)'),
    ).toBeInTheDocument();
    const sent = fetch.mock.calls.find(([url]) => url === '/api/admin/import/apply');
    const body = JSON.parse(String(sent?.[1]?.body)) as { text: string; rows: unknown[] };
    expect(body.text).toBe(SHEET);
    expect(body.rows).toEqual([
      { line: 2, action: 'link', studentId: 's1' },
      expect.objectContaining({
        line: 3,
        action: 'create',
        groupIds: ['g1'],
        guardianPhone: '690666005',
        fullName: 'Julio Requena Montenegro',
      }),
    ]);
  });

  it('lets a row be skipped or linked to a chosen student', async () => {
    const fetch = api({
      'POST /api/admin/import/apply': [
        200,
        { created: 0, linked: 1, skipped: 1, payments: 3, members: 1, entries: 0 },
      ],
    });
    const rows = await review();
    const [hector, julio] = rows.getAllByRole('listitem') as HTMLElement[];

    await userEvent.click(within(hector as HTMLElement).getByRole('button', { name: 'Omitir' }));
    await userEvent.click(
      within(julio as HTMLElement).getByRole('button', { name: 'Vincular a un alumno' }),
    );
    await userEvent.selectOptions(
      within(julio as HTMLElement).getByLabelText('Alumno existente para Julio Requena Montenegro'),
      's1',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Importar 1 filas' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Importar' }),
    );

    await waitFor(() => expect(screen.getByText('Importación hecha')).toBeInTheDocument());
    const sent = fetch.mock.calls.find(([url]) => url === '/api/admin/import/apply');
    expect((JSON.parse(String(sent?.[1]?.body)) as { rows: unknown[] }).rows).toEqual([
      { line: 2, action: 'skip' },
      { line: 3, action: 'link', studentId: 's1' },
    ]);
  });
});
