import { screen } from '@testing-library/react';

import { NO_SESSION, mockApi, renderApp } from '@/test/render';

describe('HomePage', () => {
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
