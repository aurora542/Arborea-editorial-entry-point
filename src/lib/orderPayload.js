/*
 * Builds the outbound order payload (ORDERS-BACKEND.md §4.1).
 *
 * Each cart line is reduced to the whitelisted fields plus the derived lineTotal —
 * this is the second gate (after normalizeLine) that keeps internal i18n fields
 * (commission, contactName, whatsapp) out of the payload. `totals` is computed here.
 *
 * `source` is "web" | "kiosk". For "web" the guest has firstName/lastName/email/
 * phone/casa; for "kiosk" just name/phone/casa.
 */

function lineOut(line) {
  const qty = Number(line.qty) || 0;
  const unitPrice = Number(line.unitPrice) || 0;
  return {
    lineId: line.lineId,
    service: line.service,
    sku: line.sku,
    title: line.title,
    qty,
    unitPrice,
    lineTotal: qty * unitPrice,
    date: typeof line.date === "string" ? line.date : "",
    options: line.options && typeof line.options === "object" ? line.options : {},
  };
}

export function buildOrderPayload({
  lines,
  serviceForms,
  guest,
  locale,
  notes = "",
  source = "web",
  submissionId,
}) {
  const cart = (lines ?? []).map(lineOut);
  const subtotal = cart.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemCount = cart.reduce((sum, l) => sum + l.qty, 0);

  return {
    source,
    submissionId,
    createdAt: new Date().toISOString(),
    locale,
    currency: "USD",
    guest,
    cart,
    serviceForms: serviceForms ?? {},
    totals: { itemCount, subtotal, total: subtotal },
    notes,
  };
}

/* Request payload (ORDERS-BACKEND.md §4.2). Kiosk-only quick requests. */
export function buildRequestPayload({
  category,
  message = "",
  guest,
  locale,
  submissionId,
}) {
  return {
    type: "request",
    source: "kiosk",
    submissionId,
    createdAt: new Date().toISOString(),
    locale,
    guest,
    request: { category, message },
  };
}
