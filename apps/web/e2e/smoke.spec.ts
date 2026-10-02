import { expect, test } from '@playwright/test';

test('should show the home page connected to the API and the database', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /club ajedrez puerta elvira/i })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('API conectada');
});

test('should answer API errors with the JSON error envelope', async ({ request }) => {
  const response = await request.get('/api/does-not-exist');

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: 'not_found', message: 'Recurso no encontrado.' },
  });
});

test('should keep the home page public and the session endpoint closed without a session', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /acceso administración/i })).toBeVisible();

  const me = await request.get('/api/auth/me');
  expect(me.status()).toBe(401);
});
