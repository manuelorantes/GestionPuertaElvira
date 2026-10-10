import { expect, test } from '@playwright/test';

// Cuenta de `make seed` profe@ (profesorado), vinculada por `make e2e` a Lucía Moreno Gil, que da clase de lunes a
// viernes. Solo lee datos: corre en escritorio y en móvil.
const month = new Date().getMonth() + 1;
test.skip(month === 7 || month === 8, 'En julio y agosto no hay clases');

test('a teacher sees their classes, groups and pay, and the club classes and students read only', async ({
  page,
  isMobile,
}) => {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('profe@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-profe');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByText('Iniciación A').first()).toBeVisible();

  const nav = page.getByRole('navigation', { name: isMobile ? 'Secciones móvil' : 'Secciones' });
  await expect(nav.getByRole('link', { name: /Cobr/ })).toHaveCount(0);
  await nav.getByRole('link', { name: /Mis grupos/ }).click();
  await page
    .getByRole('link', { name: /^Ver Iniciación A/ })
    .first()
    .click();
  await expect(page.getByRole('region', { name: 'Comentarios' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Alumnos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Asistencia' })).toBeVisible();
  await nav.getByRole('link', { name: /Mis pagos/ }).click();
  await expect(page.getByText('Te debemos')).toBeVisible();

  // Clases y Alumnos del club, de solo lectura.
  await nav.getByRole('link', { name: /^Clases/ }).click();
  await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo grupo' })).toHaveCount(0);
  await nav.getByRole('link', { name: /^Alumnos/ }).click();
  await expect(page.getByRole('heading', { name: 'Alumnos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo alumno' })).toHaveCount(0);

  // El resto de secciones del club le devuelven a sus clases, y la API no le da las tarifas.
  await page.goto('/panel/cobros');
  await expect(page.getByRole('heading', { name: 'Mis clases' })).toBeVisible();
  expect((await page.request.get('/api/admin/students')).status()).toBe(200);
  expect((await page.request.get('/api/admin/teachers')).status()).toBe(403);
});
