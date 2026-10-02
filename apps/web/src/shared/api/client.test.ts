import { mockFetchResponse } from '@/test/render';

import { ApiError, apiGet, apiSend } from './client';

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

describe('apiSend', () => {
  it('should send a JSON body with the method and return nothing when the response is empty', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiSend('PUT', '/api/auth/password', { a: 1 })).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/password',
      expect.objectContaining({
        method: 'PUT',
        body: '{"a":1}',
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('should expose the retry delay when the API asks to wait', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'too_many_requests', message: 'Espera' } }), {
        status: 429,
        headers: { 'Retry-After': '120' },
      }),
    );

    await expect(apiSend('POST', '/api/auth/login', {})).rejects.toMatchObject({
      status: 429,
      code: 'too_many_requests',
      retryAfterSeconds: 120,
    });
  });
});

describe('error details', () => {
  it('should expose structured details sent by the API', async () => {
    mockFetchResponse(409, {
      error: { code: 'group_full', message: 'Completo', details: { occupied: 12, capacity: 12 } },
    });

    await expect(apiGet('/api/x')).rejects.toMatchObject({
      details: { occupied: 12, capacity: 12 },
    });
  });
});
