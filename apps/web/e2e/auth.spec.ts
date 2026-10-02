import { expect, test, type Page } from '@playwright/test';

// Usuarios sembrados por `make seed` (solo desarrollo).
const ADMIN = { email: 'admin@puertaelvira.test', password: 'desarrollo-admin' };
const TEMPORARY = { email: 'nuevo@puertaelvira.test', password: 'desarrollo-nuevo' };

async function logIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/');
  await page.getByRole('button', { name: /acceso administración/i }).click();
  const dialog = page.getByRole('dialog', { name: /acceso administración/i });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Contraseña').fill(password);
  await dialog.getByRole('button', { name: 'Entrar' }).click();
}

test('should enter the panel and leave it, without showing data when going back', async ({
  page,
}) => {
  await logIn(page, ADMIN);

  await expect(page.getByRole('heading', { name: /resumen del club/i })).toBeVisible();
  await expect(page).toHaveURL(/\/panel$/);

  await page
    .getByRole('button', { name: /cerrar sesión/i })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /acceso administración/i })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: /resumen del club/i })).toBeHidden();

  await page.goto('/panel');
  await expect(page.getByRole('heading', { name: /resumen del club/i })).toBeHidden();
  await expect(page.getByRole('dialog', { name: /acceso administración/i })).toBeVisible();
});

test('should send people without a session from the panel to the login dialog', async ({
  page,
}) => {
  await page.goto('/panel');

  await expect(page.getByRole('dialog', { name: /acceso administración/i })).toBeVisible();
  await expect(page).toHaveURL(/acceso=1/);
});

test('should reject wrong credentials with a generic message', async ({ page }) => {
  await logIn(page, { email: ADMIN.email, password: 'no-es-la-buena' });

  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.');
});

test.describe('flujos que modifican datos compartidos', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'Se ejecutan una sola vez (escritorio) para no competir por los mismos datos',
  );

  test('should force a new password before entering with a temporary one', async ({ page }) => {
    await logIn(page, TEMPORARY);

    await expect(page.getByRole('heading', { name: /elige tu contraseña/i })).toBeVisible();
    await page.goto('/panel');
    await expect(page.getByRole('heading', { name: /elige tu contraseña/i })).toBeVisible();

    await page.getByLabel('Contraseña actual', { exact: true }).fill(TEMPORARY.password);
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('nueva-apertura-italiana');
    await page.getByLabel('Repite la nueva contraseña').fill('nueva-apertura-italiana');
    await page.getByRole('button', { name: 'Guardar y entrar' }).click();

    await expect(page.getByRole('heading', { name: /resumen del club/i })).toBeVisible();
  });

  test('should block an email after five failed attempts', async ({ page }) => {
    const target = {
      email: `bloqueo-${Date.now()}@puertaelvira.test`,
      password: 'intento-fallido',
    };
    await logIn(page, target);
    const dialog = page.getByRole('dialog');
    for (let attempt = 2; attempt <= 5; attempt++) {
      await dialog.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.');
    }

    await dialog.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('alert')).toContainText('Demasiados intentos');
  });
});
