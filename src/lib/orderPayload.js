import { SERVICE_ORDER } from "@/data/services";

/*
 * Builds the one and only outbound order payload.
 *
 * This file and `orderApi.js` are the entire seam between the product and the
 * backend. If making the backend work means editing something under
 * `src/components/sections/`, something has gone wrong — see docs/ORDERS-BACKEND.md §6.
 *
 * The shape here IS the contract documented in §4 of that file. Change them together.
 */

export const SCHEMA_VERSION = 2;
export const CURRENCY = "USD";

/*
 * The reservation number is the key the backend groups by: it names the guest's
 * spreadsheet and decides whether a second checkout joins the first one or starts a
 * new file. Because the guest types it, it has to be normalised — but only
 * conservatively.
 *
 * Case and stray whitespace are noise and get removed. Dashes and slashes are NOT:
 * "SB-10432" reads better than "SB10432" in a filename and in the concierge's index,
 * and we do not yet know Simple Booking's format, so stripping separators could
 * collide two genuinely different numbers.
 */
export function normalizeReservationNumber(raw) {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

const serviceRank = (id) => {
  const i = SERVICE_ORDER.indexOf(id);
  return i === -1 ? SERVICE_ORDER.length : i;
};

/* Copies exactly the contract fields off a cart line and nothing else.
 *
 * The lines arrive already whitelisted by `normalizeLine` in CartContext, so this is
 * belt-and-braces — but it is the layer that actually leaves the browser, and it
 * means a field added to the cart tomorrow cannot silently start being transmitted. */
function toPayloadLine(line) {
  return {
    lineId:    line.lineId,
    service:   line.service,
    sku:       line.sku,
    title:     line.title,
    titleEn:   line.titleEn || line.title,
    kind:      line.kind || "",
    qty:       line.qty,
    unitPrice: line.unitPrice,
    /* Recomputed rather than trusted: the context derives it on read and never
     * stores it, so there is no stale value to carry over. */
    lineTotal: line.qty * line.unitPrice,
    byQuote:   line.byQuote === true,
    date:      line.date || "",
    options:   line.options ?? {},
    data:      line.data ?? {},
  };
}

/* Drops services whose form is empty, so `serviceForms` only carries services the
 * guest actually answered something for. Values are copied as-is and in full —
 * never through `describeServiceForm()`, which is a UI formatter and collapses the
 * Full Fridge produce list to a count. */
function cleanServiceForms(serviceForms, servicesInCart) {
  const out = {};
  for (const id of servicesInCart) {
    const form = serviceForms?.[id];
    if (!form || typeof form !== "object") continue;
    if (Object.keys(form).length === 0) continue;
    out[id] = form;
  }
  return out;
}

/**
 * @param submissionId Generated ONCE per checkout attempt by the caller and reused on
 *   retry. Generating it here would hand a retry after a network error a fresh id,
 *   defeating the backend's dedupe and writing the order twice.
 */
export function buildOrderPayload({
  submissionId,
  lines = [],
  serviceForms = {},
  guest = {},
  notes = "",
  locale = "en",
  /* "web" | "kiosk" — which surface the order came from. A tablet fixed in a house
   * and a guest on their phone produce the same payload otherwise, but operations
   * wants to tell them apart in the sheet. Came from the kiosk branch. */
  source = "web",
  now = new Date(),
}) {
  const cart = [...lines]
    .sort((a, b) => serviceRank(a.service) - serviceRank(b.service))
    .map(toPayloadLine);

  /* Insertion order follows SERVICE_ORDER because `cart` is already sorted, so the
   * sheet lists services the same way the drawer and the checkout page do. */
  const servicesInCart = [...new Set(cart.map((l) => l.service))];

  const itemCount = cart.reduce((sum, l) => sum + l.qty, 0);
  const subtotal = cart.reduce((sum, l) => (l.byQuote ? sum : sum + l.lineTotal), 0);
  const quotePending = cart.filter((l) => l.byQuote).length;

  return {
    schemaVersion: SCHEMA_VERSION,
    submissionId,
    createdAt: now.toISOString(),
    locale,
    source,
    currency: CURRENCY,

    guest: {
      reservationNumber: normalizeReservationNumber(guest.reservationNumber),
      firstName:   String(guest.firstName ?? "").trim(),
      lastName:    String(guest.lastName ?? "").trim(),
      email:       String(guest.email ?? "").trim(),
      phone:       String(guest.phone ?? "").trim(),
      casa:        String(guest.casa ?? "").trim(),
      checkInDate: String(guest.checkInDate ?? "").trim(),
    },

    cart,
    serviceForms: cleanServiceForms(serviceForms, servicesInCart),
    totals: { itemCount, subtotal, quotePending },
    notes: String(notes ?? "").trim(),
  };
}

/*
 * Quick guest request — kiosk only, from `/solicitudes/`.
 *
 * A different thing from an order: no cart, no prices, no reservation number. The
 * guest taps a category (cleaning, amenities, electricity…) and optionally types a
 * message. The backend tells it apart from an order by `type`.
 *
 * `guest` here is `{ name, phone, casa }` — the tablet knows which house it is in,
 * and asking someone standing in a hallway for their reservation number to report a
 * broken light would be absurd. Kept from the kiosk branch as-is.
 */
export function buildRequestPayload({
  submissionId,
  category,
  message = "",
  guest = {},
  locale = "en",
  now = new Date(),
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: "request",
    source: "kiosk",
    submissionId,
    createdAt: now.toISOString(),
    locale,
    guest: {
      name:  String(guest.name ?? "").trim(),
      phone: String(guest.phone ?? "").trim(),
      casa:  String(guest.casa ?? "").trim(),
    },
    request: {
      category: String(category ?? "").trim(),
      message: String(message ?? "").trim(),
    },
  };
}
