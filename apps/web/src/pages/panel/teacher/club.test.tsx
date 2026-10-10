import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TEACHER, mockApi, renderApp } from '@/test/render';

const GROUP = {
  id: 'g1',
  name: 'Adultos I',
  level: 'advanced',
  teacher: { id: 't2', fullName: 'Carlos Ruiz Márquez' },
  days: ['tue'],
  start: '19:00',
  end: '20:30',
  slotLabel: 'Mar · 19:00–20:30',
  classroom: 'caballo',
  capacity: 12,
  occupied: 9,
  occupancyByDay: {},
  customName: true,
  weeklyPlan: 'one_hour',
};

const STUDENT = {
  id: 's1',
  memberNumber: 7,
  fullName: 'Martina López Herrera',
  birthDate: '2014-03-12',
  age: 12,
  nationalId: '12345678Z',
  contactEmail: 'familia@ejemplo.com',
  guardians: [{ name: 'Rocío Herrera', phone: '612 48 19 30' }],
  ownPhone: null,
  federationLicence: null,
  imageConsent: true,
  missingData: [],
  joinedOn: '2026-09-15',
  withdrawnOn: null,
  status: 'active',
  membership: [{ joinedOn: '2026-09-15', withdrawnOn: null }],
  groups: [
    {
      id: 'g1',
      name: 'Adultos I',
      slotLabel: 'Mar · 19:00–20:30',
      teacherName: 'Carlos Ruiz Márquez',
      classroom: 'caballo',
      since: '2026-09-15',
    },
  ],
  siblings: [{ id: 's3', fullName: 'Pablo López Herrera' }],
};

const ACCOUNT = {
  preferredPlan: 'monthly',
  member: true,
  privateRate: null,
  points: 0,
  suggestedMonths: 1,
  remainingMonths: 9,
  weeklyHours: 1.5,
  monthlyFeeCents: 4500,
  familyDiscount: true,
  familyPercent: 10,
  hasPrivateLessons: false,
  membershipPaid: true,
  membershipFeeCents: 5000,
  charges: [
    {
      id: 'c10',
      period: '2026-10',
      amountCents: 4050,
      coveredCents: 0,
      pendingCents: 4050,
      status: 'pending',
      manual: false,
      note: null,
      discountPercent: 10,
    },
  ],
  membershipCharge: null,
  balanceCents: 0,
  materialCharges: [],
  totals: [],
};

/** Una cuenta de profesorado: solo las consultas del club, ninguna de gestión. */
function teacherApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: TEACHER }],
    'GET /api/admin/groups': [200, { items: [GROUP] }],
    ...extra,
  });
}

const calledUrls = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.map(([input]) => String(input));

describe('Clases y Alumnos para el profesorado', () => {
  it('shows the groups and their free seats without any way of changing them', async () => {
    const spy = teacherApi({
      'GET /api/admin/groups/g1': [
        200,
        {
          ...GROUP,
          students: [
            { id: 's1', fullName: 'Martina López Herrera', age: 12, attendanceLabel: null },
          ],
        },
      ],
    });
    renderApp('/panel/clases?pestana=grupos');

    expect(await screen.findByRole('heading', { name: 'Clases' })).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByRole('link', { name: /^Clases/ })).toHaveAttribute(
      'href',
      '/panel/clases',
    );
    expect(within(nav).getByRole('link', { name: /^Alumnos/ })).toBeVisible();
    expect(within(nav).queryByRole('link', { name: /Cobros/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo grupo' })).not.toBeInTheDocument();
    expect(await screen.findByText('Adultos I')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Editar Adultos I' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Alumnos de Adultos I' }));
    const panel = await screen.findByRole('dialog', { name: 'Adultos I' });
    expect(await within(panel).findByText('Martina López Herrera')).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Editar grupo' })).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('Inscribir alumno')).not.toBeInTheDocument();
    // La lista de profesores lleva sus tarifas: no se pide.
    expect(calledUrls(spy)).not.toContain('/api/admin/teachers');
  });

  it("shows any student's sheet, payments included, read only", async () => {
    const spy = teacherApi({
      'GET /api/admin/students?filter=active': [200, { items: [], total: 0 }],
      'GET /api/admin/students/s1': [200, STUDENT],
      'GET /api/admin/billing/accounts/s1': [200, ACCOUNT],
      'GET /api/admin/billing/payments?studentId=s1': [200, { items: [] }],
      'GET /api/admin/equipment/orders?studentId=s1': [200, { items: [] }],
    });
    renderApp('/panel/alumnos/s1');

    expect(await screen.findByRole('heading', { name: 'Martina López Herrera' })).toBeVisible();
    expect(screen.getByText('12345678Z')).toBeVisible();
    expect(screen.getByRole('link', { name: '612 48 19 30' })).toBeVisible();
    const charges = await screen.findByRole('region', { name: 'Cuotas de la temporada' });
    expect(charges).toHaveTextContent('40,50 €');
    for (const name of [
      'Editar',
      'Dar de baja',
      'Añadir grupo',
      'Añadir familia directa',
      'Registrar cobro',
      'Apuntar pedido',
      'Editar la cuota de octubre 2026',
      'Quitar de Adultos I',
      'Quitar de la familia directa a Pablo López Herrera',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Datos pendientes' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(calledUrls(spy)).toContain('/api/admin/equipment/orders?studentId=s1'),
    );
    expect(calledUrls(spy)).not.toContain('/api/admin/students/pending-data');
  });
});
