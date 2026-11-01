import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, SUPERADMIN, mockApi, renderApp } from '@/test/render';

const action = (overrides: Record<string, unknown>) => ({
  id: 'a1',
  seq: 10,
  kind: 'change',
  category: 'payments',
  userId: 'u1',
  userName: 'Lucía Moreno Gil',
  label: 'Registrar cobro',
  detail: 'R-2026-0027 · Martina López Herrera',
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
      category: 'system',
      label: 'Inicio de sesión',
      detail: null,
      changeCount: 0,
      affected: [],
      undoable: false,
    }),
  ],
  people: [{ id: 'u1', name: 'Lucía Moreno Gil' }],
  categories: [
    { category: 'payments', count: 1 },
    { category: 'system', count: 1 },
  ],
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
        { field: 'concept', before: null, after: 'Octubre 2026' },
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
      table: 'billing_document_sequence',
      tableLabel: 'Numeración de documentos',
      title: 'R · 2026',
      key: { prefix: 'R', season_year: 2026 },
      operation: 'U',
      fields: [{ field: 'last_number', before: 26, after: 27 }],
      target: null,
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
  studentGroups: [],
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
    // La categoría encima de la acción y, debajo, a quién afectó.
    expect(payment).toHaveTextContent('CobrosRegistrar cobroR-2026-0027 · Martina López Herrera');
    expect(payment).toHaveTextContent('04/10/2026 18:30');
    expect(payment).toHaveTextContent('Cobro, Cuota, Numeración de documentos');
    const login = within(table).getByRole('row', { name: /Inicio de sesión/ });
    expect(within(login).queryByRole('button', { name: /Deshacer/ })).not.toBeInTheDocument();

    await userEvent.click(
      within(payment).getByRole('button', { name: 'Ver detalle de Registrar cobro' }),
    );
    // Un cobro se resume: alumno, pago y concepto, con los enlaces a la derecha; sin recibo ni numeración.
    const summary = await screen.findByRole('region', { name: 'Cobro registrado' });
    const value = (term: string) => within(summary).getByText(term).nextElementSibling;
    expect(value('Alumno')).toHaveTextContent('Martina López Herrera');
    expect(within(summary).getByRole('link', { name: 'Martina López Herrera' })).toHaveAttribute(
      'href',
      '/panel/alumnos/s1',
    );
    expect(value('Pago')).toHaveTextContent('45 € · Efectivo');
    expect(value('Concepto')).toHaveTextContent('Octubre 2026');
    expect(within(summary).queryByText(/R-2026-0027/)).not.toBeInTheDocument();
    expect(screen.queryByText('Recibo')).not.toBeInTheDocument();
    expect(screen.queryByText(/Numeración de documentos ·|Último número/)).not.toBeInTheDocument();
    expect(screen.queryByText('Alta · Cobro')).not.toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Ir al cobro' })).toHaveAttribute(
      'href',
      '/panel/cobros?pestana=registro&recibo=p1',
    );
    expect(
      within(summary).getByRole('link', { name: 'Ir a las cuotas de octubre 2026' }),
    ).toHaveAttribute('href', '/panel/cobros?mes=2026-10');
  });

  it('keeps the field by field detail for actions that are not a payment', async () => {
    api({
      'GET /api/admin/audit/actions/a1': [
        200,
        {
          ...DETAIL,
          changes: [
            {
              table: 'students_student',
              tableLabel: 'Alumno',
              title: 'Martina López Herrera',
              key: { id: 's1' },
              operation: 'U',
              fields: [{ field: 'phone', before: '600 000 000', after: '611 111 111' }],
              target: { kind: 'student', id: 's1' },
            },
          ],
        },
      ],
    });
    renderApp('/panel/historial');
    const table = await screen.findByRole('table', { name: 'Historial de acciones' });
    await userEvent.click(
      within(table).getByRole('button', { name: 'Ver detalle de Registrar cobro' }),
    );
    expect(await screen.findByText('Cambio · Alumno')).toBeInTheDocument();
    expect(screen.getByText('611 111 111')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al alumno' })).toHaveAttribute(
      'href',
      '/panel/alumnos/s1',
    );
  });

  it('shows every group of the student before and after an enrolment change', async () => {
    const group = (groupId: string, groupName: string, extra = {}) => ({
      groupId,
      groupName,
      startsOn: null,
      endsOn: null,
      ...extra,
    });
    api({
      'GET /api/admin/audit/actions/a1': [
        200,
        {
          ...DETAIL,
          changes: [
            {
              table: 'classes_enrolment',
              tableLabel: 'Inscripción',
              title: 'Miguel Ángel Cabezas · Martes 17:00 · Iniciación · Peón',
              key: { id: 'e1' },
              operation: 'U',
              fields: [{ field: 'ends_on', before: null, after: '2026-10-26' }],
              target: { kind: 'student', id: 's2' },
            },
          ],
          studentGroups: [
            {
              studentId: 's2',
              studentName: 'Miguel Ángel Cabezas',
              before: [
                group('g1', 'Martes 17:00 · Iniciación · Peón'),
                group('g2', 'Miércoles 17:00 · Iniciación · Peón', { endsOn: '2026-12-20' }),
              ],
              after: [group('g2', 'Miércoles 17:00 · Iniciación · Peón', { endsOn: '2026-12-20' })],
            },
            {
              studentId: 's3',
              studentName: 'Leo Ruiz',
              before: [],
              after: [group('g3', 'Jueves 18:30 · Avanzado', { startsOn: '2026-11-02' })],
            },
          ],
        },
      ],
    });
    renderApp('/panel/historial');
    const table = await screen.findByRole('table', { name: 'Historial de acciones' });
    await userEvent.click(
      within(table).getByRole('button', { name: 'Ver detalle de Registrar cobro' }),
    );

    const miguel = await screen.findByRole('region', { name: 'Grupos de Miguel Ángel Cabezas' });
    const before = within(miguel).getByRole('definition', { name: 'Antes' });
    const after = within(miguel).getByRole('definition', { name: 'Después' });
    expect(before).toHaveTextContent(
      'Martes 17:00 · Iniciación · Peón, Miércoles 17:00 · Iniciación · Peón (hasta 20/12/2026)',
    );
    expect(after).toHaveTextContent('Miércoles 17:00 · Iniciación · Peón (hasta 20/12/2026)');
    expect(
      within(before).getByRole('link', { name: 'Martes 17:00 · Iniciación · Peón' }),
    ).toHaveAttribute('href', '/panel/clases?grupo=g1');

    const leo = screen.getByRole('region', { name: 'Grupos de Leo Ruiz' });
    expect(within(leo).getByRole('definition', { name: 'Antes' })).toHaveTextContent('Sin grupos');
    expect(within(leo).getByRole('definition', { name: 'Después' })).toHaveTextContent(
      'Jueves 18:30 · Avanzado (desde 02/11/2026)',
    );
    // Debajo sigue el detalle campo a campo.
    expect(screen.getByText('Cambio · Inscripción')).toBeInTheDocument();
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
              category: 'system',
              label: 'Inicio de sesión',
              detail: null,
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
        .map((row) =>
          ['Registrar cobro', 'Inicio de sesión'].find((l) => row.textContent?.includes(l)),
        );

    expect(labels()).toEqual(['Registrar cobro', 'Inicio de sesión']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por fecha y hora' }));
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por persona' }));
    expect(labels()).toEqual(['Registrar cobro', 'Inicio de sesión']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por persona' }));
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    await user.click(within(table).getByRole('button', { name: /Acción/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Ordenar y filtrar por acción' })).getByRole(
        'radio',
        { name: 'De la Z a la A' },
      ),
    );
    // Por categoría y, dentro, por acción: «Cuentas y sistema» va después de «Cobros».
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    // Lo que no afectó a nada va primero.
    await user.click(screen.getByRole('button', { name: 'Ordenar por afecta a' }));
    expect(labels()).toEqual(['Inicio de sesión', 'Registrar cobro']);
    await user.click(screen.getByRole('button', { name: 'Ordenar por afecta a' }));
    expect(labels()).toEqual(['Registrar cobro', 'Inicio de sesión']);
  });

  it('filters by category from the action header, asking the server for the whole history', async () => {
    const user = userEvent.setup();
    const categories = [
      { category: 'charges', count: 4 },
      { category: 'payments', count: 1 },
    ];
    const fetch = api({
      'GET /api/admin/audit/actions': [200, { ...ACTIONS, categories }],
      'GET /api/admin/audit/actions?category=charges': [
        200,
        {
          ...ACTIONS,
          items: [
            action({
              id: 'a7',
              category: 'charges',
              label: 'Volver a la cuota calculada',
              detail: 'Cuota de octubre 2026 · Martina López Herrera',
            }),
          ],
          categories,
        },
      ],
    });
    renderApp('/panel/historial');

    const table = await screen.findByRole('table', { name: 'Historial de acciones' });
    await user.click(within(table).getByRole('button', { name: /Acción/ }));
    const menu = screen.getByRole('dialog', { name: 'Ordenar y filtrar por acción' });
    // Las categorías de todo el historial, aunque sus acciones aún no se hayan cargado.
    const options = within(within(menu).getByRole('group', { name: 'Filtrar' })).getAllByRole(
      'checkbox',
    );
    expect(options.map((o) => o.closest('label')?.textContent)).toEqual([
      'Cuotas (4)',
      'Cobros (1)',
    ]);
    await user.click(options[0] as HTMLElement);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/audit/actions?category=charges',
        expect.anything(),
      ),
    );
    const row = await within(table).findByRole('row', { name: /Volver a la cuota calculada/ });
    expect(row).toHaveTextContent('Cuota de octubre 2026 · Martina López Herrera');
    expect(within(table).queryByRole('row', { name: /Registrar cobro/ })).not.toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /Acción/ })).toHaveTextContent('(1)');
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
    expect(
      await screen.findByText('No hay clases con lista o notas esta semana.'),
    ).toBeInTheDocument();
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

  it('shows one row per class in «Asistencia y notas» and, open, the whole day with its notes', async () => {
    api({
      'GET /api/admin/audit/actions?section=attendance&period=today': [
        200,
        {
          items: [
            {
              groupId: 'g1',
              label: 'Martes 17:00',
              date: '2026-10-15',
              actions: [
                action({
                  id: 'a2',
                  seq: 12,
                  userName: 'Carlos Ruiz Márquez',
                  label: 'Comentar una clase',
                  occurredAt: '2026-10-15T19:50:00+02:00',
                  changeCount: 1,
                  affected: ['Comentario de clase'],
                }),
                action({
                  id: 'a1',
                  seq: 11,
                  userName: 'Carlos Ruiz Márquez',
                  label: 'Pasar lista',
                  occurredAt: '2026-10-15T19:47:00+02:00',
                  changeCount: 2,
                  affected: ['Falta a clase', 'Lista de clase'],
                }),
              ],
              notes: [
                {
                  id: 'n1',
                  studentName: null,
                  text: 'Mates de torres',
                  author: 'Carlos Ruiz Márquez',
                },
                {
                  id: 'n2',
                  studentName: 'Martina López Herrera',
                  text: 'Ha venido con reloj nuevo',
                  author: 'Carlos Ruiz Márquez',
                },
              ],
            },
          ],
          people: [],
        },
      ],
      'GET /api/admin/attendance/groups/g1?month=2026-10': [
        200,
        {
          groupId: 'g1',
          name: 'Martes 17:00',
          month: '2026-10',
          days: [
            { date: '2026-10-13', status: 'taken' },
            { date: '2026-10-15', status: 'taken' },
          ],
          students: [
            {
              id: 's1',
              name: 'Martina López Herrera',
              marks: ['present', 'absent'],
              attended: 1,
              classes: 2,
              member: true,
            },
          ],
        },
      ],
    });
    renderApp('/panel/historial?seccion=asistencia');

    const table = await screen.findByRole('table', { name: 'Clases' });
    const row = within(table).getByRole('row', { name: /Martes 17:00/ });
    expect(row).toHaveTextContent('15/10/2026');
    expect(row).toHaveTextContent('Carlos Ruiz Márquez');
    expect(row).toHaveTextContent('Comentar una clase · Pasar lista · 2 notas');
    expect(within(table).getAllByRole('row')).toHaveLength(2);

    await userEvent.click(
      within(row).getByRole('button', { name: 'Ver la clase Martes 17:00 · 15/10/2026' }),
    );
    // El cuadro de asistencia del grupo ese mes, con el día de la clase; las notas; y lo que se hizo, con deshacer.
    const grid = await screen.findByRole('table', {
      name: 'Asistencia de Martes 17:00 en octubre 2026',
    });
    expect(within(grid).getByLabelText('Martina López Herrera faltó el 15/10')).toBeInTheDocument();
    expect(within(grid).getByRole('link', { name: 'Martina López Herrera' })).toHaveAttribute(
      'href',
      '/panel/historial?seccion=asistencia&ficha=s1',
    );
    const notes = screen.getByRole('region', { name: 'Notas' });
    expect(notes).toHaveTextContent('Mates de torres');
    expect(notes).toHaveTextContent('Martina López Herrera: Ha venido con reloj nuevo');
    const done = screen.getByRole('region', { name: 'Qué se hizo' });
    expect(done).toHaveTextContent('15/10/2026 19:47Carlos Ruiz MárquezPasar lista');
    expect(within(done).getByRole('button', { name: 'Deshacer Pasar lista' })).toBeInTheDocument();
    expect(
      within(done).getByRole('button', { name: 'Volver a este punto: Comentar una clase' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Alta · Cobro')).not.toBeInTheDocument();
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
          studentsChange: 0,
          studentsInClasses: 0,
          inClassesChange: 0,
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
