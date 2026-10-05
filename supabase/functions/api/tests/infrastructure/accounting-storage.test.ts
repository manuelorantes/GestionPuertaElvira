import { assertEquals, assertRejects, assertThrows } from '@std/assert';

import { DocumentNotFound } from '../../src/application/accounting/mod.ts';
import { inlineDisposition, sniffMimeType } from '../../src/infrastructure/accounting/routes.ts';
import {
  assertDocumentKey,
  LocalDocumentStorage,
  SupabaseDocumentStorage,
} from '../../src/infrastructure/accounting/storage.ts';

const KEY =
  'invoices/0f0e2a6c-6d1c-4b6e-9a5b-2a3f1c7d8e90/0f0e2a6c-6d1c-4b6e-9a5b-2a3f1c7d8e91.pdf';
const bytes = (text: string) => new TextEncoder().encode(text);

Deno.test('sniffMimeType should detect documents by their content, not by their name', () => {
  assertEquals(sniffMimeType(bytes('%PDF-1.4')), 'application/pdf');
  assertEquals(sniffMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assertEquals(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'image/png');
  assertEquals(sniffMimeType(bytes('RIFF....WEBPVP8 ')), 'image/webp');
  assertEquals(sniffMimeType(bytes('no soy un pdf')), 'application/octet-stream');
});

Deno.test('inlineDisposition should keep ASCII names and fall back for the rest', () => {
  assertEquals(inlineDisposition('alquiler.pdf', 'factura'), 'inline; filename="alquiler.pdf"');
  assertEquals(
    inlineDisposition('año 2026.pdf', 'factura'),
    `inline; filename="factura"; filename*=UTF-8''a%C3%B1o%202026.pdf`,
  );
});

Deno.test('LocalDocumentStorage should write, read back and refuse foreign keys', async () => {
  const root = await Deno.makeTempDir();
  const storage = new LocalDocumentStorage(root);
  await storage.put(KEY, bytes('%PDF-1'));
  assertEquals(new TextDecoder().decode(await storage.read(KEY)), '%PDF-1');
  await storage.remove(KEY);
  assertEquals(
    new TextDecoder().decode(await storage.read(KEY)),
    '%PDF-1',
    'no se borra: el historial puede devolverlo',
  );
  await assertRejects(() => storage.read(KEY.replace('91.pdf', '92.pdf')), DocumentNotFound);
  assertThrows(() => assertDocumentKey('../../etc/passwd'));
  await Deno.remove(root, { recursive: true });
});

Deno.test('SupabaseDocumentStorage should upload to and download from the private bucket', async () => {
  const calls: { method: string; url: string }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ method: init?.method ?? 'GET', url });
    if (url.includes('/object/documentos/') && init?.method === 'POST') {
      return Promise.resolve(Response.json({ Key: `documentos/${KEY}`, Id: '1' }));
    }
    if (url.includes('/object/documentos/') && url.endsWith('92.pdf')) {
      return Promise.resolve(
        Response.json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, {
          status: 400,
        }),
      );
    }
    return Promise.resolve(
      new Response(bytes('%PDF-1'), { headers: { 'Content-Type': 'application/pdf' } }),
    );
  };
  const storage = new SupabaseDocumentStorage(
    'https://ref.supabase.co',
    'service-key',
    'documentos',
    fetchImpl,
  );

  await storage.put(KEY, bytes('%PDF-1'));
  assertEquals(calls[0]?.method, 'POST');
  assertEquals(calls[0]?.url, `https://ref.supabase.co/storage/v1/object/documentos/${KEY}`);
  assertEquals(new TextDecoder().decode(await storage.read(KEY)), '%PDF-1');
  await assertRejects(() => storage.read(KEY.replace('91.pdf', '92.pdf')), DocumentNotFound);
});
