import { screen } from '@testing-library/react';

import { mockFetchResponse, renderWithProviders } from '@/test/render';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('should show the club name and logo', () => {
    mockFetchResponse(200, { status: 'healthy', database: 'reachable' });

    renderWithProviders(<HomePage />);

    expect(screen.getByRole('heading', { name: /club ajedrez puerta elvira/i })).toBeVisible();
    expect(screen.getByRole('img', { name: /club ajedrez puerta elvira/i })).toBeVisible();
  });

  it('should show that the API is connected when the health check succeeds', async () => {
    mockFetchResponse(200, { status: 'healthy', database: 'reachable' });

    renderWithProviders(<HomePage />);

    expect(await screen.findByText('API conectada')).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('should show that the API is unavailable when the health check fails', async () => {
    mockFetchResponse(503, { status: 'unhealthy', database: 'unreachable' });

    renderWithProviders(<HomePage />);

    expect(await screen.findByText('API sin conexión')).toBeVisible();
  });

  it('should show that the API is being checked while waiting for the answer', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

    renderWithProviders(<HomePage />);

    expect(screen.getByText('Comprobando la API…')).toBeVisible();
  });
});
