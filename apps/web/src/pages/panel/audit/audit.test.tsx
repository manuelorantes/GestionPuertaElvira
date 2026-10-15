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
      title: 'R-2026-0027 · Martina López Herrera',
      key: { id: 'p1' },
      operation: 'I',
      fields: [
        { field: 'receipt_number', before: null, after: 'R-2026-0027' },
        { field: 'student_id', before: null, after: 's1' },
        { field: 'kind', before: null, after: 'monthly' },
        { field: 'method', before: null, after: 'cash' },
        {
          field: 'lines',
          before: null,
          after: [{ label: '1,5 h semanales · 1 mes', amountCents: 4500 }],
        },
        { field: 'periods', before: null, after: ['2026-10'] },
        { field: 'invoice', before: null, after: null },
        { field: 'total_cents', before: null, after: 4500 },
      ],
      target: { kind: 'payment', id: 'p1' },
    },
    {
      table: 'billing_charge',
      tableLabel: 'Cuota',
      title: 'Cuota de octubre 2026 · Martina López Herrera',
      key: { id: 'c1' },
      operation: 'U',
      fields: [{ field: 'paid_by', before: null, after: 'p1' }],
      target: { kind: 'charges', month: '2026-10' },
    },
  ],
  references: {
    s1: { kind: 'student', label: 'Martina López Herrera', target: { kind: 'student', id: 's1' } },
    p1: {
      kind: 'payment',
      label: 'R-2026-0027 · Martina López Herrera',
      target: { kind: 'payment', id: 'p1' },
    },
  },
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
    // Nombres y cantidades, no identificadores ni claves: el alumno con enlace, los valores traducidos.
    expect(screen.getByText('· R-2026-0027 · Martina López Herrera')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Martina López Herrera' })).toHaveAttribute(
      'href',
      '/panel/alumnos/s1',
    );
    expect(screen.getByText('Cuotas')).toBeInTheDocument();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('1,5 h semanales · 1 mes: 45 €')).toBeInTheDocument();
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument();
    expect(screen.queryByText('Datos de la factura')).not.toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'R-2026-0027 · Martina López Herrera' }),
    ).toHaveAttribute('href', '/panel/cobros?pestana=registro&recibo=p1');
    expect(screen.getByRole('link', { name: 'Ir al cobro' })).toHaveAttribute(
      'href',
      '/panel/cobros?pestana=registro&recibo=p1',
    );
    expect(screen.getByRole('link', { name: 'Ir a las cuotas de octubre 2026' })).toHaveAttribute(
      'href',
      '/panel/cobros?mes=2026-10',
    );
  });

  it('sorts the actions from the headers, most recent first unless another column is chosen', async () => {
    const user = userEvent.setup();
    api({
      'GET /api/admin/audit/actions': [
        200,
        {
          ...ACTIONS,
          items: [
            ACTIONS.items[0],
            action({
              id: 'a0',
              seq: 9,
              userId: null,
              userName: 'Sistema',
              label: 'Inicio de sesión',
              occurredAt: '2026-10-04T09:15:00+02:00',
              changeCount: 0,
              affected: [],
              undoable: false,
            }),
          ],
        },
      ],
    });
    renderApp('/panel/historial');

    const table = await screen.findByRole('table', { name: 'Historial de acciones' });
    const labels = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[3]?.textContent);

    expect(labels()).toEqual(['Registrar cobro', 'Inicio de sesión']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por fecha y hora' }));
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por persona' }));
    expect(labels()).toEqual(['Registrar cobro', 'Inicio de sesión']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por persona' }));
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por acción' }));
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    // Lo que no afectó a nada va primero.
    await user.click(screen.getByRole('button', { name: 'Ordenar por afecta a' }));
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por afecta a' }));
    expect(labels()).toEqual(['Registrar cobro', 'Inicio de sesión']);
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

  it('opens a section with today as the default period and asks the server for the chosen one', async () => {
    const fetch = api({
      'GET /api/admin/audit/actions?section=students&period=today': [
        200,
        { items: [action({ label: 'Dar de alta alumno', affected: ['Alumno'] })], people: [] },
      ],
      'GET /api/admin/audit/actions?section=students&period=week': [200, { items: [], people: [] }],
      'GET /api/admin/audit/actions?section=attendance&period=week': [
        200,
        { items: [], people: [] },
      ],
    });
    renderApp('/panel/historial');

    const tabs = await screen.findByRole('tablist', { name: 'Secciones del historial' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['General', 'Alumnos', 'Pagos', 'Asistencia y notas']);
    expect(screen.queryByRole('group', { name: 'Periodo' })).not.toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Alumnos' }));
    const period = await screen.findByRole('group', { name: 'Periodo' });
    expect(within(period).getByRole('button', { name: 'Hoy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByLabelText('Persona')).not.toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Dar de alta alumno/ })).toBeInTheDocument();

    await userEvent.click(within(period).getByRole('button', { name: 'Esta semana' }));
    expect(await screen.findByText('No hay cambios de alumnos esta semana.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/audit/actions?section=students&period=week',
      expect.anything(),
    );

    // El periodo elegido se mantiene al cambiar de sección.
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Asistencia y notas' }));
    expect(await screen.findByText('No hay asistencias ni notas esta semana.')).toBeInTheDocument();
  });

  it('lists the payments of the period like the ledger, with their sum at the bottom', async () => {
    const payment = (overrides: Record<string, unknown>) => ({
      ...action({ affected: ['Cobro', 'Cuota'] }),
      paymentId: 'p1',
      receiptNumber: 'R-2026-0027',
      studentId: 's1',
      studentName: 'Martina López Herrera',
      concept: 'Cuota de octubre 2026',
      method: 'cash',
      totalCents: 4500,
      ...overrides,
    });
    api({
      'GET /api/admin/audit/actions?section=payments&period=today': [
        200,
        {
          items: [
            payment({
              id: 'a3',
              seq: 12,
              kind: 'undo',
              label: 'Deshacer: Registrar cobro',
              paymentId: 'p2',
              receiptNumber: 'R-2026-0028',
              studentId: 's2',
              studentName: 'Hugo Navarro Peña',
              method: 'transfer',
              totalCents: -3000,
            }),
            payment({
              id: 'a2',
              seq: 11,
              paymentId: 'p2',
              receiptNumber: 'R-2026-0028',
              studentId: 's2',
              studentName: 'Hugo Navarro Peña',
              method: 'transfer',
              totalCents: 3000,
            }),
            payment({}),
          ],
          totalCents: 4500,
          people: [],
        },
      ],
    });
    renderApp('/panel/historial?seccion=pagos');

    const table = await screen.findByRole('table', { name: 'Cobros registrados' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('R-2026-0028');
    expect(rows[0]).toHaveTextContent('Deshacer: Registrar cobro');
    expect(rows[0]).toHaveTextContent('−30 €');
    expect(rows[1]).toHaveTextContent('Transferencia');
    expect(rows[1]).toHaveTextContent('+30 €');
    expect(rows[2]).toHaveTextContent('Efectivo');
    expect(rows[2]).toHaveTextContent('Lucía Moreno Gil');
    expect(rows[2]).toHaveTextContent('+45 €');
    // El alumno se abre encima del historial, sin irse a Alumnos.
    expect(within(table).getByRole('link', { name: 'Martina López Herrera' })).toHaveAttribute(
      'href',
      '/panel/historial?seccion=pagos&ficha=s1',
    );
    expect(within(table).getByRole('link', { name: 'Ir al cobro R-2026-0027' })).toHaveAttribute(
      'href',
      '/panel/cobros?pestana=registro&recibo=p1',
    );
    // El cobro deshecho ya no existe: no hay recibo al que ir.
    expect(within(table).getAllByRole('link', { name: /Ir al cobro/ })).toHaveLength(2);
    expect(screen.getByText('2 cobros (1 deshecho) hoy')).toBeInTheDocument();
    expect(screen.getByText('Total +45 €')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deshacer/ })).not.toBeInTheDocument();
  });

  it('says when a section has nothing in the period', async () => {
    api({
      'GET /api/admin/audit/actions?section=payments&period=all': [
        200,
        { items: [], totalCents: 0, people: [] },
      ],
    });
    renderApp('/panel/historial?seccion=pagos&periodo=todo');

    expect(await screen.findByText('Todavía no hay cobros registrados.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true');
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
          newStudents: 0,
          studentsInClasses: 0,
          newInClasses: 0,
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
