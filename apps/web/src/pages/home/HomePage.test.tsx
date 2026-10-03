import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NO_SESSION, mockApi, renderApp } from '@/test/render';

const PRICES = {
  season: '2026/27',
  tiers: [
    { weeklyHours: 3, monthlyCents: 5500 },
    { weeklyHours: 2, monthlyCents: 4500 },
    { weeklyHours: 1.5, monthlyCents: 4000 },
    { weeklyHours: 1, monthlyCents: 3500 },
  ],
  membershipCents: 5000,
  familyPercent: 10,
  prepaymentPercent: { threeMonths: 10, sixMonths: 15, season: 20 },
  privateHourCents: 3000,
};

describe('HomePage', () => {
  it('should publish the prices and discounts of the season', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockApi({
      'GET /api/health': [200, { status: 'healthy', database: 'reachable' }],
      'GET /api/auth/me': NO_SESSION,
      'GET /api/public/prices': [200, PRICES],
    });

    renderApp('/');

    const prices = await screen.findByRole('region', { name: 'Precios y descuentos 2026/27' });
    const fees = within(prices).getByRole('list', { name: 'Cuotas de clases' });
    expect(within(fees).getByRole('listitem', { name: /3 horas semanales/ })).toHaveTextContent(
      '55 €',
    );
    expect(
      within(fees).getByRole('listitem', { name: /1 hora y media semanal/ }),
    ).toHaveTextContent('40 €');
    expect(within(prices).getByText('50 €')).toBeInTheDocument();
    expect(within(prices).getAllByText('10 %')).toHaveLength(2);
    expect(within(prices).getByText('20 %')).toBeInTheDocument();
    expect(within(prices).getByText(/Clases particulares: 30 € la hora/)).toBeInTheDocument();
    expect(within(prices).getByText('5 puntos = 5 %')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver precios 2026/27' }));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('should show the club name and logo without a session', async () => {
    mockApi({
      'GET /api/health': [200, { status: 'healthy', database: 'reachable' }],
      'GET /api/auth/me': NO_SESSION,
    });

    renderApp('/');

    expect(screen.getByRole('heading', { name: /club ajedrez puerta elvira/i })).toBeVisible();
    expect(
      screen.getAllByRole('img', { name: /club ajedrez puerta elvira/i }).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText('API conectada')).toBeVisible();
  });

  it('should show that the API is unavailable when the health check fails', async () => {
    mockApi({
      'GET /api/health': [503, { status: 'unhealthy', database: 'unreachable' }],
      'GET /api/auth/me': NO_SESSION,
    });

    renderApp('/');

    expect(await screen.findByText('API sin conexión')).toBeVisible();
  });

  it('should show that the API is being checked while waiting for the answer', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

    renderApp('/');

    expect(screen.getByText('Comprobando la API…')).toBeVisible();
  });
});
