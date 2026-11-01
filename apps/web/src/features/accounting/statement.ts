/**
 * Lectura del extracto del banco en el navegador (ver conciliacion-bancaria-con-extracto.md): del Excel (un `.xlsx`,
 * aunque el banco lo llame `.xls`) o del PDF salen los movimientos normalizados; el fichero no sale del navegador.
 */

export interface BankMovement {
  operationDate: string;
  valueDate: string;
  concept: string;
  amountCents: number;
  balanceCents: number;
}

export class StatementError extends Error {}

/** «1.234,56», «-12,00 EUR» o un número de Excel, en céntimos. */
export function parseAmount(value: string): number | null {
  const text = value.replace(/EUR|€/gi, '').replace(/\s/g, '');
  if (/^-?\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 100);
  if (!/^-?[\d.]*\d(,\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text.replace(/\./g, '').replace(',', '.')) * 100);
}

/** «dd/mm/aaaa» o un número de serie de Excel, en ISO. */
export function parseDate(value: string): string | null {
  const match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value.trim());
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{5}(\.\d+)?$/.test(value.trim())) {
    const day = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86_400_000);
    return day.toISOString().slice(0, 10);
  }
  return null;
}

// ---- Excel -----------------------------------------------------------------------------------

/** Los ficheros de un zip (lo que es un `.xlsx`), descomprimidos con las APIs del navegador. */
async function unzip(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new StatementError('El fichero no es un Excel ni un PDF del banco.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, decoder.decode(data));
    else if (method === 8) {
      const body = new Response(data as BodyInit).body;
      if (body === null) continue;
      const stream = body.pipeThrough(new DecompressionStream('deflate-raw'));
      files.set(name, await new Response(stream).text());
    }
  }
  return files;
}

function columnOf(ref: string): number {
  let column = 0;
  for (const char of /^[A-Z]+/.exec(ref)?.[0] ?? '') column = column * 26 + char.charCodeAt(0) - 64;
  return column - 1;
}

/** Las filas de la primera hoja, como textos. */
async function xlsxRows(bytes: Uint8Array): Promise<string[][]> {
  const files = await unzip(
    bytes,
    (name) => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  );
  const sheetName = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new StatementError('El Excel no tiene ninguna hoja.');
  const parser = new DOMParser();
  const textOf = (node: Element) =>
    [...node.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('');
  const strings = files.get('xl/sharedStrings.xml');
  const shared = strings
    ? [...parser.parseFromString(strings, 'application/xml').getElementsByTagName('si')].map(textOf)
    : [];
  const sheet = parser.parseFromString(files.get(sheetName) ?? '', 'application/xml');
  return [...sheet.getElementsByTagName('row')].map((row) => {
    const cells: string[] = [];
    for (const cell of [...row.getElementsByTagName('c')]) {
      const type = cell.getAttribute('t');
      const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      cells[columnOf(cell.getAttribute('r') ?? 'A')] =
        type === 's' ? (shared[Number(value)] ?? '') : type === 'inlineStr' ? textOf(cell) : value;
    }
    return Array.from(cells, (c) => (c ?? '').trim());
  });
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Los movimientos de una tabla con cabecera «Fecha Operación», «Fecha Valor», «Concepto», «Importe» y «Saldo». */
export function movementsFromRows(rows: string[][]): BankMovement[] {
  const headerIndex = rows.findIndex((r) => r.some((c) => normalize(c) === 'concepto'));
  if (headerIndex < 0) throw new StatementError('No se encuentra la cabecera de los movimientos.');
  const header = (rows[headerIndex] ?? []).map(normalize);
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const columns = {
    operation: find('fecha operacion', 'fecha'),
    value: find('fecha valor', 'f. valor'),
    concept: find('concepto'),
    amount: find('importe'),
    balance: find('saldo'),
  };
  if ([columns.operation, columns.concept, columns.amount, columns.balance].some((c) => c < 0)) {
    throw new StatementError('Faltan columnas: se esperan fechas, concepto, importe y saldo.');
  }
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const operationDate = parseDate(row[columns.operation] ?? '');
    if (operationDate === null) return [];
    const amountCents = parseAmount(row[columns.amount] ?? '');
    const balanceCents = parseAmount(row[columns.balance] ?? '');
    if (amountCents === null || balanceCents === null) {
      throw new StatementError(
        `El movimiento del ${row[columns.operation]} no tiene importe o saldo.`,
      );
    }
    return [
      {
        operationDate,
        valueDate: parseDate(row[columns.value] ?? '') ?? operationDate,
        concept: (row[columns.concept] ?? '').replace(/\s+/g, ' ').trim(),
        amountCents,
        balanceCents,
      },
    ];
  });
}

// ---- PDF -------------------------------------------------------------------------------------

/** Un texto del PDF con su página y su posición (y crece hacia arriba). */
export interface PdfText {
  page: number;
  x: number;
  y: number;
  text: string;
}

const MONEY = /^-?[\d.]+,\d{2} ?EUR$/;
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

/**
 * Los movimientos del PDF de la banca online: cada uno es un bloque con el importe y el saldo en la misma línea, las
 * fechas de operación y valor a la izquierda y el concepto (una o varias líneas) en medio.
 */
export function movementsFromPdf(texts: readonly PdfText[]): BankMovement[] {
  const movements: BankMovement[] = [];
  const pages = [...new Set(texts.map((t) => t.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const items = texts.filter((t) => t.page === page && t.text.trim() !== '');
    const conceptHeader = items.find((t) => normalize(t.text) === 'concepto');
    const top = conceptHeader ? conceptHeader.y - 2 : Infinity;
    const body = items.filter((t) => t.y < top);
    const money = body.filter((t) => MONEY.test(t.text.trim()));
    const anchors = money
      .map((amount) => ({
        amount,
        balance: money.find((b) => b.x > amount.x + 30 && Math.abs(b.y - amount.y) <= 3),
      }))
      .filter((a): a is { amount: PdfText; balance: PdfText } => a.balance !== undefined)
      .sort((a, b) => b.amount.y - a.amount.y);
    if (anchors.length === 0) continue;
    const conceptX = conceptHeader?.x ?? Math.min(...anchors.map((a) => a.amount.x)) - 300;
    const nearest = (t: PdfText) =>
      anchors.reduce((best, a) =>
        Math.abs(a.amount.y - t.y) < Math.abs(best.amount.y - t.y) ? a : best,
      );
    const blocks = new Map(
      anchors.map((a) => [a, { dates: [] as PdfText[], concept: [] as PdfText[] }]),
    );
    for (const t of body) {
      if (MONEY.test(t.text.trim())) continue;
      const block = blocks.get(nearest(t));
      if (!block) continue;
      if (DATE.test(t.text.trim()) && t.x < conceptX) block.dates.push(t);
      else if (t.x >= conceptX - 5 && t.x < nearest(t).amount.x) block.concept.push(t);
    }
    for (const anchor of anchors) {
      const block = blocks.get(anchor) ?? { dates: [], concept: [] };
      const dates = [...block.dates].sort((a, b) => a.x - b.x);
      const operationDate = dates[0] ? parseDate(dates[0].text) : null;
      if (operationDate === null)
        throw new StatementError('Hay un movimiento sin fecha en el PDF.');
      movements.push({
        operationDate,
        valueDate: (dates[1] && parseDate(dates[1].text)) ?? operationDate,
        concept: block.concept
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map((t) => t.text.trim())
          .join(' ')
          .replace(/\s+/g, ' '),
        amountCents: parseAmount(anchor.amount.text) ?? 0,
        balanceCents: parseAmount(anchor.balance.text) ?? 0,
      });
    }
  }
  return movements;
}

async function pdfTexts(bytes: Uint8Array): Promise<PdfText[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const texts: PdfText[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      texts.push({
        page,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        text: item.str,
      });
    }
  }
  return texts;
}

// ---- Entrada ---------------------------------------------------------------------------------

/** Lee el extracto (Excel o PDF, por su contenido) y devuelve sus movimientos. */
export async function readStatement(file: Blob): Promise<BankMovement[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  const movements = isPdf
    ? movementsFromPdf(await pdfTexts(bytes))
    : movementsFromRows(await xlsxRows(bytes));
  if (movements.length === 0) throw new StatementError('El extracto no tiene movimientos.');
  return movements;
}

/** Solo para los tests: las filas de un Excel. */
export const readXlsxRows = xlsxRows;
