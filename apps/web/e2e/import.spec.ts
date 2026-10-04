import { expect, test } from '@playwright/test';

// Datos de `make e2e`: Martina López Herrera existe; el otro nombre es nuevo.
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

const SHEET = [
  ',Fotos,,Cuota Anual,Chandal y polo,Federativa,Septiembre,Octubre,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail',
  'Martina Lopez Herrera,,,50,,,45,45,12/3/2014,Rocío Herrera,612481930,rocio@ejemplo.com',
  'Importado De Prueba,,,,,,20,,7/2/17,Torcuato Prueba,690666005,torcuato@ejemplo.com',
].join('\n');

test('should review the sheet, create the unknown student and record the payments', async ({
  page,
}) => {
  await page.goto('/?acceso=1');
  await page.getByLabel('Email').fill('admin@puertaelvira.test');
  await page.getByLabel('Contraseña').fill('desarrollo-admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: /alumnos/i }).click();
  await page.getByRole('link', { name: 'Importar hoja' }).click();

  await page.getByLabel('Celdas pegadas o contenido del CSV').fill(SHEET);
  await page.getByRole('button', { name: 'Revisar la hoja' }).click();
  const rows = page.getByRole('list', { name: 'Filas de la hoja' }).getByRole('listitem');
  await expect(rows.nth(0)).toContainText('Encontrado: Martina López Herrera');
  await expect(rows.nth(1)).toContainText('Nuevo');
  await rows.nth(1).getByLabel('Grupo').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Importar 2 filas' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Importar' }).click();

  await expect(page.getByText('Importación hecha')).toBeVisible();
  await expect(page.getByText('1 alumnos creados y 1 vinculados (0 filas omitidas)')).toBeVisible();

  await page.getByRole('link', { name: 'Ver alumnos' }).click();
  await page.getByRole('searchbox', { name: 'Buscar alumnos' }).fill('Importado');
  await expect(page.getByRole('button', { name: /Importado De Prueba/ })).toBeVisible();
  await page.goto('/panel/cobros?pestana=registro');
  await expect(page.getByRole('row', { name: /Importado De Prueba/ }).first()).toContainText(
    '20 €',
  );
});
