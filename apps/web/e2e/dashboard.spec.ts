import { expect, test } from '@playwright/test';

// Datos de `make e2e`: cobros desde septiembre con dos alumnos que no pagaron los meses anteriores.
const month = new Date().getMonth() + 1;

test('should summarise the club with real figures', async ({ page }) => {
  test.skip(month === 7 || month === 8, 'En julio y agosto no hay cuotas');
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText(/^Cobrado en /)).toBeVisible();
  await expect(page.getByRole('img', { name: /Lo que entra y sale cada mes/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Lo que corresponde a cada mes/ })).toBeVisible();
  await expect(page.getByText('Ocupación de clases')).toBeVisible();
  if (month !== 9) {
    await expect(page.getByRole('region', { name: 'Recibos vencidos' })).toContainText(
      'Irene Moreno Salas',
    );
  }
});
