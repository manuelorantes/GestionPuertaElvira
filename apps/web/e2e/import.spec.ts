import { expect, test } from '@playwright/test';

// Datos de `make e2e`: Martina López Herrera y Pablo López Herrera existen; el tercer nombre es nuevo.
test.skip(({ isMobile }) => isMobile, 'Modifica datos compartidos: solo en escritorio');

const SHEET = [
  ',Fotos,,Cuota Anual,Chandal y polo,Federativa,Septiembre,Octubre,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail',
  'Martina Lopez Herrera,,,50,,,45,45,12/3/2014,Rocío Herrera,612481930,rocio@ejemplo.com',
  'Importado De Prueba,,,,,,20,,7/2/17,Torcuato Prueba,690666005,torcuato@ejemplo.com',
  'Pablo Lopez,,,,,,30,,22/1/2017,Rocío Herrera,612481930,rocio@ejemplo.com',
].join('\n');

test('should review the sheet, import row by row and warn about a possible duplicate', async ({
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
  const martina = page.getByRole('listitem', { name: 'Martina Lopez Herrera' });
  const nuevo = page.getByRole('listitem', { name: 'Importado De Prueba' });
  const pablo = page.getByRole('listitem', { name: 'Pablo Lopez' });
  await expect(martina).toContainText('Encontrado: Martina López Herrera');
  await expect(pablo).toContainText('Posible duplicado: Pablo López Herrera');

  await martina.getByRole('button', { name: /Aceptar fila/ }).click();
  await expect(martina).toContainText('Importada: vinculada');

  await nuevo.getByLabel('Grupo').selectOption({ index: 1 });
  await nuevo.getByRole('button', { name: /Aceptar fila/ }).click();
  await expect(nuevo).toContainText('Importada: alumno creado · 1 cobro');

  await pablo.getByLabel('Grupo').selectOption({ index: 1 });
  await pablo.getByRole('button', { name: /Aceptar fila/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Posible duplicado' });
  await expect(dialog).toContainText('Pablo López Herrera');
  await dialog
    .getByRole('button', { name: /Es la misma persona: vincular a Pablo López Herrera/ })
    .click();
  await expect(pablo).toContainText('Importada: vinculada');

  await page.getByRole('link', { name: 'Volver a Alumnos' }).click();
  await page.getByRole('searchbox', { name: 'Buscar alumnos' }).fill('Importado');
  await expect(page.getByRole('button', { name: /Importado De Prueba/ })).toBeVisible();
  await page.goto('/panel/historial');
  await expect(
    page.getByRole('row', { name: /Importar fila de la hoja: Importado De Prueba/ }).first(),
  ).toBeVisible();
});
