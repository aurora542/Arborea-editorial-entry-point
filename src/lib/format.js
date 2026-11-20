/** `$1,240` — matches the formatting used across the service pages. */
export function money(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
}

/*
 * "2026-10-04" -> "Oct 4" / "4 oct"
 *
 * Parsed field by field on purpose. `new Date("2026-10-04")` is interpreted as
 * UTC midnight, which renders as the PREVIOUS day everywhere west of Greenwich —
 * Costa Rica included. Same trap as the `min` attribute fixed in DateField.
 */
export function formatDateLabel(iso, locale = "en") {
  if (typeof iso !== "string") return "";
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es-CR" : "en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return iso;
  }
}

/**
 * "3 days" / "3 días" — a counted unit for a cart caption.
 *
 * Every surface used to build these inline with a hand-written English plural
 * (`${n} ${n === 1 ? "day" : "days"}`), so a guest browsing in Spanish got English
 * words in their own cart. Units live in `cart.units.<unit>` as `{ one, other }` in
 * both locales; `unit` is the singular key ("day", "adult", "child", "guest").
 *
 * Only the caption needs this. The number itself belongs in the line's `data` bag,
 * where it stays a number and has no language at all.
 */
export function countLabel(t, n, unit) {
  const count = Number(n);
  const forms = t(`cart.units.${unit}`);
  const word =
    forms && typeof forms === "object"
      ? (count === 1 ? forms.one : forms.other)
      : "";
  return word ? `${count} ${word}` : String(count);
}

/**
 * Turns a cart line's `options` + `date` into one muted caption:
 *   { duration: "90 min", days: 3 } + "2026-10-04"  ->  "90 min · 3 days · Oct 4"
 *
 * Values are rendered as-is; keys are never shown, so option values should
 * read as labels on their own ("90 min", not "90").
 *
 * Keys starting with `_` are skipped as internal metadata. Nothing writes one today
 * — the private-chef page used to stash per-day dish picks as a JSON string under
 * `options._dishes` and now puts them in the line's typed `data` bag — but the
 * filter stays as the escape hatch for anything that ever needs to ride in
 * `options` without being shown.
 */
export function describeLine(line, locale = "en") {
  const parts = Object.entries(line?.options ?? {})
    .filter(([k, v]) => !k.startsWith("_") && v !== null && v !== undefined && v !== "")
    .map(([, v]) => String(v));

  const dateLabel = formatDateLabel(line?.date, locale);
  if (dateLabel) parts.push(dateLabel);

  return parts.join(" · ");
}
