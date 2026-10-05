import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { DocumentNotFound, type DocumentStorage } from '../../application/accounting/mod.ts';

/** Solo claves generadas por la aplicación (`invoices/<uuid>/<uuid>.pdf`): evita salir de la carpeta de documentos. */
export function assertDocumentKey(key: string): string {
  if (!/^[a-z]+(\/[0-9a-f-]{36})+\.[a-z]{3,4}$/.test(key)) {
    throw new Error('Clave de documento no válida.');
  }
  return key;
}

/**
 * Documentos en el sistema de ficheros local (desarrollo y tests). No se borran al quitarlos: el historial
 * puede devolver la factura o el documento anterior (ver historial-de-cambios-con-triggers.md).
 */
export class LocalDocumentStorage implements DocumentStorage {
  constructor(private readonly root: string) {}

  async put(key: string, contents: Uint8Array): Promise<void> {
    const path = this.path(key);
    await Deno.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await Deno.writeFile(path, contents);
  }

  async read(key: string): Promise<Uint8Array> {
    try {
      return await Deno.readFile(this.path(key));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) throw new DocumentNotFound();
      throw error;
    }
  }

  remove(key: string): Promise<void> {
    assertDocumentKey(key);
    return Promise.resolve();
  }

  private path(key: string): string {
    return `${this.root}/${assertDocumentKey(key)}`;
  }
}

/** Documentos en un bucket privado de Supabase Storage (producción), con la clave de servicio. */
export class SupabaseDocumentStorage implements DocumentStorage {
  private readonly client: SupabaseClient;

  constructor(
    url: string,
    serviceKey: string,
    private readonly bucket: string,
    fetchImpl?: typeof fetch,
  ) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
    });
  }

  async put(key: string, contents: Uint8Array): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(
      assertDocumentKey(key),
      contents,
      { upsert: true },
    );
    if (error) throw new Error(`No se ha podido guardar el documento: ${error.message}`);
  }

  async read(key: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(this.bucket).download(
      assertDocumentKey(key),
    );
    if (error || !data) throw new DocumentNotFound();
    return new Uint8Array(await data.arrayBuffer());
  }

  remove(key: string): Promise<void> {
    assertDocumentKey(key);
    return Promise.resolve();
  }
}
