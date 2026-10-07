import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, SUPERADMIN, mockApi, renderApp } from '@/test/render';

const action = (overrides: Record<string, unknown>) => ({
  id: 'a1',
  seq: 10,
  kind: 'change',
  userId: 'u1',
  userName: 'Lucía Moreno Gil',
  label: 'Registrar cobro',
  occurredAt: '2026-10-04T18:30:00+02:00',
  changeCount: 3,
  affected: ['Cobro', 'Cuota', 'Numeración de documentos'],
  reverts: null,
  undoable: true,
  ...overrides,
});

const ACTIONS = {
  items: [
    action({}),
    action({
      id: 'a0',
      seq: 9,
      kind: 'security',
      label: 'Inicio de sesión',
      changeCount: 0,
      affected: [],
      undoable: false,
    }),
  ],
  people: [{ id: 'u1', name: 'Lucía Moreno Gil' }],
};

const DETAIL = {
  action: ACTIONS.items[0],
  changes: [
    {
      table: 'billing_payment',
      tableLabel: 'Cobro',
      key: { id: 'p1' },
      operation: 'I',
      fields: [
        { field: 'receipt_number', before: null, after: 'R-2026-0027' },
        { field: 'total_cents', before: null, after: 4500 },
      ],
      target: { kind: 'payment', id: 'p1' },
    },
    {
      table: 'billing_charge',
      tableLabel: 'Cuota',
      key: { id: 'c1' },
      operation: 'U',
      fields: [{ field: 'paid_by', before: null, after: 'p1' }],
      target: { kind: 'charges', month: '2026-10' },
    },
  ],
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: SUPERADMIN }],
    'GET /api/admin/audit/actions': [200, ACTIONS],
    'GET /api/admin/audit/actions/a1': [200, DETAIL],
    ...extra,
  });
}

describe('Historial', () => {
  it('lists who did what and when, with the detail of each change', async () => {
    api();
    renderApp('/panel/historial');

    const table = await screen.findByRole('table', { name: 'Historial de acciones' });
    const payment = within(table).getByRole('row', { name: /Registrar cobro/ });
    expect(payment).toHaveTextContent('Lucía Moreno Gil');
    expect(payment).toHaveTextContent('04/10/2026 18:30');
    expect(payment).toHaveTextContent('Cobro, Cuota, Numeración de documentos');
    const login = within(table).getByRole('row', { name: /Inicio de sesión/ });
    expect(within(login).queryByRole('button', { name: /Deshacer/ })).not.toBeInTheDocument();

    await userEvent.click(
      within(payment).getByRole('button', { name: 'Ver detalle de Registrar cobro' }),
    );
    expect(await screen.findByText('R-2026-0027')).toBeInTheDocument();
    expect(screen.getByText('Recibo')).toBeInTheDocument();
    expect(screen.getByText('45 €')).toBeInTheDocument();
    expect(screen.getByText('Alta · Cobro')).toBeInTheDocument();
    expect(screen.getByText('Cambio · Cuota')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al cobro' })).toHaveAttribute(
      'href',
      '/panel/cobros?pestana=registro&recibo=p1',
    );
    expect(screen.getByRole('link', { name: 'Ir a las cuotas de octubre 2026' })).toHaveAttribute(
      'href',
      '/panel/cobros?mes=2026-10',
    );
  });

  it('undoes an action after confirming', async () => {
    const fetch = api({ 'POST /api/admin/audit/actions/a1/undo': [204] });
    renderApp('/panel/historial');

    const row = within(await screen.findByRole('table')).getByRole('row', {
      name: /Registrar cobro/,
    });
    await userEvent.click(within(row).getByRole('button', { name: 'Deshacer Registrar cobro' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deshacer' }),
    );

    expect(await screen.findByText('Acción deshecha')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/audit/actions/a1/undo',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('explains why an action cannot be undone', async () => {
    api({
      'POST /api/admin/audit/actions/a1/undo': [
        409,
        {
          error: {
            code: 'undo_conflict',
            message:
              'No se puede deshacer: «Emitir factura» (Lucía Moreno Gil) tocó después los mismos registros.',
          },
        },
      ],
    });
    renderApp('/panel/historial');

    const row = within(await screen.findByRole('table')).getByRole('row', {
      name: /Registrar cobro/,
    });
    await userEvent.click(within(row).getByRole('button', { name: 'Deshacer Registrar cobro' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deshacer' }));

    expect(await within(dialog).findByText(/Emitir factura/)).toBeInTheDocument();
  });

  it('goes back to a point after confirming and filters by person', async () => {
    const fetch = api({
      'POST /api/admin/audit/actions/a1/restore': [200, { reverted: 7 }],
      'GET /api/admin/audit/actions?userId=u1': [200, ACTIONS],
    });
    renderApp('/panel/historial');

    const row = within(await screen.findByRole('table')).getByRole('row', {
      name: /Registrar cobro/,
    });
    await userEvent.click(
      within(row).getByRole('button', { name: 'Volver a este punto: Registrar cobro' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Todo el club volverá');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Volver a este punto' }));
    expect(await screen.findByText('Vuelta atrás hecha: 7 cambios deshechos')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Persona'), 'u1');
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/admin/audit/actions?userId=u1', expect.anything()),
    );
  });

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
    renderApp('/panel/historial');

    expect(await screen.findByRole('heading', { name: 'Resumen del club' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Historial de acciones' })).not.toBeInTheDocument();
  });
});
