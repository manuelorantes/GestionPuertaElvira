import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const MARTINA = {
  id: 's1',
  memberNumber: 7,
  fullName: 'Martina López Herrera',
  age: 12,
  status: 'active',
  joinedOn: '2026-09-15',
  groups: [],
  hasSiblings: false,
};
const ALVARO = {
  id: 'p1',
  memberNumber: null,
  fullName: 'Álvaro Tejero Gilabert',
  age: null,
  status: 'active',
  joinedOn: '2026-10-09',
  groups: [],
  hasSiblings: false,
};
const ALVARO_DETAIL = {
  ...ALVARO,
  provisional: true,
  birthDate: null,
  nationalId: null,
  contactEmail: null,
  guardians: [],
  ownPhone: null,
  federationLicence: null,
  imageConsent: false,
  missingData: ['birth_date', 'guardian', 'email'],
  withdrawnOn: null,
  membership: [{ joinedOn: '2026-10-09', withdrawnOn: null }],
  siblings: [],
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/students/pending-data': [200, { items: [] }],
    'GET /api/admin/groups': [200, { items: [] }],
    'GET /api/admin/teachers': [200, { items: [] }],
    'GET /api/admin/students?filter=active': [200, { items: [MARTINA], total: 1 }],
    'GET /api/admin/students?filter=provisional': [200, { items: [ALVARO], total: 1 }],
    'GET /api/admin/students/p1': [200, ALVARO_DETAIL],
    ...extra,
  });
}

describe('socios provisionales', () => {
  it('registers a provisional member without schedule or direct family', async () => {
    const user = userEvent.setup();
    const spy = api({ 'POST /api/admin/students': [201, { id: 'p1' }] });
    renderApp('/panel/alumnos');

    await user.click(await screen.findByRole('button', { name: 'Nuevo alumno' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo alumno' });
    await user.type(within(dialog).getByLabelText('Nombre y apellidos'), 'Álvaro Tejero Gilabert');
    expect(within(dialog).getByText('Familia directa en el club')).toBeVisible();
    await user.click(within(dialog).getByRole('switch', { name: 'Socio provisional' }));
    expect(within(dialog).queryByText('Familia directa en el club')).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('falta su hoja de inscripción');
    await user.click(within(dialog).getByRole('button', { name: 'Dar de alta' }));

    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([url, init]) => url === '/api/admin/students' && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    const sent = spy.mock.calls.find(
      ([url, init]) => url === '/api/admin/students' && init?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual(
      expect.objectContaining({
        fullName: 'Álvaro Tejero Gilabert',
        provisional: true,
        enrolments: [],
        siblingIds: [],
      }),
    );
    expect(
      await screen.findByText('Álvaro Tejero Gilabert dado de alta como socio provisional'),
    ).toBeVisible();
  });

  it('warns about provisional members in Alumnos, lists them and passes one to member', async () => {
    const user = userEvent.setup();
    const spy = api({ 'POST /api/admin/students/p1/confirmation': [204, null] });
    renderApp('/panel/alumnos');

    await user.click(
      await screen.findByRole('link', { name: '1 socio provisional por completar' }),
    );
    expect(await screen.findByRole('heading', { name: 'Socios provisionales' })).toBeVisible();
    const list = within(screen.getByRole('list', { name: 'Socios provisionales' }));
    expect(list.getByText('Alta el 09/10/2026')).toBeVisible();
    await user.click(list.getByRole('button', { name: /Álvaro Tejero Gilabert/ }));

    const sheet = await screen.findByRole('dialog', { name: 'Álvaro Tejero Gilabert' });
    expect(within(sheet).getByText('Socio provisional')).toBeVisible();
    expect(within(sheet).getByText('Provisional')).toBeVisible();
    expect(within(sheet).queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Añadir grupo' })).not.toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: 'Añadir familia directa' }),
    ).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Pasar a socio' }));
    const confirm = await screen.findByRole('dialog', { name: 'Pasar a socio' });
    expect(confirm).toHaveTextContent('recibirá el siguiente número de socio');
    await user.click(within(confirm).getByRole('button', { name: 'Pasar a socio' }));

    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([url, init]) => url === '/api/admin/students/p1/confirmation' && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(await screen.findByText('Álvaro Tejero Gilabert ya es socio')).toBeVisible();
  });

  it('shows no warning when there are no provisional members', async () => {
    api({ 'GET /api/admin/students?filter=provisional': [200, { items: [], total: 1 }] });
    renderApp('/panel/alumnos');

    expect(await screen.findByText('Martina López Herrera')).toBeVisible();
    expect(screen.queryByText(/socios? provisional/)).not.toBeInTheDocument();
  });
});
