import { expect, test } from '@playwright/test';

// Cuentas de `make seed`: admin@ es superadministración; junta@ es administración.
test.skip(({ isMobile }) => isMobile, 'La barra lateral con el rol es de escritorio');

test('should keep the history for superadministrators only', async ({ page }) => {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('junta@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-junta');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Resumen del club' })).toBeVisible();
  await expect(page.getByText('Administración', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Historial/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Cobros y cuotas/ })).toBeVisible();

  const history = await page.request.get('/api/admin/audit/actions');
  expect(history.status()).toBe(403);

  await page.goto('/panel/historial');
  await expect(page.getByRole('heading', { name: 'Resumen del club' })).toBeVisible();
});
