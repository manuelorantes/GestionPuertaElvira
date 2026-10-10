import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const RUN = {
  startedAt: '2026-10-10T20:00:00Z',
  finishedAt: '2026-10-10T20:00:05Z',
  launchedBy: 'Tarea nocturna',
  openCount: 3,
  newCount: 1,
  resolvedCount: 0,
};

const FINDINGS = [
  {
    id: 'f1',
    rule: 'fee_mismatch',
    ruleTitle: 'Cuota distinta de la tarifa',
    severity: 'money',
    entity: { kind: 'student', id: 's1', label: 'Paula Gómez Ruiz' },
    explanation: 'La cuota de octubre 2026 es de 36 €. Le corresponden 49,50 €.',
    proposal: 'Ajustar la cuota de octubre 2026 a 49,50 €.',
    hasFix: true,
    status: 'open',
    detectedAt: '2026-10-10T20:00:00Z',
    lastSeenAt: '2026-10-10T20:00:00Z',
    closedAt: null,
    closedBy: null,
  },
  {
    id: 'f2',
    rule: 'paid_but_no_group',
    ruleTitle: 'Pagó algún mes y ya no tiene grupo',
    severity: 'club',
    entity: { kind: 'student', id: 's2', label: 'David Sanz Cano' },
    explanation: 'Pagó septiembre y hoy no está en ningún grupo.',
    proposal: 'Inscribirlo o darlo de baja desde su ficha.',
    hasFix: false,
    status: 'open',
    detectedAt: '2026-10-10T20:00:00Z',
    lastSeenAt: '2026-10-10T20:00:00Z',
    closedAt: null,
    closedBy: null,
  },
  {
    id: 'f3',
    rule: 'generic_category',
    ruleTitle: 'Gasto en una categoría genérica que tiene la suya',
    severity: 'money',
    entity: { kind: 'entry', id: 'e1', label: 'Limpieza del local · 150 €' },
    explanation: '«Limpieza del local» está en «Otros gastos».',
    proposal: 'Cambiar la categoría a «Limpieza».',
    hasFix: true,
    status: 'open',
    detectedAt: '2026-10-10T20:00:00Z',
    lastSeenAt: '2026-10-10T20:00:00Z',
    closedAt: null,
    closedBy: null,
  },
];

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/diagnostics?status=open': [200, { run: RUN, items: FINDINGS }],
    'GET /api/admin/diagnostics?status=dismissed': [
      200,
      {
        run: RUN,
        items: [
          {
            ...FINDINGS[1],
            id: 'f9',
            status: 'dismissed',
            closedAt: '2026-10-09T10:00:00Z',
            closedBy: 'Junta',
          },
        ],
      },
    ],
    ...extra,
  });
}

describe('Diagnóstico', () => {
  it('lists the open findings grouped by severity and rule, with the last run', async () => {
    api();
    renderApp('/panel/contabilidad?pestana=diagnostico');

    expect(await screen.findByText(/3 hallazgos abiertos/)).toBeInTheDocument();
    expect(screen.getByText(/Tarea nocturna/)).toBeInTheDocument();
    const money = screen.getByRole('region', { name: /Dinero/ });
    expect(
      within(money).getByRole('heading', { name: 'Cuota distinta de la tarifa' }),
    ).toBeInTheDocument();
    expect(within(money).getByRole('link', { name: 'Paula Gómez Ruiz' })).toHaveAttribute(
      'href',
      expect.stringContaining('s1'),
    );
    expect(within(money).getByText(/Le corresponden 49,50 €/)).toBeInTheDocument();
    expect(within(money).getByText(/Ajustar la cuota/)).toBeInTheDocument();
    const club = screen.getByRole('region', { name: /Datos del club/ });
    expect(within(club).getByText('David Sanz Cano')).toBeInTheDocument();
    // Sin arreglo automático solo se puede descartar.
    expect(within(club).queryByRole('button', { name: 'Aceptar' })).toBeNull();
    expect(within(club).getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
    expect(within(money).getAllByRole('button', { name: 'Aceptar' })).toHaveLength(2);
  });

  it('runs a diagnosis from the button and reloads the list', async () => {
    const fetchMock = api({
      'POST /api/admin/diagnostics/run': [
        200,
        { ...RUN, launchedBy: 'Lucía Moreno Gil', newCount: 0 },
      ],
    });
    renderApp('/panel/contabilidad?pestana=diagnostico');
    await screen.findByText(/3 hallazgos abiertos/);

    await userEvent.click(screen.getByRole('button', { name: 'Diagnosticar' }));

    expect(await screen.findByText('Diagnóstico terminado: nada nuevo')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => String(url) === '/api/admin/diagnostics?status=open',
        ),
      ).toHaveLength(2),
    );
  });

  it('accepts a finding after confirming and applies its fix', async () => {
    const fetchMock = api({ 'POST /api/admin/diagnostics/findings/f1/accept': [204] });
    renderApp('/panel/contabilidad?pestana=diagnostico');
    const money = await screen.findByRole('region', { name: /Dinero/ });
    const card = within(money).getByText('Paula Gómez Ruiz').closest('li') as HTMLElement;

    await userEvent.click(within(card).getByRole('button', { name: 'Aceptar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Ajustar la cuota de octubre 2026/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aceptar y aplicar' }));

    expect(await screen.findByText('Arreglo aplicado')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === '/api/admin/diagnostics/findings/f1/accept' && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('explains when the data changed since the diagnosis', async () => {
    api({
      'POST /api/admin/diagnostics/findings/f1/accept': [
        409,
        { error: { code: 'finding_outdated', message: 'Los datos han cambiado.' } },
      ],
    });
    renderApp('/panel/contabilidad?pestana=diagnostico');
    const money = await screen.findByRole('region', { name: /Dinero/ });
    const card = within(money).getByText('Paula Gómez Ruiz').closest('li') as HTMLElement;

    await userEvent.click(within(card).getByRole('button', { name: 'Aceptar' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aceptar y aplicar' }),
    );

    expect(
      await within(card).findByText(/Los datos han cambiado desde el diagnóstico/),
    ).toBeInTheDocument();
  });

  it('dismisses a finding and shows the dismissed ones', async () => {
    const fetchMock = api({ 'POST /api/admin/diagnostics/findings/f2/dismiss': [204] });
    renderApp('/panel/contabilidad?pestana=diagnostico');
    const club = await screen.findByRole('region', { name: /Datos del club/ });

    await userEvent.click(within(club).getByRole('button', { name: 'Descartar' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descartar' }),
    );
    expect(await screen.findByText('Hallazgo descartado')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === '/api/admin/diagnostics/findings/f2/dismiss' && init?.method === 'POST',
      ),
    ).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Descartados' }));
    expect(await screen.findByText(/Descartado 09\/10\/2026 12:00 · Junta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
  });
});
