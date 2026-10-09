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

test('should go back to the summary when leaving another account or pressing the club logo', async ({
  page,
}) => {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen del club' })).toBeVisible();

  // Entrar como administración, ir a otra sección y volver: de vuelta en el resumen.
  await page.getByRole('link', { name: /usuarios/i }).click();
  const row = page.getByRole('row', { name: /junta@puertaelvira.test/ });
  await row.getByRole('button', { name: /Entrar como/ }).click();
  await page
    .getByRole('dialog', { name: 'Entrar como esta cuenta' })
    .getByRole('button', { name: 'Entrar' })
    .click();
  await expect(page.getByRole('button', { name: 'Volver a mi cuenta' })).toBeVisible();
  await page.getByRole('link', { name: /clases/i }).click();
  await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a mi cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Volver a mi cuenta' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole('heading', { name: 'Resumen del club' })).toBeVisible();

  // Lo mismo entrando como un profesor (su portada es otra) desde «Mis pagos».
  await page.getByRole('link', { name: /usuarios/i }).click();
  await page
    .getByRole('row', { name: /profe@puertaelvira.test/ })
    .getByRole('button', { name: /Entrar como/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Entrar como esta cuenta' })
    .getByRole('button', { name: 'Entrar' })
    .click();
  await page.getByRole('link', { name: /Mis pagos/ }).click();
  await expect(page).toHaveURL(/mis-pagos/);
  await page.getByRole('button', { name: 'Volver a mi cuenta' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole('heading', { name: 'Resumen del club' })).toBeVisible();

  // El logo del club lleva al resumen desde cualquier sección.
  await page.getByRole('link', { name: /clases/i }).click();
  await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible();
  await page.getByRole('link', { name: 'Ir al inicio' }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole('heading', { name: 'Resumen del club' })).toBeVisible();
});
