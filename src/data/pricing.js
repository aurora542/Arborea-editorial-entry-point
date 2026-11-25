/*
 * THE single source of truth for every price in the product.
 *
 * Prices used to live inside `en.json` and `es.json`, duplicated across both. The
 * two files were verified identical at migration time, but nothing enforced it:
 * editing a price in one locale and not the other meant a guest ordering in Spanish
 * was quoted a different number than one ordering in English, and the order sheet
 * recorded whichever they happened to see. With real money about to flow through
 * this path, that could not stay a latent risk.
 *
 * How it works: `applyPrices()` injects these values into a locale tree at module
 * load in `I18nContext`, so every `t("...").priceValue` read in the app resolves
 * here no matter which language is active. Components were not changed and do not
 * know this exists — which is why the migration could not alter behaviour.
 *
 * Keys are i18n dot paths into the locale tree; numeric segments index arrays. The
 * locale files no longer carry these keys at all, so a translator cannot touch a
 * price and a price change cannot be half-applied.
 *
 * TO CHANGE A PRICE: edit it here. That is the whole procedure.
 *
 * Generated from en.json on 2026-11-19 and verified byte-identical against both
 * locales. Structural numbers (`guests`, `days`, `baseGuests`, `minGuests`,
 * `maxGuests`) deliberately stay in the locale files — they describe the product,
 * not its price.
 */

export const PRICES = {
  /* ── Private Chef — 11 values ── */
  "privateChef.pricing.perService.items.0.basePrice": 230,
  "privateChef.pricing.perService.items.0.extraPersonPrice": 24,
  "privateChef.pricing.perService.items.1.basePrice": 235,
  "privateChef.pricing.perService.items.1.extraPersonPrice": 28,
  "privateChef.pricing.perService.items.2.basePrice": 245,
  "privateChef.pricing.perService.items.2.extraPersonPrice": 52,
  "privateChef.pricing.perService.items.3.basePrice": 610,
  "privateChef.pricing.perService.items.3.extraPersonPrice": 80,
  "privateChef.pricing.themedNights.items.0.priceValue": 530,
  "privateChef.pricing.themedNights.items.1.priceValue": 835,
  "privateChef.pricing.themedNights.items.2.priceValue": 1140,

  /* ── Full Fridge — 9 values ── */
  "fullFridge.beverages.items.0.priceValue": 45,
  "fullFridge.beverages.items.1.priceValue": 85,
  "fullFridge.beverages.items.2.priceValue": 18,
  "fullFridge.beverages.items.3.priceValue": 65,
  "fullFridge.beverages.items.4.priceValue": 30,
  "fullFridge.beverages.items.5.priceValue": 150,
  "fullFridge.pricing.rows.0.priceValues": [299, 533, 728, 871],
  "fullFridge.pricing.rows.1.priceValues": [494, 884, 1209, 1456],
  "fullFridge.pricing.rows.2.priceValues": [793, 1417, 1937, 2327],

  /* ── Wellness Spa — 16 values ── */
  "wellnessSpa.facials.addons.priceValue": 40,
  "wellnessSpa.facials.items.0.priceValue": 80,
  "wellnessSpa.facials.items.1.priceValue": 80,
  "wellnessSpa.massages.durationPricing.0.priceValue": 95,
  "wellnessSpa.massages.durationPricing.1.priceValue": 120,
  "wellnessSpa.massages.fourHands.durationPricing.0.priceValue": 180,
  "wellnessSpa.massages.fourHands.durationPricing.1.priceValue": 220,
  "wellnessSpa.packages.items.0.priceValue": 240,
  "wellnessSpa.packages.items.1.priceValue": 235,
  "wellnessSpa.packages.items.2.priceValue": 230,
  "wellnessSpa.packages.items.3.priceValue": 230,
  "wellnessSpa.packages.items.4.priceValue": 140,
  "wellnessSpa.packages.items.5.priceValue": 140,
  "wellnessSpa.packages.items.6.priceValue": 140,
  "wellnessSpa.packages.items.7.priceValue": 135,
  "wellnessSpa.packages.items.8.priceValue": 140,

  /* ── Fishing Tours — 60 values ── */
  "fishingTours.anglers.items.0.tiers.0.perPerson": 650,
  "fishingTours.anglers.items.0.tiers.0.total": 1300,
  "fishingTours.anglers.items.0.tiers.1.perPerson": 325,
  "fishingTours.anglers.items.0.tiers.1.total": 1300,
  "fishingTours.anglers.items.0.tiers.2.perPerson": 260,
  "fishingTours.anglers.items.0.tiers.2.total": 1300,
  "fishingTours.anglers.items.1.tiers.0.perPerson": 500,
  "fishingTours.anglers.items.1.tiers.0.total": 1000,
  "fishingTours.anglers.items.1.tiers.1.perPerson": 250,
  "fishingTours.anglers.items.1.tiers.1.total": 1000,
  "fishingTours.anglers.items.1.tiers.2.perPerson": 200,
  "fishingTours.anglers.items.1.tiers.2.total": 1000,
  "fishingTours.anglers.items.2.tiers.0.perPerson": 350,
  "fishingTours.anglers.items.2.tiers.0.total": 700,
  "fishingTours.anglers.items.2.tiers.1.perPerson": 175,
  "fishingTours.anglers.items.2.tiers.1.total": 700,
  "fishingTours.anglers.items.2.tiers.2.perPerson": 140,
  "fishingTours.anglers.items.2.tiers.2.total": 700,
  "fishingTours.anglers.items.3.tiers.0.perPerson": 300,
  "fishingTours.anglers.items.3.tiers.0.total": 600,
  "fishingTours.anglers.items.3.tiers.1.perPerson": 150,
  "fishingTours.anglers.items.3.tiers.1.total": 600,
  "fishingTours.anglers.items.3.tiers.2.perPerson": 120,
  "fishingTours.anglers.items.3.tiers.2.total": 600,
  "fishingTours.family.items.0.tiers.0.perPerson": 450,
  "fishingTours.family.items.0.tiers.0.total": 900,
  "fishingTours.family.items.0.tiers.1.perPerson": 225,
  "fishingTours.family.items.0.tiers.1.total": 900,
  "fishingTours.family.items.0.tiers.2.perPerson": 180,
  "fishingTours.family.items.0.tiers.2.total": 900,
  "fishingTours.family.items.0.tiers.3.perPerson": 150,
  "fishingTours.family.items.0.tiers.3.total": 900,
  "fishingTours.family.items.0.tiers.4.perPerson": 128.5,
  "fishingTours.family.items.0.tiers.4.total": 900,
  "fishingTours.family.items.0.tiers.5.perPerson": 112.5,
  "fishingTours.family.items.0.tiers.5.total": 900,
  "fishingTours.family.items.1.tiers.0.perPerson": 600,
  "fishingTours.family.items.1.tiers.0.total": 1200,
  "fishingTours.family.items.1.tiers.1.perPerson": 300,
  "fishingTours.family.items.1.tiers.1.total": 1200,
  "fishingTours.family.items.1.tiers.2.perPerson": 240,
  "fishingTours.family.items.1.tiers.2.total": 1200,
  "fishingTours.family.items.1.tiers.3.perPerson": 200,
  "fishingTours.family.items.1.tiers.3.total": 1200,
  "fishingTours.family.items.1.tiers.4.perPerson": 171.43,
  "fishingTours.family.items.1.tiers.4.total": 1200,
  "fishingTours.family.items.2.tiers.0.perPerson": 150,
  "fishingTours.family.items.2.tiers.0.total": 300,
  "fishingTours.family.items.2.tiers.1.perPerson": 150,
  "fishingTours.family.items.2.tiers.1.total": 450,
  "fishingTours.family.items.2.tiers.2.perPerson": 150,
  "fishingTours.family.items.2.tiers.2.total": 600,
  "fishingTours.family.items.2.tiers.3.perPerson": 150,
  "fishingTours.family.items.2.tiers.3.total": 750,
  "fishingTours.family.items.2.tiers.4.perPerson": 125,
  "fishingTours.family.items.2.tiers.4.total": 750,
  "fishingTours.family.items.2.tiers.5.perPerson": 125,
  "fishingTours.family.items.2.tiers.5.total": 875,
  "fishingTours.family.items.2.tiers.6.perPerson": 125,
  "fishingTours.family.items.2.tiers.6.total": 1000,

  /* ── Third-party tours & activities — 12 values ── */
  "tours.activities.0.priceValue": 170,
  "tours.activities.1.priceValue": 110,
  "tours.activities.10.priceValue": 91,
  "tours.activities.11.priceValue": 90,
  "tours.activities.2.priceValue": 65,
  "tours.activities.3.priceValue": 150,
  "tours.activities.4.priceValue": 100,
  "tours.activities.5.priceValue": 150,
  "tours.activities.6.priceValue": 155,
  "tours.activities.7.priceValue": 130,
  "tours.activities.8.priceValue": 86,
  "tours.activities.9.priceValue": 150,
};

/* Flat per-item price for chef desserts and bakery. Was a bare `DISH_PRICE = 15`
 * inside PrivateChefPage. */
export const DISH_PRICE = 15;

/* Vehicles are defined in MulaRentalSection rather than i18n (makes and models are
 * not translated). Only the Arborea-owned Side-by-Side has a fixed rate; the rest
 * are by-quote through the rental partners. */
export const VEHICLE_DAILY_RATES = {
  sidebyside: 200,
};

/* Injected into the locale tree so the `mulaRental.priceTag` copy can interpolate
 * it. Same constant as above, referenced — not a second literal. */
PRICES["mulaRental.dailyRate"] = VEHICLE_DAILY_RATES.sidebyside;

/* Writes one dot path into a tree, creating nothing: every container already
 * exists in the locale files, only the price leaf was removed. */
function setPath(tree, path, value) {
  const parts = path.split(".");
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (node == null || typeof node !== "object") return;
    node = node[key];
  }
  if (node == null || typeof node !== "object") return;
  const last = parts[parts.length - 1];
  node[/^\d+$/.test(last) ? Number(last) : last] = Array.isArray(value) ? [...value] : value;
}

/* Reads a dot path out of a tree. Numeric segments index arrays, so a token can
 * point at one cell of a `priceValues` row. */
function getPath(tree, path) {
  let node = tree;
  for (const segment of path.split(".")) {
    if (node == null) return undefined;
    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    node = node[key];
  }
  return node;
}

/* "$1,240" — the same formatting `money()` in lib/format.js produces, which is what
 * these strings were written by hand to look like. Kept local so this module has no
 * imports and can be loaded by a verification script on its own. */
function formatMoney(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
}

const TOKEN = /\{\{p:([^}]+)\}\}/g;

/*
 * Copy, mostly in the locale files, quotes prices in prose: "From $230 for 2 ·
 * +$24 per extra person". Those numbers were hand-written duplicates of the real
 * price, in both languages — so a price change had to be made in three places and
 * a missed one left the pricing table disagreeing with the cart.
 *
 * Such strings now carry `{{p:<path>}}` tokens, resolved here against the tree
 * that prices were just injected into. 49 strings were converted. The remainder
 * were deliberately left as literals: `tours.activities[].pricing[]` is an internal
 * operator rate card with numbers that exist nowhere else (and is not rendered),
 * and `wellnessSpa.pricing.*` display rows have no numeric counterpart.
 */
function resolveTokens(tree) {
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach((value, i) => {
        if (typeof value === "string") node[i] = substitute(value, tree);
        else walk(value);
      });
    } else if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === "string") node[key] = substitute(value, tree);
        else walk(value);
      }
    }
  };
  walk(tree);
  return tree;
}

function substitute(text, tree) {
  if (!text.includes("{{p:")) return text;
  return text.replace(TOKEN, (whole, path) => {
    const value = getPath(tree, path);
    /* Leave the token visible rather than printing "$0" — a silently wrong price is
     * far worse than an obviously broken one. */
    return typeof value === "number" ? formatMoney(value) : whole;
  });
}

/**
 * Returns a copy of `tree` with every price from `PRICES` written into it and every
 * `{{p:…}}` token in its copy resolved.
 *
 * Cloned rather than mutated: the imported JSON module is shared, and writing into
 * it would leak one locale's state into the other and survive hot reloads.
 */
export function applyPrices(tree) {
  const copy = JSON.parse(JSON.stringify(tree));
  for (const [path, value] of Object.entries(PRICES)) setPath(copy, path, value);
  return resolveTokens(copy);
}
