import { mockFetchResponse } from '@/test/render';

import { ApiError, apiGet } from './client';

describe('apiGet', () => {
  it('should return the parsed body when the response is successful', async () => {
    mockFetchResponse(200, { value: 42 });

    await expect(apiGet('/api/anything')).resolves.toEqual({ value: 42 });
  });

  it('should throw an ApiError with the envelope code and message when the API fails', async () => {
    mockFetchResponse(404, { error: { code: 'not_found', message: 'Recurso no encontrado.' } });

    await expect(apiGet('/api/missing')).rejects.toEqual(
      new ApiError(404, 'not_found', 'Recurso no encontrado.'),
    );
  });

  it('should throw a generic ApiError when the failing response has no envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad gateway', { status: 502 }));

    const error = await apiGet('/api/down').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'http_error', message: 'HTTP 502' });
  });
});
