// Corre las pruebas contra la version WebAssembly del interprete:
//   1. las pruebas oficiales de PSeInt (carpeta test/ del codigo original), para
//      confirmar que se comporta exactamente igual que PSeInt de escritorio;
//   2. las pruebas propias de esta app (tests/*/), por ejemplo las de "Retornar".
//
// Cada prueba es un .psc con su salida esperada (.out) y, opcionalmente, opciones
// extra para el interprete (.arg).
//
// Uso: node tests/run-tests.mjs <carpeta test de PSeInt>
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { runPseint } from "../web/js/pseint-runtime.js";

const oficiales = process.argv[2];
if (!oficiales) {
  console.error("Uso: node tests/run-tests.mjs <carpeta test de PSeInt>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const module = await WebAssembly.compile(readFileSync(join(dirname(here), "web/pseint.wasm")));
const latin1 = (p) => readFileSync(p, "latin1");

async function correrCarpeta(dir) {
  let ok = 0;
  const fallas = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".psc")).sort()) {
    const name = f.slice(0, -4);
    const outFile = join(dir, name + ".out");
    if (!existsSync(outFile)) continue;
    const argFile = join(dir, name + ".arg");
    const extra = existsSync(argFile) ? latin1(argFile).trim().split(/\s+/).filter(Boolean) : [];
    let out = "";
    await runPseint({
      module,
      source: latin1(join(dir, f)),
      args: ["--fortest", "--rawerrors", "--nouser", "--noinput", ...extra],
      onOutput: (t) => (out += t),
      requestInput: async () => "",
    });
    if (out === latin1(outFile)) ok++;
    else fallas.push({ name, esperado: latin1(outFile), obtenido: out });
  }
  return { ok, fallas };
}

const carpetas = [
  ["PSeInt oficiales", oficiales],
  ...readdirSync(here)
    .filter((d) => statSync(join(here, d)).isDirectory())
    .map((d) => [`propias: ${d}`, join(here, d)]),
];

let totalFallas = 0;
for (const [titulo, dir] of carpetas) {
  const { ok, fallas } = await correrCarpeta(dir);
  console.log(`${titulo.padEnd(28)} OK: ${ok}  Fallas: ${fallas.length}`);
  for (const f of fallas) {
    console.log(`  ✗ ${basename(dir)}/${f.name}\n    esperado: ${JSON.stringify(f.esperado)}\n    obtenido: ${JSON.stringify(f.obtenido)}`);
  }
  totalFallas += fallas.length;
}
process.exit(totalFallas ? 1 : 0);
