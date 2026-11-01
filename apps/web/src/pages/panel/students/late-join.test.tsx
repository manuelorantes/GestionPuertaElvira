import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach } from 'vitest';

import { firstMonthPayload, lateJoinMonth } from '@/features/students/firstMonth';
import { ADMIN, mockApi, renderApp } from '@/test/render';

const GROUP = {
  id: 'g2',
  name: 'Peques B',
  level: 'beginner',
  teacher: { id: 't1', fullName: 'Lucía Moreno Gil' },
  days: ['tue'],
  start: '16:00',
  end: '17:00',
  slotLabel: 'Mar · 16:00–17:00',
  classroom: 'caballo',
  capacity: 12,
  occupied: 3,
  occupancyByDay: {},
  customName: true,
  weeklyPlan: 'one_hour',
};
const WITHDRAWN = {
  id: 's1',
  memberNumber: 7,
  fullName: 'Martina López Herrera',
  birthDate: '2014-03-12',
  age: 12,
  nationalId: null,
  contactEmail: null,
  guardians: [{ name: 'Rocío Herrera', phone: '612 48 19 30' }],
  ownPhone: null,
  federationLicence: null,
  imageConsent: true,
  missingData: [],
  joinedOn: '2026-09-15',
  withdrawnOn: '2026-10-02',
  status: 'withdrawn',
  membership: [{ joinedOn: '2026-09-15', withdrawnOn: '2026-10-02' }],
  groups: [],
  siblings: [],
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/students/pending-data': [200, { items: [] }],
    'GET /api/admin/groups': [200, { items: [GROUP] }],
    'GET /api/admin/teachers': [200, { items: [] }],
    'GET /api/admin/students?filter=active': [200, { items: [], total: 0 }],
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
    ...extra,
  });
}

function postBody(spy: ReturnType<typeof api>, url: string) {
  const call = spy.mock.calls.filter(([u, init]) => u === url && init?.method === 'POST').at(-1);
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

async function openRegistrationWithClasses() {
  const user = userEvent.setup();
  renderApp('/panel/alumnos');
  await user.click(await screen.findByRole('button', { name: 'Nuevo alumno' }));
  const dialog = screen.getByRole('dialog', { name: 'Nuevo alumno' });
  await user.type(within(dialog).getByLabelText('Nombre y apellidos'), 'Lucía Fernández Ortiz');
  await user.click(within(dialog).getByRole('button', { name: 'Añadir horario' }));
  const block = within(within(dialog).getByRole('group', { name: 'Horario 1' }));
  await user.selectOptions(block.getByLabelText('Día'), 'tue');
  await user.selectOptions(block.getByLabelText('Empieza'), '16:00');
  await user.selectOptions(block.getByLabelText('Termina'), '17:00');
  expect(await within(dialog).findByText('Peques B')).toBeVisible();
  return { user, dialog };
}

describe('Alta a final de mes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks about the current month only from the 16th, in the season', () => {
    expect(lateJoinMonth('2026-11-20')).toBe('2026-11');
    expect(lateJoinMonth('2026-11-16')).toBe('2026-11');
    expect(lateJoinMonth('2026-11-15')).toBeNull();
    expect(lateJoinMonth('2026-10-25')).toBeNull();
    expect(lateJoinMonth('2027-07-20', '2027-07-20')).toBeNull();
    expect(firstMonthPayload({ mode: 'part', amount: '0' }, '2026-11-20', true)).toBe('invalid');
    expect(firstMonthPayload({ mode: 'none', amount: '' }, '2026-11-20', false)).toBeUndefined();
  });

  it('registers a student paying only part of the month they join', async () => {
    const spy = api({ 'POST /api/admin/students': [201, { id: 's9' }] });
    const { user, dialog } = await openRegistrationWithClasses();

    expect(within(dialog).getByText('¿Qué paga de noviembre?')).toBeVisible();
    const choice = within(within(dialog).getByRole('group', { name: 'Cuota de noviembre' }));
    expect(choice.getByRole('button', { name: 'El mes completo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(choice.getByRole('button', { name: 'Una parte' }));
    const submit = within(dialog).getByRole('button', { name: 'Dar de alta' });
    await user.type(within(dialog).getByLabelText('Lo que paga de noviembre (€)'), '0');
    expect(submit).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Lo que paga de noviembre (€)'));
    await user.type(within(dialog).getByLabelText('Lo que paga de noviembre (€)'), '20');
    await user.click(submit);

    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students')).toMatchObject({
        joinedOn: '2026-11-20',
        firstMonth: { mode: 'part', amountCents: 2000 },
      }),
    );
  });

  it('registers a student who starts paying next month', async () => {
    const spy = api({ 'POST /api/admin/students': [201, { id: 's9' }] });
    const { user, dialog } = await openRegistrationWithClasses();

    await user.click(within(dialog).getByRole('button', { name: 'Nada este mes' }));
    expect(
      within(dialog).getByText(
        'No tendrá cuota de noviembre: su primera cuota será la de diciembre.',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));

    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students')).toMatchObject({
        firstMonth: { mode: 'none' },
      }),
    );
  });

  it('does not ask when the join date is before the 16th', async () => {
    const spy = api({ 'POST /api/admin/students': [201, { id: 's9' }] });
    const { user, dialog } = await openRegistrationWithClasses();
    const joined = within(within(dialog).getByRole('group', { name: 'Fecha de alta' }));
    await user.selectOptions(joined.getByLabelText('Día'), '15');
    expect(within(dialog).queryByText('¿Qué paga de noviembre?')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));

    await waitFor(() => expect(postBody(spy, '/api/admin/students')).toHaveProperty('joinedOn'));
    expect(postBody(spy, '/api/admin/students')).not.toHaveProperty('firstMonth');
  });

  it('asks the same when joining a withdrawn student again late in the month', async () => {
    const user = userEvent.setup();
    const spy = api({
      'GET /api/admin/students/s1': [200, WITHDRAWN],
      'POST /api/admin/students/s1/rejoin': [204],
    });
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    await user.click(await within(card).findByRole('button', { name: /Dar de alta de nuevo/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Dar de alta de nuevo a Martina' });
    // Sin grupos vuelve como socio sin clases: no hay cuota que decidir.
    expect(within(dialog).queryByText('¿Qué paga de noviembre?')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /Peques B/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Nada este mes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));

    await waitFor(() =>
      expect(postBody(spy, '/api/admin/students/s1/rejoin')).toEqual({
        date: '2026-11-20',
        groupIds: ['g2'],
        firstMonth: { mode: 'none' },
        confirmOverCapacity: false,
      }),
    );
  });
});
