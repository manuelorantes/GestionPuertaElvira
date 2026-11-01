import {
  movementsFromPdf,
  movementsFromRows,
  parseAmount,
  parseDate,
  type PdfText,
  readXlsxRows,
  StatementError,
} from './statement';

/** Un zip sin comprimir (método 0) con los ficheros dados: basta para leerlo como un `.xlsx`. */
function storedZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: number[] = [];
  const central: number[] = [];
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = [...encoder.encode(name)];
    const data = [...encoder.encode(text)];
    const offset = locals.length;
    locals.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
    );
    locals.push(
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
      ...data,
    );
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
    );
    central.push(
      ...u32(0),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),
    );
    central.push(...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes);
  }
  const count = Object.keys(files).length;
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(count), ...u16(count)];
  end.push(...u32(central.length), ...u32(locals.length), ...u16(0));
  return new Uint8Array([...locals, ...central, ...end]);
}

describe('bank statement', () => {
  it('reads amounts and dates as the bank writes them', () => {
    expect(parseAmount('-1.020,00 EUR')).toBe(-102000);
    expect(parseAmount('95,00 EUR')).toBe(9500);
    expect(parseAmount('-43.76')).toBe(-4376);
    expect(parseAmount('Saldo')).toBeNull();
    expect(parseDate('30/10/2026')).toBe('2026-10-30');
    expect(parseDate('46325')).toBe('2026-10-30');
    expect(parseDate('Fecha')).toBeNull();
  });

  it('reads the movements of the excel below its header', async () => {
    const shared = [
      'Fecha Operación',
      'Fecha Valor',
      'Concepto',
      'Importe',
      'Saldo',
      'Recibo Digi',
      'Cuota Ana',
    ];
    const cell = (ref: string, value: string | number) =>
      typeof value === 'number'
        ? `<c r="${ref}"><v>${value}</v></c>`
        : `<c r="${ref}" t="s"><v>${shared.indexOf(value)}</v></c>`;
    const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="7"><c r="A7" t="inlineStr"><is><t>Movimientos</t></is></c></row>
      <row r="8">${['A', 'B', 'C', 'D', 'F'].map((col, i) => cell(`${col}8`, shared[i] ?? '')).join('')}</row>
      <row r="9">${cell('A9', 46324)}${cell('B9', 46323)}${cell('C9', 'Recibo Digi')}${cell('D9', -12)}${cell('F9', 7287.35)}</row>
      <row r="10">${cell('A10', 46323)}${cell('B10', 46323)}${cell('C10', 'Cuota Ana')}${cell('D10', 55)}${cell('F10', 7299.35)}</row>
    </sheetData></worksheet>`;
    const strings = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
      .map((s) => `<si><t>${s}</t></si>`)
      .join('')}</sst>`;
    const rows = await readXlsxRows(
      storedZip({ 'xl/sharedStrings.xml': strings, 'xl/worksheets/sheet1.xml': sheet }),
    );
    expect(movementsFromRows(rows)).toEqual([
      {
        operationDate: '2026-10-29',
        valueDate: '2026-10-28',
        concept: 'Recibo Digi',
        amountCents: -1200,
        balanceCents: 728735,
      },
      {
        operationDate: '2026-10-28',
        valueDate: '2026-10-28',
        concept: 'Cuota Ana',
        amountCents: 5500,
        balanceCents: 729935,
      },
    ]);
  });

  it('refuses a table without the movements header or a file that is not a statement', async () => {
    expect(() => movementsFromRows([['Nombre', 'Teléfono']])).toThrow(StatementError);
    await expect(readXlsxRows(new TextEncoder().encode('hola'))).rejects.toThrow(StatementError);
  });

  it('reads the blocks of the online banking pdf', () => {
    const t = (x: number, y: number, text: string, page = 1): PdfText => ({ page, x, y, text });
    const texts = [
      t(25, 715, 'Movimientos desde el 01-09-2026 hasta el 01-11-2026'),
      t(25, 697, 'Fecha'),
      t(135, 697, 'Concepto'),
      t(439, 697, 'Importe'),
      t(548, 697, 'Saldo'),
      t(25, 671, 'F. Valor'),
      t(135, 682, 'Recibo Tgss. Cotizacion 001 Regimen General, Concepto: Cod.'),
      t(135, 671, 'Liquidacion: 1820 Periodo: 09/2026-09/2026'),
      t(427, 678, '-139,34 EUR'),
      t(524, 678, '7.243,01 EUR'),
      t(65, 671, '30/10/2026'),
      t(25, 683, '30/10/2026'),
      t(25, 647, 'F. Valor'),
      t(135, 653, 'Liquidacion Efectuada El 29/10/2026 A Club De Ajedrez'),
      t(434, 654, '95,00 EUR'),
      t(524, 654, '7.382,35 EUR'),
      t(65, 647, '29/10/2026'),
      t(25, 659, '30/10/2026'),
      t(25, 600, 'Transferencia sin cabecera', 2),
    ];
    expect(movementsFromPdf(texts)).toEqual([
      {
        operationDate: '2026-10-30',
        valueDate: '2026-10-30',
        concept:
          'Recibo Tgss. Cotizacion 001 Regimen General, Concepto: Cod. Liquidacion: 1820 Periodo: 09/2026-09/2026',
        amountCents: -13934,
        balanceCents: 724301,
      },
      {
        operationDate: '2026-10-30',
        valueDate: '2026-10-29',
        concept: 'Liquidacion Efectuada El 29/10/2026 A Club De Ajedrez',
        amountCents: 9500,
        balanceCents: 738235,
      },
    ]);
  });
});
