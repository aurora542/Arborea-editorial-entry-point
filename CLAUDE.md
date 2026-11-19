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
business data, not only translations: menu items, package contents, guest-count
tiers, and third-party operator details.

**Prices are the exception — they are NOT in these files any more.** All 98 of them
live in [src/data/pricing.js](src/data/pricing.js), injected into whichever locale
is active by `applyPrices()` in `I18nContext`. Components still read them the old
way (`t("…").priceValue`) and don't know the difference. To change a price, edit
`pricing.js` — that is the whole procedure. Copy that quotes a price in prose uses
a `{{p:<path>}}` token resolved from the same source, so the pricing tables cannot
drift from the cart. Structural numbers (`guests`, `days`, `baseGuests`,
`minGuests`, `maxGuests`) deliberately stay in the locale files: they describe the
product, not its price.

`t("path.to.key")` in [src/app/context/I18nContext.jsx](src/app/context/I18nContext.jsx)
walks the JSON by dot notation and returns **whatever node it lands on** — a string,
an object, or an array. This is why callers are full of `Array.isArray(x) && x.map(...)`
guards; keep them, the JSON is the schema.

Consequences that bite:

- **Both locale files must stay structurally identical.** Array lengths and the
  remaining numeric values are load-bearing. Adding an item to `en.json` only will
  silently break the Spanish UI. The 41 structural numbers are in sync — verify
  before and after touching either file.
- Prices used to be duplicated across both locales and read from the *active
  locale*, so a one-sided edit meant a Spanish guest was quoted a different number
  than an English one. That is fixed — see the pricing note above.
- `tours.activities` also carries **internal-only** fields (`commission`,
  `contactName`, `whatsapp`). These ship in the client bundle. Never copy an
  activity object wholesale into a cart line or an outbound payload — whitelist
  fields explicitly.

### Cart

> **Partly built.** The context, sku helper, shared primitives, service registry,
> drawer, floating button and the `/checkout/` review section exist. The six
> service pages are **not** wired yet — they still use their own local state — and
> `/checkout/` has no guest form or submit. See the status table in
> [docs/ORDERS-BACKEND.md](docs/ORDERS-BACKEND.md) before assuming a section below
> is live.

`LenisProvider` reads `isOpen` from the cart to stop smooth scrolling while the
drawer is open, and to clear the `pointer-events: none` Lenis puts on `<body>`
during scroll. Any future overlay needs the same treatment, and anything that must
stay clickable while the page scrolls needs an explicit `pointer-events-auto`.

Cart line `options` values are rendered as a `·`-joined caption with the keys
hidden, so each value must read as a label by itself — `{ days: "3 days" }`, not
`{ days: 3 }`. The typed number belongs in the line's `data` bag alongside it.

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

- One line shape for all services:
  `{ lineId, service, sku, title, titleEn, kind, qty, unitPrice, byQuote, date, options, data }`.
  `normalizeLine` in `CartContext.jsx` is a **whitelist** — a field a builder sets
  but it doesn't copy is silently dropped on commit and on rehydration, which looks
  exactly like the builder not running. Adding a field to a line means adding it there.
- **`options` is for display, `data` is for the record.** `options` values are
  rendered as a `·`-joined caption with the keys hidden, so each one must read as a
  label by itself (`{ days: "3 days" }`, not `{ days: 3 }`) and is locale-dependent
  by design. `data` holds the same facts typed and unlocalised (`{ days: 3 }`,
  `{ guests: 6 }`, `{ durationMin: 90 }`, `{ dishes: {…} }`) and is what the payload
  and the concierge's sheet read. Never spread an i18n object into `data` — that
  would defeat the whitelist.
- **`title` is the guest's language; `titleEn` is canonical.** `title` comes from
  `t()`, so it is whatever locale was active. 72 of the 80 orderable items have a
  different Spanish string, so without `titleEn` one reservation's sheet ends up
  half in each language. Build it with `titleOf()` / `enString()` from
  [src/lib/sku.js](src/lib/sku.js), which read `en.json` directly.
- **`kind`** says what a line *is* (`"massage"`, `"beverage"`, `"vehicle"`,
  `"chef-service"`, …). Page logic branches on it instead of parsing sku strings,
  and the sheet groups rows by it.
- **`byQuote`** is explicit rather than inferred from `unitPrice === 0`, which
  cannot tell "we'll quote you" apart from a genuinely free item. Transport and
  tours set it.
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

The order submission path is **built but not connected**. `src/lib/orderApi.js`
runs against a mock. Read
[docs/ORDERS-BACKEND.md](docs/ORDERS-BACKEND.md) before touching anything in the
order/checkout path — it holds the payload contract, the integration steps, and an
explicit list of what not to change.
