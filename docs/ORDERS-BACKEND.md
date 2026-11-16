# Orders backend — plan e integración

**Read this before changing anything in the cart, checkout, or order-submission path.**

Last updated: 2026-11-15 · Status: **planeado, sin implementar**

This file is the contract for the order flow. Sections 1–8 are the forward-looking
plan agreed with the product owner on 2026-11-15. Section 9 is the historical
progress log — append to it, don't rewrite it.

---

## 1. Current state (verificado 2026-11-15)

| Piece | Status |
|---|---|
| Shared UI primitives (`ui/QtyStepper`, `DateField`, `Chip`, `SelectableCard`) | ✅ done |
| Service registry (`src/data/services.js` + `services.*` i18n keys) | ✅ done |
| Global cart context (`CartContext` + `lib/sku.js`, mounted in `layout.tsx`) | ✅ done |
| Cart drawer + cart button | ✅ done |
| Home wired to cart (activities + vehicles) | ✅ done |
| Spa, Chef, Full Fridge wired to cart | ✅ done |
| **Fishing tours wired to cart** | ✅ done — *uncommitted* |
| **Per-service notes on all four signature experiences** | ✅ done — *uncommitted* |
| `/checkout/` review section | ✅ done |
| `/checkout/` guest form + submit | ❌ not started |
| Payload builder (`src/lib/orderPayload.js`) | ❌ not started |
| Prices consolidated to a single source | ❌ not started |
| Apps Script `doPost` for the new model | ❌ not started |
| Drive folder + template + master index provisioned | ❌ not started |
| Vercel migration | ❌ not started (decided: yes) |

**There is no submit path in the app right now.** `OrderCheckoutForm.jsx` and
`useOrderCart.js` are orphaned — nothing imports them — and `submitOrder` is only
referenced from that dead file. A guest can fill the entire cart and has no way to
send it.

**No backward compatibility is needed.** `NEXT_PUBLIC_ORDERS_BACKEND_URL` has never
been set in any build, so every bundle ever published has `BACKEND_URL === ""` and
returns `missing-backend-url` without ever posting. No legacy-schema traffic exists
or can exist. The old flat payload (`{ service, name, casa, dateNeeded, items }`)
can be deleted outright rather than supported for a release.

## 2. Decisions taken 2026-11-15

1. **One Google Sheet per reservation**, living in a folder on a Shared Drive in the
   client's Google Workspace. The concierge opens a reservation's file and finds
   everything that reservation ever ordered.
2. **The reservation number is the identity.** It comes from Simple Booking, the
   client's PMS, and is entered by the guest at checkout. Multiple checkouts across
   different sessions accumulate into the same file.
3. **The sheet is a reference document, not a billing surface.** Invoices are
   produced in a separate system. Totals stay precomputed and static; there are no
   live formulas and no editable price cells.
4. **Hosting moves to Vercel.** This gives a server, which moves the shared secret
   out of the client bundle and removes the `text/plain` CORS workaround. It is also
   a precondition for ever taking payment on the site.
5. **Prices consolidate to a single source** consumed by both locales.
6. **Notes exist at two levels**: one free-form note per signature experience
   (chef, fridge, spa, fishing) and one general note for the whole order.

## 3. Target architecture

```
Browser (Vercel-hosted Next.js)
   │  POST /api/orders          ← JSON, same-origin, no CORS, no public secret
   ▼
Next.js route handler            ← validates, holds ORDERS_SHARED_SECRET server-side
   │  POST  (secret in body)
   ▼
Apps Script Web App              ← owned by the CLIENT's Workspace account
   ├─ master index Sheet         ← dedupe log + reservation→fileId map
   ├─ reservation Sheet          ← found or created from the template
   └─ notification email         ← to operations, with a link to the file
```

The Apps Script layer is identical whether the browser posts to it directly or
through the Vercel route. Going to Vercel first means `orderApi.js` is written once
and the live round-trip is tested once.

### Why this replaces the old constraints

`output: "export"` forced browser→Apps Script directly, which forced a
`NEXT_PUBLIC_*` secret visible in the bundle and `Content-Type: text/plain` to dodge
a CORS preflight Apps Script cannot answer. On Vercel none of that applies. Those
two rules are **withdrawn**; see §7.

## 4. Payload contract

Produced by `buildOrderPayload()` in `src/lib/orderPayload.js`. `schemaVersion` is
there so the Apps Script can branch when this shape changes — this is a living
system and it will.

```jsonc
{
  "schemaVersion": 2,
  "submissionId": "9f2c…",        // uuid, generated ONCE per checkout attempt
  "createdAt":    "2026-11-15T18:52:00.000Z",
  "locale":       "en",           // "en" | "es"
  "currency":     "USD",

  "guest": {                      // all seven REQUIRED, validated in the UI
    "reservationNumber": "SB-10432",   // Simple Booking · THE grouping key
    "firstName": "Ana",
    "lastName":  "Rodríguez",
    "email":     "ana@example.com",
    "phone":     "+506 8888 8888",
    "casa":      "casa-mango",         // slug from src/data/properties.js
    "checkInDate": "2026-12-02"
  },

  "cart": [
    {
      "lineId":    "wellness-spa:massage-deep-tissue:90-min",
      "service":   "wellness-spa", // id from src/data/services.js
      "sku":       "massage-deep-tissue",
      "title":     "Deep Tissue Massage",
      "qty":       2,
      "unitPrice": 130,            // 0 means BY QUOTE, never "free"
      "lineTotal": 260,            // qty * unitPrice, precomputed
      "date":      "2026-12-04",   // optional preferred date, "" if unset
      "options":   { "duration": "90 min" }
    }
  ],

  "serviceForms": {               // only services present in the cart appear
    "private-chef": {
      "dishes":       { "breakfast": ["Gallo Pinto"], "dinner": ["Whole Fish"] },
      "restrictions": { "Vegetarian": 2, "Gluten-Free": 1 },
      "restrictionOther": "low sodium",
      "allergies":    "severe peanut allergy",
      "preferences":  "no cilantro",
      "notes":        "the chef can arrive at 5pm"
    },
    "full-fridge": {
      "adults": 4, "children": 2, "days": 5,
      "produce": ["dairy:milk", "fruits:mango"],   // FULL list — it is a shopping list
      "cooking": "…", "groceries": "…", "snacksFor": ["kids"],
      "preferredSnacks": "…", "notes": "…"
    },
    "wellness-spa":  { "allergies": "…", "notes": "…" },
    "fishing-tours": { "notes": "…" }
  },

  "totals": {
    "itemCount": 5,
    "subtotal":  1240,            // sum of priced lines only
    "quotePending": 1             // count of unitPrice === 0 lines
  },
  "notes": "Arriving late on the 2nd."   // general, order-level
}
```

Rules that hold:

- **One submission per checkout.** Chef + spa + a car is one POST. Never
  re-introduce per-service submissions.
- **`submissionId` is generated once per checkout attempt and reused on retry.**
  Generating it inside the submit handler means a retry after a network error gets a
  new id, defeats the dedupe, and writes the order twice. The old
  `OrderCheckoutForm` had exactly this bug.
- **`unitPrice: 0` means "by quote", not free.** Transport and tours produce these.
  They must never render or total as `$0`.
- **Prices come from the single source (§6), not from `t()`.**
- `serviceForms` is copied raw and complete. Do **not** build it through
  `describeServiceForm()` from `src/lib/serviceForm.js` — that is a UI formatter and
  it collapses `produce` to a count (`COUNT_ONLY`). The guest's 40-item grocery list
  would be written to the sheet as "18 items selected".
- Never copy a `tours.activities` object wholesale into a line. `commission`,
  `contactName` and `whatsapp` are internal margin data that ship in the bundle.
  `normalizeLine` whitelists for this reason.

## 5. The reservation Sheet

One file per reservation number, created from a template on the first checkout,
appended to on every later one.

**Name:** `SB-10432 — Rodríguez — Casa Mango`, reservation code first so the folder
sorts and searches usefully.

| Tab | Contents | Who writes it |
|---|---|---|
| `Consolidado` | Every item from every checkout in one flat list: service, item, qty, unit price, total, date, options. The "what did this reservation order, in total" view. | script |
| `Pedidos` | One block per checkout, newest appended at the bottom: form header (guest, casa, check-in, reservation number, general notes, order date+time, status) then that checkout's item list with each service's notes. | script |
| `Payload` (hidden) | The raw JSON of every checkout. The guarantee that nothing is lost even when no column exists for it. | script |

Two rules for `Pedidos`:

- **Never sort or filter it.** Header rows and item rows are different shapes; a sort
  destroys the structure irrecoverably. The per-block **status column** exists so the
  concierge can track what she has arranged by typing, without reordering anything.
- Block layout is for reading. Anything that needs filtering belongs in
  `Consolidado`.

### Master index

Technically required, not a nice-to-have: with one file per reservation there is
nowhere else for the dedupe log to live.

| Column | Why |
|---|---|
| `reservationNumber` → `fileId` | Finding the file by name is fragile; this is the lookup. |
| `submissionId`, processed-at | Dedupe. A retry must not write twice. |
| guest, casa, check-in, checkout count, total, link | The client's overview, and the safety net below. |

**Typo safety net.** The reservation number is typed by a guest and is now the file
key, so a typo creates a *second file* for an existing reservation and the concierge
may miss half the order. Mitigations: normalise hard (uppercase, strip spaces and
dashes) before using it as a key; show it back for confirmation before submitting;
keep `lastName` as a secondary reconciliation key; and sort the index so near-identical
codes land next to each other and can be spotted. The real fix is validating against
the Simple Booking API — worth checking whether the client has access.

## 6. Prices: single source

Measured 2026-11-15. The same price is currently written in up to three places.

| Where | Count | Notes |
|---|---|---|
| Structured numeric values in i18n | **50 per locale** | `priceValue`, `basePrice`, `extraPersonPrice`, `priceValues[]`. These feed the cart. Sections: `wellnessSpa` 16, `privateChef` 13, `tours` 12, `fullFridge` 9. |
| Prices written inside translated prose | **102 per locale** | `"$200 / day"`, `"From $230 for 2 · +$24 per extra person"`, `"$1,140 total"`. |
| Hardcoded in a component | 1 | `dailyRate: 200` in `MulaRentalSection.jsx:37`, duplicating `mulaRental.priceTag`. |

**Verified: the 50 numeric values are currently identical across `en` and `es` — 0
missing, 0 divergent.** This is latent risk, not a live bug.

Target: `src/data/pricing.js` keyed by the `sku` that `src/lib/sku.js` already
produces. i18n keeps copy; display strings get **templated** (`"From {base} for 2 ·
+{extra} per extra person"`) so a number is injected from the source and never
retyped in either language.

**The safety net is what makes this safe to do.** Before the migration, a script
dumps every `(sku → price)` pair from both locales; after, it dumps them again and
diffs. If the output is not byte-identical, it does not merge. Without that diff this
is precisely the change that breaks live prices with nobody noticing until a
mis-quoted order arrives.

## 7. Do not change — and what was withdrawn

Still binding:

1. **The seam is `orderApi.js` + `orderPayload.js`.** If you are editing something
   under `src/components/sections/` to make the backend work, something has gone
   wrong.
2. **Don't re-introduce per-service submissions** or per-page submit buttons. Pages
   add to the cart; only `/checkout/` submits.
3. **Don't add payment logic yet.** Vercel makes it possible; it is not in scope.
4. **Don't change cart persistence to `localStorage`.** Session-only is a product
   decision.
5. **Don't put `commission` / `contactName` / `whatsapp` into the payload.**
6. **Generate `submissionId` once per checkout attempt.**
7. **Don't build the sheet from `describeServiceForm()`** (§4).
8. **Apps Script Web Apps need a new deployment version** for code edits to take
   effect. Saving the script is not enough. This is the most common way to lose half
   an hour debugging the wrong layer.

Withdrawn on 2026-11-15, with reasons, because the old text said the opposite:

- *"Don't switch `Content-Type` to `application/json`"* — only applied to posting
  straight from the browser to Apps Script. On Vercel the request is same-origin.
- *"Accept the old flat shape for one release"* — unnecessary; no bundle has ever had
  a working endpoint (§1).
- *"Don't move prices out of the i18n files"* — now explicitly in scope (§6).
- *"`lineTotal` and `totals` are precomputed so the Sheet doesn't need formulas"* —
  briefly reversed while the sheet was thought to be the invoicing surface, then
  restored. It is a reference document; static values are correct.

## 8. Plan, with code / not-code split and sizing

Sizing is relative (S/M/L/XL) with the measured driver, not clock hours.

| Fase | Qué | Dónde | Tamaño | Riesgo |
|---|---|---|---|---|
| **0** | Revisar y commitear lo pendiente; borrar `OrderCheckoutForm.jsx` + `useOrderCart.js` | código | **M** — 20 archivos, +3,130/−642 líneas sin revisar; 314 líneas a borrar | **Alto** — es trabajo no revisado sobre producción |
| **1** | Auditoría del modelo de datos → esquema de la plantilla, contrato del payload, inventario de precios | documento | **M** | Bajo |
| **2** | Precios a fuente única + templating de los strings | código | **XL** — 50 valores + 204 strings + 1 constante; 4 secciones de i18n, ambos locales | **Alto** — mitigado por el diff de §6 |
| **3** | Formulario final, `buildOrderPayload()`, `orderApi.js`, ~15 llaves i18n ×2 | código | **L** — 1 archivo nuevo, `CheckoutPage.jsx` +~250 líneas | Medio |
| **4** | `Code.gs`: índice, buscar-o-crear, 3 pestañas, dedupe, correo | código | **L** — 171 líneas actuales → reescritura completa | Medio |
| **5** | Vercel: quitar `output: "export"`, route handler, variables | código | **S** en código | Medio — `output: export` es restricción dura en `CLAUDE.md` |
| **6** | Pruebas en vivo | ambos | **M** | — |

### Fuera de código — el cliente o Marce, en Google / Vercel / Hostinger

Estas no las puedo hacer yo y varias tienen tiempo de espera externo:

1. Crear la **unidad compartida** y la carpeta de pedidos en el Workspace del cliente.
   Unidad compartida y no Drive personal: los archivos sobreviven si esa cuenta se cierra.
2. Crear y **estilizar el Sheet plantilla** (logo, colores, formatos de moneda, anchos).
   El formato *es* el producto aquí, y así se reestiliza sin tocar código.
3. Crear el **Sheet índice maestro**.
4. Crear el proyecto de **Apps Script en la cuenta del cliente**, pegar el código y
   rellenar `CONFIG` (ids de carpeta, plantilla e índice; secreto; correos).
5. **Desplegar el Web App** ("Execute as: me", "Who has access: Anyone") — y
   re-desplegar en cada cambio de código.
6. **Autorizar los scopes OAuth** la primera vez (Drive + Sheets + Gmail), en la
   pantalla de permisos de Google.
7. Confirmar el **formato del número de Simple Booking**, y averiguar si el cliente
   tiene acceso a su **API**.
8. Decidir los **correos de notificación** de operaciones.
9. Crear el proyecto en **Vercel**, conectar el repo, configurar las variables de
   entorno (en el entorno de *build*, no en `.env.local`).
10. **Migrar el DNS** de Hostinger a Vercel y elegir la ventana de cambio.
11. **Validar con la concierge** que la hoja le sirve de verdad, con un pedido real
    delante.

Workspace es de pago, así que la cuota de `MailApp` es 1,500 destinatarios/día y no
es un factor. El almacenamiento tampoco: cada archivo de reserva pesa pocos KB.

### Orden y dependencias

- **1 y 2 no dependen de Vercel ni de los accesos de Google** — se pueden arrancar ya.
- **5 (Vercel) va antes de 3**, para escribir `orderApi.js` una sola vez.
- **4 depende de las tareas externas 1–4** — es la ruta con espera externa, conviene
  arrancarla en paralelo desde el principio.
- **6 depende de todo.**

## 9. Progress log

Append an entry per session. Newest last.

### 2026-09-28 — analysis + docs
- Audited the whole order path. Findings: six independent page-local carts, two
  dead-end flows (Full Fridge's "Add to cart" button had no `onClick`; the tours
  `ActivityCard` had no cart at all), **no `.env` anywhere** so `submitOrder` was
  returning `missing-backend-url` and nothing had ever reached Google, and Chef/Spa
  were posting empty `name`/`casa`/`dateNeeded` which the Apps Script would have
  rejected regardless.
- Decisions taken with the product owner: one order per checkout; guest first name,
  last name, email, phone and casa all required at checkout; all prices shown as
  estimates subject to change; cart is session-only; backend deferred to a later
  session behind a mock.
- Wrote `CLAUDE.md` and this file.

### 2026-09-28 — phase 0.5: groundwork before the cart
Refactor limited to what the cart work actually needs. Build and `tsc --noEmit`
both clean afterwards.

- **Added `src/components/ui/`**: `QtyStepper`, `DateField`, `Chip`,
  `SelectableCard`. These replace 13 hand-rolled −/+ steppers, 6 one-off
  `type="date"` inputs and 15 duplicated local components (`Stepper` ×2,
  `RadioPill` ×2, `PackageCard` ×2, and five variants of the same text field).
  The old ones clamped inconsistently (some at 0, some at 1, chef's guest counter
  at 2) — `min`/`max` are now explicit props.
  - `DateField` also fixes a real bug shared by all six previous date inputs: they
    used `new Date().toISOString()` for `min`, which is UTC, so in Costa Rica
    (UTC-6) the minimum selectable date rolled over to tomorrow at 6pm local and
    blocked same-day requests. `todayLocal()` in that file is the fix.
- **Added `src/data/services.js`** — the six-service registry (`id`, `labelKey`,
  colour, `href`, icon). `id` is what the payload uses for `cart[].service` and the
  `serviceForms` keys, so treat the ids as part of the contract in §4.
  Added matching `services.*.label` keys to both locale files (EN + ES).
- **Deleted** `src/components/AOSInit.jsx` and `src/components/SplashScreen.jsx` —
  neither was imported anywhere (a previous commit removed the usage but left the
  files). Removed 6 dependencies with zero imports: `aos`, `gsap`,
  `framer-motion`, `lucide`, `date-fns`, `@hookform/resolvers`.
  - Kept `react-hook-form`: it was also unused, but the new checkout has five
    required fields with email/phone validation, which is exactly its job. Note
    `@hookform/resolvers` was dropped because no schema library (zod/yup) is
    installed — use RHF's built-in validation rules, not a resolver.
- **Deliberately not done:** the 54 inert `data-aos` attributes still in the JSX do
  nothing now that AOS is gone, but stripping them would add a large mechanical
  diff to files that are mid-edit. They get removed in phase 3 as those files are
  rewritten anyway.
- Left `OrderCheckoutForm.jsx`, `ChefCheckout`, `SpaCheckout` and Full Fridge's
  inline summary untouched on purpose — roughly 600 lines that get deleted in
  phases 3–4. Don't invest in cleaning them.

### 2026-09-28 — phase 1: the cart itself

- **`src/app/context/CartContext.jsx`** — one cart for the whole site, mounted in
  `layout.tsx` inside `I18nProvider`. API: `setLine` (upsert-replace), `addLine`
  (upsert-increment), `updateLine`, `setQty` (0 removes), `removeLine`,
  `clearService`, `clear`; `getLine`/`has`; derived `lines`, `linesByService`,
  `subtotal`, `count`, `lineCount`; `serviceForms` with
  `setServiceForm` (shallow merge) / `replaceServiceForm` / `getServiceForm`;
  plus `isOpen`/`openCart`/`closeCart`/`toggleCart` for the drawer, and `hydrated`.
- **`src/lib/sku.js`** — `slugify`, `skuOf(path, index, field)`, `lineIdOf`.
  `skuOf` resolves the item's **English** name out of `en.json` by dot path (numeric
  segments index arrays) and slugifies it, so an id never depends on the active
  locale and never shifts when an array is reordered. Falls back to
  `<last-path-segment>-<index>` when it can't resolve.

**Guarantees that matter to the backend**, verified against the real code this
session (ad-hoc, not a committed test suite — re-check if you change the context):

- `normalizeLine` is a strict whitelist. A line built from a `tours.activities`
  object keeps only the eight contract fields; `commission`, `contactName`,
  `whatsapp`, `image`, `priceValue` are dropped. Verified that what lands in
  `sessionStorage` has exactly
  `date, lineId, options, qty, service, sku, title, unitPrice`.
- `lineTotal` never exists in stored state — it is recomputed on every read, so a
  persisted cart can't carry a stale total.
- Lines whose `service` is not in `src/data/services.js` are dropped on hydration,
  so renaming a service id retires stale lines instead of leaking an unknown
  service into a payload.
- The persistence effect is gated on `hydrated`, so the empty first render cannot
  overwrite a saved cart. Corrupt or unreadable storage starts empty rather than
  throwing.
- `qty` is coerced to a positive integer and `unitPrice` to a non-negative number;
  invalid lines are rejected outright rather than stored half-formed.
- `linesByService` is ordered by `SERVICE_ORDER`, so the drawer, the checkout page
  and the payload always list services in the same sequence.
- 98 skus across the 13 priced/selectable i18n arrays were checked for collisions:
  all unique.

### 2026-09-29 — phase 2: cart UI

- **`src/components/cart/CartButton.jsx`** — floating pill, bottom-right, appears
  only once the cart has something in it. Deliberately *not* in the navbar: that
  header hides itself on scroll-down, and this button has to stay reachable while
  the guest scrolls a long service page.
- **`src/components/cart/CartDrawer.jsx`** — slide-over panel mounted once in the
  root layout. Grouped by service (colour + icon from the registry), per-line
  quantity stepper and remove, "Preferences saved" chip plus an Edit link per
  service group, estimated total, the estimates disclaimer, and the checkout CTA.
  Escape closes, Tab is trapped inside the panel, focus returns to the opener.
- **`src/app/checkout/page.jsx` + `components/sections/CheckoutPage.jsx`** — the
  order review half of the checkout, so the drawer's CTA has a real destination.
  The guest form and the single submit are still to come.
- **`src/lib/format.js`** — `money`, `formatDateLabel`, `describeLine`.
- Added `cart.*` and `checkout.*` i18n keys (EN + ES), appended as raw text so the
  rest of those files was not reformatted.
- Added `id="experiences"` to the in-house services section, so the empty-state
  CTA has an anchor.

Two integration details future work must respect:

- **`LenisProvider` now depends on the cart.** It reads `isOpen` and calls
  `lenis.stop()` / `.start()`, otherwise the page keeps gliding behind the open
  overlay. It also force-clears `document.body.style.pointerEvents`: Lenis sets
  that to `"none"` on every scroll and clears it 150ms later, so a drawer opened
  mid-scroll would otherwise be completely unclickable with no further scroll
  event coming to release it. That is also why `CartButton` sets
  `pointer-events-auto` explicitly — without it the button is dead to clicks for
  most of the time the guest is scrolling.
- **`options` values must read as labels on their own.** `describeLine` joins the
  *values* and never shows keys, so `{ days: 3 }` renders as a bare "3". Use
  `{ days: "3 days" }`, `{ duration: "90 min" }`, `{ guests: "6 guests" }`.

**Regression introduced and fixed in this phase — worth knowing about.** The drawer
overlay shipped with `pointer-events-auto` in the static part of its class list and
`pointer-events-none` in the ternary. Tailwind emits `.pointer-events-auto` *after*
`.pointer-events-none`, so with both classes present auto wins no matter what order
they appear in the attribute. The result was an invisible full-screen `z-[600]`
layer that swallowed every click on the site — navigation included. The same latent
conflict was in `CartButton`'s wrapper and the panel itself.

Rule that follows: **never split a Tailwind utility family across the static and
conditional halves of a `className`.** Emit exactly one class of a given family from
the ternary. This is silent — it type-checks, it builds, and the JSX reads as if it
works.

Verified: production build and `tsc --noEmit` clean; the prerendered HTML carries
`role="dialog"`, `aria-modal`, `inert` on the closed panel, `data-lenis-prevent` on
the scroll container, and no empty-state flash on `/checkout/`. `money`,
`formatDateLabel` and `describeLine` unit-checked (20 assertions) under
`TZ=America/Costa_Rica` — including proof that `new Date("2026-10-04")` formats as
"Oct 3" locally while `formatDateLabel` gives "Oct 4". Click-through interaction
(open/close, stepper, remove) was **not** machine-verified: no browser automation
was available in that session.

### 2026-09-29 — phase 3a: UX corrections + home page wired

The product owner clarified the intended flow, which **corrected two of my earlier
decisions**. Recorded here because both are easy to get wrong again:

1. **The cart button belongs at the top, always visible.** It was a floating
   bottom-right pill that only appeared once the cart had items. It is now a fixed
   top-right control (`z-450`, left of the hamburger) that is always present. It is
   still not *inside* `<Navbar>`'s header, because that header retracts on
   scroll-down and this must not disappear; it collapses to icon + count below `md`
   so it keeps the hamburger's footprint.
2. **The cart is the committed order, not the working state.** My earlier note in
   `CLAUDE.md` told future readers to mirror cart state directly from components.
   That is wrong for this product: each surface holds a local draft and commits on
   an explicit action. See the corrected section in `CLAUDE.md`.

Also: the drawer footer now has the two buttons the flow calls for — "Keep adding
experiences" (returns to `/#experiences` without clearing anything) and "Proceed
with my order" (`/checkout/`). `/checkout/` stays the only place guest details are
collected and the only place the order is submitted.

Wired this pass:

- **`ui/ActivityCard.jsx`** (home activities) — was completely orphaned, with local
  state and no cart at all. Now: quantity + optional date as a draft, one commit,
  then the card shows "In your order" / "Update order" / remove. Reads only
  whitelisted fields off the activity object, so `commission` / `contactName` /
  `whatsapp` never enter a line.
- **`sections/MulaRentalSection.jsx`** (home vehicles) — dropped its local `Set` +
  `configs` cart and the inline `OrderCheckoutForm`. `qty` is the number of
  **vehicles**; the day count is folded into `unitPrice` (`days × dailyRate`) and
  carried as `options.days`. That way the drawer's stepper means "two of this
  vehicle" instead of silently changing the rental length.
- Both replaced their bespoke steppers and date inputs with `QtyStepper` /
  `DateField`.

`OrderCheckoutForm.jsx` now has exactly one remaining consumer,
`FishingToursPage.jsx`; it gets deleted when that page is wired.

Verified: build and `tsc --noEmit` clean; utility-conflict scan clean across 13
files; 18 "Add to cart" controls present in the prerendered home page (12 activities
+ 6 vehicles); the transport section no longer renders an inline order form;
`inert` confirmed to serialise correctly (omitted when false, `inert=""` when true).
Click-through still unverified — no browser automation available.

### 2026-09-29 — phase 3b: spa, chef and full fridge wired

Fishing tours is **deliberately left unconnected** at the product owner's request.
It still uses the old `useOrderCart` hook and still renders `OrderCheckoutForm`,
which is why both of those files survive. Don't delete either until fishing is
migrated.

**`src/hooks/useDraft.js`** is the new shared page-local selection store. Unlike
`useOrderCart` it never stores labels and never folds quantity into a price — the
commit builds those from the i18n data. Nothing in it is persisted.

Each of the three pages now follows the same shape: the whole page is a draft, it
renders its own end-of-page summary, and one "Add to cart" commits. Every commit
does `clearService(id)` **then** adds the lines, so deselecting something and
re-committing cannot leave an orphan line behind. Verified that this sequence works
as intended (React applies the functional updaters in order) and that it leaves other
services' lines and `serviceForms` untouched.

- **`WellnessSpaPage`** — `SpaCheckout` (which used to POST directly) became
  `SpaSummary`. Massage duration becomes the `lineId` variant, so "Deep Tissue
  60 min" and "90 min" are distinct lines. The enhancements gate is now scoped to
  this page's draft: checking the global cart would have let a rental car unlock
  facial add-ons.
- **`FullFridgePage`** — the "Add to cart" button had no `onClick` at all and the
  questionnaire was never submitted anywhere; both now work. `updatePackageCart`
  is gone (it existed only to keep the old local cart in sync on every click).
  Produce selections switched from translated `"Category::Item"` strings to stable
  `category:item` ids derived from the English labels, matching the payload
  contract. Beverages became quantities instead of toggles.
  The package tier is the *nearest* match to the requested guests/days, so the exact
  numbers asked for are preserved in `options.requested`.
- **`PrivateChefPage`** — `ChefCheckout` became `ChefSummary`; the dietary form
  stays local and is handed up as structured data on commit, landing in
  `serviceForms["private-chef"]` instead of being flattened into zero-price lines.
  `changeDishQty` no longer does double duty: desserts/bakery are priced quantities,
  and the copy it used to write into `dishes` was never read back. Guest counts go in
  `options.guests`, never concatenated into the title.
  Dish picks stay in the guest's own language — they are prose for the chef, not ids.

Known remaining inconsistency: `PrivateChefPage` still has 5 hand-rolled steppers
and 2 one-off date inputs rather than `QtyStepper` / `DateField`. The other three
surfaces are fully migrated. Left alone because it is a purely visual change that
could not be verified in a browser this session.

Verified: `tsc --noEmit` and the production build clean, all 11 routes generated;
utility-conflict scan clean; each of the three pages renders exactly one "Add to
cart" and no longer renders the old "Submit order" form, while `/fishing-tours/`
still renders it; 32 chef skus and all spa skus unique. Click-through still not
machine-verified.

### 2026-10-01 — preference forms made visible, and a round-trip bug fixed

Prompted by the product owner asking whether the spa's allergies field was actually
being saved. It was — but there was no way to see it, and checking turned up a real
data-loss bug next to it.

**Preferences are now shown, not just acknowledged.** The drawer used to render a
bare "Preferences saved" chip. `src/lib/serviceForm.js` (`describeServiceForm`) turns
a `serviceForms[serviceId]` blob into ordered label/value rows, rendered in a
collapsed `<details>` in the drawer and expanded on `/checkout/`. The formatter is
shape-driven rather than key-driven, so it handles all three services without
special-casing: strings pass through, arrays join, `{option: count}` becomes
"Vegetarian (2)", and `{meal: [dishes]}` becomes "Breakfast: A, B". `produce` is
shown as a count — it is a list of 40+ slugs, which would be noise. Labels live in
`cart.formLabels.*` in both locales.

**Bug found and fixed: returning to a service page wiped the previous commit.** None
of the three in-house pages seeded their draft from the cart, so the drawer's "Edit"
link landed the guest on a blank page. Because every commit calls `clearService()`
first, selecting one new item there and pressing "Add to cart" silently dropped the
lines *and* the preferences already committed — the guest thinks they are adding a
third massage and ends up with only the new one.

Fixed with `useSeedDraftFromCart` in `src/hooks/useDraft.js` plus per-page restore:

- **Spa** — a `sku -> draft key` map, the exact inverse of `buildLines()`. Verified
  that every sku the commit can produce resolves back to the right draft key, with
  full coverage and no mismatches.
- **Full Fridge** — almost everything comes back from `serviceForms` (counts, produce
  ids, every questionnaire answer); only beverage quantities are read off the lines.
- **Chef** — each committed line is matched back to the control that made it; guest
  counts are recovered by parsing `options.guests` ("6 guests" -> 6).

All three guard on `hydrated` with a ref so they fire once and cannot overwrite edits
in progress — the same pattern as the home-page cards.

Also confirmed while testing: `serviceForms` survive navigation and rehydration, and
the `clearService`-before-`setServiceForm` ordering means a cleared allergies field
does not leave a stale value behind (a previously typed allergy really does
disappear if the guest empties the field and re-commits).

Noted: `FullFridgePage`'s `form.dietaryPreferences` is dead state — declared and read
in the `answered` derivation but never bound to any input. It is deliberately absent
from the committed payload.

### 2026-11-15 — planning session: the real backend

No code written. This session replanned the integration end to end and rewrote
sections 1–8 of this file. Decisions and measurements are in those sections; what
follows is what *changed* versus the previous plan, so a reader of the old version
knows what to unlearn.

- **Fishing tours is wired** and all four signature experiences have per-service
  notes. The old §1 said fishing was deliberately deferred. That work exists but is
  **uncommitted** (20 files, +3,130/−642).
- **`OrderCheckoutForm.jsx` and `useOrderCart.js` are orphaned**, so the app
  currently has *no* submit path at all, and `submitOrder` has no live caller.
- **There is no mock.** The old §3 described `orderApi.js` as resolving against a
  mock with a switch at the top of the file. It is 25 lines with a direct `fetch`.
- **No backward compatibility is needed** — reasoned in §1. Removes the old plan's
  "accept the flat shape for one release" requirement.
- **Model changed**: one Sheet per reservation in a Drive folder, keyed by the Simple
  Booking reservation number, rather than one master Orders/OrderItems book. A real
  `.xlsx` per order was considered and dropped — Apps Script cannot append to an
  xlsx, so accumulating into one would mean convert→append→export→replace on every
  checkout, which is racy and can corrupt the only copy.
- **The sheet is a reference document, not a billing surface.** Invoices happen in a
  separate system. Live formulas and editable price cells were briefly planned on the
  wrong premise and removed; precomputed totals stay.
- **Hosting moves to Vercel**, which withdraws the `text/plain` and public-secret
  constraints and unblocks payment later.
- **Prices measured**: 50 structured values per locale (0 divergences today), 102
  prose strings per locale carrying prices, 1 hardcoded `dailyRate: 200`. The old
  doc's "~65-entry migration" understated it by about 4×.
