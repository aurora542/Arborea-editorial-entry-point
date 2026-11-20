/**
 * Check that every "/assets/..." path referenced in src/ exists in public/ with the
 * exact same casing.
 *
 * Hostinger is Linux (case-sensitive); macOS is not, so `npm run dev`, `npx serve`
 * and fs.existsSync all hide a wrong-case path that then 404s in production. The
 * source of truth here is `git ls-files public/assets`, which is case-exact.
 *
 *   node scripts/check-asset-paths.mjs      (or: npm run check:assets)
 *
 * Exits 1 if any path is missing. Paths built at runtime (template strings with
 * ${...}) can't be resolved statically; they are listed for manual review.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const EXT = /\.(jsx?|tsx?|json|css)$/;
// A quoted (", ', `) or url()-wrapped path starting at /assets/.
const REF = /["'`(]\s*(\/assets\/[^"'`)]+?)\s*["'`)]/g;

const tracked = execFileSync("git", ["ls-files", "-z", "public/assets"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .map((p) => p.slice("public".length));
const exact = new Set(tracked);
const byLower = new Map(tracked.map((p) => [p.toLowerCase(), p]));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return EXT.test(e.name) ? [p] : [];
  });
}

const missing = [];
const dynamic = [];
let checked = 0;

for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [, raw] of line.matchAll(REF)) {
      const where = `${file}:${i + 1}`;
      if (raw.includes("${")) {
        dynamic.push(`${where}  ${raw}`);
        continue;
      }
      checked += 1;
      const path = decodeURI(raw.split(/[?#]/)[0]);
      if (exact.has(path)) continue;
      const hint = byLower.get(path.toLowerCase());
      missing.push(`${where}  ${raw}${hint ? `  →  existe como ${hint}` : "  →  no existe"}`);
    }
  });
}

console.log(`Rutas revisadas: ${checked} · archivos en public/assets: ${tracked.length}`);
if (dynamic.length) {
  console.log(`\nRutas dinámicas (revisar a mano):\n  ${dynamic.join("\n  ")}`);
}
if (missing.length) {
  console.log(`\n✗ ${missing.length} ruta(s) no coinciden:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log("\n✓ Todas las rutas existen con las mismas mayúsculas.");
