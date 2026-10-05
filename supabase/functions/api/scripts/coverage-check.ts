// Comprueba el porcentaje de líneas cubiertas de un informe LCOV: deno run --allow-read scripts/coverage-check.ts <lcov> <mínimo>
const [file, minimum] = Deno.args;
if (!file || !minimum) {
  console.error('Uso: coverage-check.ts <lcov.info> <porcentaje mínimo>');
  Deno.exit(2);
}
let found = 0;
let hit = 0;
for (const line of (await Deno.readTextFile(file)).split('\n')) {
  if (line.startsWith('LF:')) found += Number(line.slice(3));
  if (line.startsWith('LH:')) hit += Number(line.slice(3));
}
const percentage = found === 0 ? 0 : (hit / found) * 100;
console.log(`Cobertura de líneas: ${percentage.toFixed(1)} % (${hit}/${found})`);
if (percentage < Number(minimum)) {
  console.error(`Por debajo del mínimo (${minimum} %)`);
  Deno.exit(1);
}
