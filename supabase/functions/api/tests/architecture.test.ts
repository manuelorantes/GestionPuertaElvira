import { assertEquals } from '@std/assert';

// Reglas de dependencia de la arquitectura hexagonal (antes las comprobaba Deptrac):
//   Infrastructure → Application → Domain; cada contexto de dominio solo importa `common`.
const ROOT = new URL('../src/', import.meta.url);

async function* files(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.isDirectory ? `${entry.name}/` : entry.name, dir);
    if (entry.isDirectory) yield* files(url);
    else if (entry.name.endsWith('.ts')) yield url;
  }
}

/** Lo que vive fuera de las tres capas (container.ts) es cableado: cuenta como infraestructura. */
function layerOf(path: string): { layer: string; context: string } {
  const match = /^(domain|application|infrastructure)\/([^/]+)/.exec(path);
  return { layer: match?.[1] ?? 'infrastructure', context: match?.[2] ?? '' };
}

Deno.test('dependencies should only point inwards and domain contexts should stay isolated', async () => {
  const violations: string[] = [];
  for await (const file of files(ROOT)) {
    const path = file.href.slice(ROOT.href.length);
    const { layer, context } = layerOf(path);
    const source = await Deno.readTextFile(file);
    for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
      const target = match[1] ?? '';
      if (!target.startsWith('.')) {
        if (layer === 'domain' || layer === 'application') {
          violations.push(`${path} importa un vendor (${target})`);
        }
        continue;
      }
      const resolved = new URL(target, file).href.slice(ROOT.href.length);
      const imported = layerOf(resolved);
      const inward = (from: string, to: string) =>
        from === 'infrastructure' || (from === 'application' && to !== 'infrastructure') ||
        (from === 'domain' && to === 'domain');
      if (!inward(layer, imported.layer)) violations.push(`${path} → ${resolved}`);
      if (
        layer === 'domain' && imported.layer === 'domain' && imported.context !== context &&
        imported.context !== 'common'
      ) {
        violations.push(`${path} → ${resolved} (contextos de dominio cruzados)`);
      }
    }
  }
  assertEquals(violations, []);
});
