/**
 * Resize + re-encode public/assets images in place.
 *
 * The site ships huge source images (several 7000px+, one 24 MB) shown at 192–330px
 * CSS. On the Casa Ceiba tablet (Fully WebView) decoding them freezes scrolling. This
 * caps the long edge at 2000px and re-encodes in the SAME format, SAME name and path,
 * so no reference in src/ or i18n changes.
 *
 * Safe to run repeatedly. AVIF re-encoding is slightly non-deterministic, so "smaller
 * by any amount" would rewrite (and recompress) every file on each run. Instead we
 * only rewrite when the image still exceeds the size cap OR the re-encode saves a
 * meaningful amount (>= MIN_SAVING). Once an image is within the cap and already small,
 * further runs leave it byte-for-byte untouched. Originals live in git history — we
 * never copy them into public/.
 *
 *   node scripts/optimize-images.mjs      (or: npm run images:optimize)
 */

import sharp from "sharp";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "public/assets";
const MAX_EDGE = 2000;
// Rewrite only when the re-encode saves at least this much, so idempotent reruns
// don't recompress files that are already optimized.
const MIN_SAVING = 0.1; // 10 %
const AVIF = { quality: 55, effort: 4 };
const WEBP = { quality: 72, effort: 4 };
const JPEG = { quality: 78, mozjpeg: true };
const PNG = { quality: 80, compressionLevel: 9 };

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(p));
    else if (/\.(avif|jpe?g|png|webp)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(0).padStart(7) + " KB";
}

function encoderFor(ext) {
  switch (ext) {
    case ".avif": return (img) => img.avif(AVIF);
    case ".webp": return (img) => img.webp(WEBP);
    case ".png": return (img) => img.png(PNG);
    default: return (img) => img.jpeg(JPEG); // .jpg / .jpeg
  }
}

const files = walk(ROOT).sort();
let totalBefore = 0;
let totalAfter = 0;
let changed = 0;

console.log(
  "\n" +
    "file".padEnd(52) +
    "before".padStart(11) +
    "after".padStart(11) +
    "  dims"
);
console.log("-".repeat(96));

for (const file of files) {
  const before = statSync(file).size;
  totalBefore += before;

  const ext = extname(file).toLowerCase();
  const meta = await sharp(file).metadata();
  const longEdge = Math.max(meta.width, meta.height);

  // Re-encode from a pipeline that strips metadata and resizes if needed.
  let pipeline = sharp(file).rotate(); // bake in EXIF orientation, then drop metadata
  if (longEdge > MAX_EDGE) {
    pipeline = pipeline.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const buffer = await encoderFor(ext)(pipeline).toBuffer();

  const outMeta = await sharp(buffer).metadata();
  const newLong = Math.max(outMeta.width, outMeta.height);

  // Rewrite if the source is oversized (must shrink dimensions, even if the new file
  // is heavier) or the re-encode saves a meaningful amount. Otherwise leave the file
  // untouched so reruns are no-ops.
  const oversized = longEdge > MAX_EDGE;
  const saving = 1 - buffer.length / before;
  let after = before;
  let mark = "  (kept)";
  if (oversized || saving >= MIN_SAVING) {
    writeFileSync(file, buffer);
    after = buffer.length;
    changed += 1;
    mark = "";
  }
  totalAfter += after;

  console.log(
    file.replace(ROOT + "/", "").padEnd(52) +
      kb(before) +
      kb(after) +
      `  ${newLong}px${mark}`
  );
}

console.log("-".repeat(96));
console.log(
  "TOTAL".padEnd(52) +
    (totalBefore / 1024 / 1024).toFixed(1).padStart(8) +
    " MB" +
    (totalAfter / 1024 / 1024).toFixed(1).padStart(8) +
    " MB"
);
console.log(`\nRewrote ${changed}/${files.length} files. Max edge cap: ${MAX_EDGE}px.\n`);
