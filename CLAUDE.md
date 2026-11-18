# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server
npm run build    # static export -> out/
npm run lint     # next lint
npx tsc --noEmit # typecheck (passes clean; keep it that way)
```

There is no test suite.

## What this is

Guest-facing "welcome" microsite for Arbórea Experiences, a set of rental houses in
the Osa Peninsula, Costa Rica. Guests browse in-house services (private chef, full
fridge, spa, fishing), third-party tours, and vehicle rentals, and submit a single
concierge order. **No payment is ever taken** — an order is a request that
operations confirms by WhatsApp/email.

Next.js 16 App Router, React 19, Tailwind 3, JS/JSX for everything except
`layout.tsx`, `page.tsx`, `JsonLd.tsx` and `ui/select.tsx`.

## Hard constraints

**`output: "export"` in `next.config.ts` — this is a static site.** No API routes,
no server actions, no middleware, no `revalidate`, no runtime env vars. Every page
is prerendered HTML. Anything that needs a backend must be a `fetch` from the
browser to an external endpoint. `NEXT_PUBLIC_*` values are inlined at build time,
so they must be set in the build environment, not just locally.

`trailingSlash: true` — routes resolve as `/checkout/`, not `/checkout`.

Because HTML is prerendered, **never read `sessionStorage`/`localStorage` or
`window` during render** — hydrate in `useEffect` or the prerendered markup and the
first client render disagree.

## Architecture

### i18n is the content database, not just copy

`src/i18n/en.json` and `es.json` (~2180 lines each) hold the site's structured
business data, not only translations: prices (`priceValue`, `basePrice`,
`extraPersonPrice`, `priceValues[]`), menu items, package contents, guest-count
tiers, and third-party operator details.

`t("path.to.key")` in [src/app/context/I18nContext.jsx](src/app/context/I18nContext.jsx)
walks the JSON by dot notation and returns **whatever node it lands on** — a string,
an object, or an array. This is why callers are full of `Array.isArray(x) && x.map(...)`
guards; keep them, the JSON is the schema.

Consequences that bite:

- **Both locale files must stay structurally identical.** Array lengths and numeric
  values are load-bearing. Adding an item to `en.json` only will silently break the
  Spanish UI. The 74 numeric price/quantity keys are currently in sync — verify
  before and after touching either file.
- Prices reach the cart through `t()`, so they are read from the *active locale*.
  Extracting prices to a single non-i18n source is a known desirable follow-up
  (see the handoff doc), deliberately not done yet.
- `tours.activities` also carries **internal-only** fields (`commission`,
  `contactName`, `whatsapp`). These ship in the client bundle. Never copy an
  activity object wholesale into a cart line or an outbound payload — whitelist
  fields explicitly.

### Cart

> **Two cart systems coexist — know which one a page uses.**
>
> 1. **Session cart** — `useCart()` from
>    [src/app/context/CartContext.jsx](src/app/context/CartContext.jsx). This is the
>    real, documented order. The in-house service pages (`PrivateChefPage`,
>    `FullFridgePage`, `WellnessSpaPage`), `MulaRentalSection`, and the `/checkout/`
>    review (`CheckoutPage`) use it. Everything below describes this system.
> 2. **Local `useOrderCart`** — [src/hooks/useOrderCart.js](src/hooks/useOrderCart.js),
>    a plain `useState` map that does **not** touch the session cart or
>    `sessionStorage`. Only `FishingToursPage` uses it, paired with
>    `OrderCheckoutForm` for its own inline submit. It is the odd one out; do not
>    assume its selections reach `/checkout/`.
>
> See the status table in [docs/ORDERS-BACKEND.md](docs/ORDERS-BACKEND.md) for the
> authoritative per-section state before assuming a flow is fully live.

`LenisProvider` reads `isOpen` from the cart to stop smooth scrolling while the
drawer is open, and to clear the `pointer-events: none` Lenis puts on `<body>`
during scroll. Any future overlay needs the same treatment, and anything that must
stay clickable while the page scrolls needs an explicit `pointer-events-auto`.

Cart line `options` values are rendered as a `·`-joined caption with the keys
hidden, so each value must read as a label by itself — `{ days: "3 days" }`, not
`{ days: 3 }`.

Single session-scoped cart in `src/app/context/CartContext.jsx`, mounted in
`layout.tsx` inside `I18nProvider`. Every service page adds lines to it; the drawer
and `/checkout/` are the only places an order is reviewed or submitted.

**The cart holds the committed order, not the working state.** Every surface keeps
its own local draft and writes to the cart only when the guest explicitly commits:

- Home page (activities, vehicles): the card holds quantity/date, and one
  "Add to cart" press commits that single line. There is no section summary.
- In-house service pages: the *whole page* is the draft. Selections and the
  preference questions accumulate in local state, the page shows its own summary at
  the end, and a single "Add to cart" commits the priced lines plus that service's
  `serviceForms` entry together.

Committing a service should `clearService(id)` first, then add, so re-submitting a
page replaces its lines instead of leaving orphans behind from deselected items.

When seeding a draft from an existing cart line, do it in an effect guarded on
`hydrated` — **not** in a `useState` initialiser. The first render happens before
the cart has read `sessionStorage`, so an initialiser captures an empty cart and
never re-runs. Guard with a ref so it fires once and can't overwrite live edits
(see `ActivityCard` and `MulaRentalSection` for the pattern).

- One line shape for all services: `{ lineId, service, sku, title, qty, unitPrice, date, options }`.
- `lineTotal` is **derived** (`qty * unitPrice`) in the context. Do not bake
  quantity into a price or into a display label — earlier code did both and it was
  the source of persistent desync bugs.
- `sku` is a stable slug derived from the **English** title via `skuOf()` in
  [src/lib/sku.js](src/lib/sku.js) — never build an id from `t()` output or from an
  array index, or it changes with the locale and shifts when an array is reordered.
- Per-service free-form preference blobs (chef dietary form, fridge questionnaire,
  spa allergies) live in `serviceForms`, keyed by service id — not as fake
  zero-price cart lines.
- Persistence is `sessionStorage` only, by decision. It is not meant to survive a
  closed browser.

`src/data/services.js` is the registry of the six services (`id`, label, color,
route, icon). The drawer and checkout group lines by it; it is the single source of
per-service identity.

### Routing

`/` composes the home sections. `/private-chef/`, `/full-fridge/`,
`/wellness-spa/`, `/fishing-tours/` are the service pages — each is a thin
`app/*/page.jsx` wrapper around a big component in `src/components/sections/`.
`/[slug]/` renders a property page for each key in
[src/data/properties.js](src/data/properties.js), with copy under
`properties.<i18nKey>` in the locale files.

### Styling conventions

The brand palette is **hardcoded hex in JSX**, not Tailwind theme tokens. The
shadcn/HSL tokens in `tailwind.config.ts` and `globals.css` exist but are only used
by `ui/select.tsx`; don't migrate the pages to them incidentally.

Core palette: `#213B2F` forest green, `#D8DDB8` pale sage, `#EDE5D8` bone,
`#222E2C` near-black, `#E0D4C4` sand. Per-service accents: spa `#8B5A3C`, fridge
`#5C3324`, chef `#213B2F`, gold detail `#C9974F`.

**Never split a Tailwind utility family across the static and conditional halves of
a `className`.** Whichever class Tailwind emits later in the stylesheet wins, not
the one listed later in the attribute — so
`` `fixed pointer-events-auto ${open ? "" : "pointer-events-none"}` `` stays
clickable when closed, the opposite of how it reads. Emit exactly one class per
family from the ternary. This already caused a full-screen invisible click trap
over the whole site once; it type-checks and builds silently.

Display serif is GT Alpina, applied as `style={{ fontFamily: "var(--font-alpina)" }}`
(declared in `globals.css`, *not* in the Tailwind `fontFamily.display` slot, which
points at an unused Playfair variable). Body font is Inter via `font-sans`.

Icons are `react-icons/tb` (Tabler) throughout.

Shared primitives live in `src/components/ui/`: `QtyStepper`, `DateField`, `Chip`,
`SelectableCard`. Use them — these replaced 13 hand-rolled quantity steppers and 6
one-off date inputs, and re-introducing a bespoke one re-opens that inconsistency.

## Orders backend

`submitOrder` in [src/lib/orderApi.js](src/lib/orderApi.js) POSTs the order (plus a
shared secret) as `text/plain` to a Google Apps Script web app
([apps-script/Code.gs](apps-script/Code.gs)), which writes to a Google Sheet,
de-dupes by `submissionId`, and emails operations. The script is included in-repo
but is deployed separately; its `CONFIG` placeholders (`SHARED_SECRET`, `SHEET_ID`,
`NOTIFY_EMAILS`) are filled in on the deployed copy, not here.

The URL and secret come from `NEXT_PUBLIC_ORDERS_BACKEND_URL` /
`NEXT_PUBLIC_ORDERS_SHARED_SECRET`, **inlined at build time** (static export — see
Hard constraints). `orderApi.js` routes both `submitOrder` and `submitRequest`
through one `post()`: with no URL and `NODE_ENV !== "production"` it returns a
~1.2s dev mock (`{ ok: true, mock: true }`); in production a missing URL returns
`missing-backend-url` (never a silent success — that would drop real orders).

Payloads are built by [src/lib/orderPayload.js](src/lib/orderPayload.js)
(`buildOrderPayload` / `buildRequestPayload`), which re-applies the line whitelist
and computes `totals`. `apps-script/Code.gs` is already the live backend (orders +
kiosk requests + web/kiosk validation + `setup()`/test fns) — deploy it, don't
rewrite it.

Read [docs/ORDERS-BACKEND.md](docs/ORDERS-BACKEND.md) before touching anything in
the order/checkout path — it holds the payload contract (incl. the `source` field and
the `type:"request"` shape), the required fields the Apps Script validates, and an
explicit list of what not to change.

## Kiosk mode (Casa Ceiba tablet)

A guest-facing kiosk mode runs **inside the same static build**, for a tablet fixed in
a house running Fully Kiosk Browser. Activated by URL
(`/?kiosk=1&casa=<slug>`), persisted in `localStorage` (`arborea.kiosk.v1`), turned
off by `?kiosk=0`. [src/app/context/KioskContext.jsx](src/app/context/KioskContext.jsx)
owns it; `useKiosk()` exposes `{ isKiosk, casa, casaSlug, ready, pause, resume,
resetKiosk }`.

- **`isKiosk` gates everything.** Every kiosk surface is off when false, so without
  `?kiosk` the public site is byte-for-byte what it was. When adding kiosk behaviour,
  condition it on `isKiosk`; never change a shared component's default path.
- **Config is centralized** in [src/lib/kioskConfig.js](src/lib/kioskConfig.js)
  (`KIOSK_CONFIG`): idle/warning seconds, default locale, front-desk WhatsApp, office
  hours, request categories. Values still to confirm are marked `// POR CONFIRMAR`.
  Request category ids must stay aligned with `REQUEST_LABELS` in `Code.gs`.
- **Reading activation**: parse `window.location.search` in an effect — **not**
  `useSearchParams` (it needs a Suspense boundary under static export).
- **Pieces**, all under `src/components/kiosk/`: `KioskBar` (fixed bottom nav),
  `IdleReset` (180s → clean reset, 15s warning overlay; respects `pause`/`resume` so a
  send isn't wiped mid-flight), `KioskLinkGuard` + `ExternalLinkModal` (catches
  `wa.me`/`tel:`/`mailto:`/foreign-origin links and shows a QR instead — this is why
  the ~8 components holding those links are never edited), `OfflineBanner`,
  `RequestsPage` (`/solicitudes/`). `SuccessScreen` and `GuestDetailsForm` live under
  `src/components/checkout/`. `LenisProvider` early-returns in kiosk (its 150ms
  pointer-events lock eats taps after a swipe).
- `resetKiosk()` clears the cart, resets to the default locale, wipes `arborea.*`
  session keys (keeping the `localStorage` kiosk flag), and navigates home.
