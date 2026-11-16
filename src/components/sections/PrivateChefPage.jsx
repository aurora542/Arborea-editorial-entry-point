"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/app/context/I18nContext";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/Footer";
import { useCart } from "@/app/context/CartContext";
import { skuOf, lineIdOf } from "@/lib/sku";
import { money } from "@/lib/format";
import DateField from "@/components/ui/DateField";
import {
  TbArrowLeft, TbLeaf, TbCircleCheck, TbBrandWhatsapp, TbCheck,
  TbGlassCocktail, TbCoffee, TbSalad, TbToolsKitchen2,
  TbHandClick, TbAdjustments, TbSend, TbListCheck, TbPlus,
  TbNotes, TbShoppingBag, TbTrash,
} from "react-icons/tb";

const WHATSAPP = "50685011042";
const STORY_IMAGE = "/assets/InHouseServices/PrivateChefExperience.avif";

const MEAL_META = {
  breakfast: { icon: TbCoffee },
  lunch: { icon: TbSalad },
  dinner: { icon: TbToolsKitchen2 },
};

function computeServicePrice(item, guests) {
  return item.basePrice + Math.max(0, guests - item.baseGuests) * item.extraPersonPrice;
}

function findThemedTier(tiers, guests) {
  return tiers.find((tier) => guests >= tier.minGuests && guests <= tier.maxGuests) || tiers[tiers.length - 1];
}

// Which meal menus a given per-service option unlocks (Full Day unlocks all three).
const SERVICE_MEALS = [["breakfast"], ["lunch"], ["dinner"], ["breakfast", "lunch", "dinner"]];

const SERVICE = "private-chef";

export default function PrivateChefPage() {
  const { t } = useI18n();
  const { setLine, addLine, clearService, setServiceForm, openCart, linesByService, lines, serviceForms, hydrated, editSignal } = useCart();
  const [notes, setNotes] = useState("");

  /*
   * Page has two commit modes:
   *
   *   - "add"  (default): page represents a *new* chef booking that should
   *     concatenate with whatever the cart already has for this service. New
   *     per-day lines get fresh unique ids so they append rather than replace;
   *     qty-based add-ons (beverages / desserts / bakery) sum into existing
   *     lines via `addLine`.
   *
   *   - "edit": guest came in via the drawer's Edit link; the page shows the
   *     cart's current chef section in full. Commit replaces (clearService +
   *     setLine all) and flips back to "add" afterwards so further edits are
   *     additive again.
   */
  const [mode, setMode] = useState("add");

  /* Null until the drawer's Edit link bumps a token — the seed effect fires
   * ONLY on that signal. A fresh visit to /private-chef/ keeps the page empty
   * no matter what the cart already contains. */
  const seedTrigger = editSignal.service === SERVICE ? editSignal.token : null;

  const nav             = t("privateChef.nav");
  const breakfastItems  = t("privateChef.breakfast.items");
  const breakfastExtras = t("privateChef.breakfast.extras");
  const lunchItems      = t("privateChef.lunch.items");
  const dinnerItems     = t("privateChef.dinner.items");
  const dessertsItems   = t("privateChef.desserts.items");
  const bakeryItems     = t("privateChef.bakery.items");
  const themedNights    = t("privateChef.themedNights.nights");
  const pricingPS       = t("privateChef.pricing.perService.items");
  const themedTiers     = t("privateChef.pricing.themedNights.items");
  const pricingBar      = t("privateChef.pricing.bartender.items");
  const ob              = t("privateChef.orderBuilder");
  const sweets          = t("privateChef.sweetsSection");
  const fridgeBeverages = t("fullFridge.beverages");

  /*
   * `serviceItems` is the list of chef bookings — one entry per DAY the guest
   * wants a chef service. Each item is fully self-contained: it carries its own
   * service type, guest count, date, dish picks and active meal tab. This lets
   * a long stay combine, say, "Lunch Dec 15 for 4" + "Full Day Dec 22 for 6"
   * each with their own menu picks.
   *
   * Each item:
   *   - id: ephemeral per-session token; becomes the cart lineId's variant so
   *     same-service bookings don't collide in the cart.
   *   - serviceIdx: index into pricingPS (0 = Breakfast, 1 = Lunch, ...).
   *   - guests: 2+. New items inherit the previous item's guest count.
   *   - date: YYYY-MM-DD, optional.
   *   - dishes: Record<dishId, { label, group }> — only picks for meals this
   *     service type covers (SERVICE_MEALS[serviceIdx]).
   *   - activeMeal: which dish tab is currently shown (Full Day only; others
   *     just show their one meal).
   */
  const [serviceItems, setServiceItems] = useState([]);
  /*
   * `themedItems` — list of themed-night bookings. Same shape idea as
   * `serviceItems`: one entry per occasion (nightIdx + guests + date).
   * Multiple entries with the SAME nightIdx are allowed (e.g. a Mexican Fiesta
   * on Dec 15 and another Mexican Fiesta on Dec 22 — different parties).
   */
  const [themedItems, setThemedItems] = useState([]);
  const [bevQty, setBevQty] = useState({});
  const [bartenderIdx, setBartenderIdx] = useState(null);
  const [dishQty, setDishQty] = useState({});

  const nextItemId = () => `psi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  /* New items inherit the previous item's guest count AND service type so the
   * guest doesn't have to redo the obvious. First item defaults to 2 guests
   * and Lunch (idx 1) because that's the most common booking. */
  const addServiceItem = () => {
    setServiceItems((prev) => {
      const last = prev[prev.length - 1];
      const serviceIdx = last ? last.serviceIdx : 1;
      const guests = last ? last.guests : 2;
      const activeMeal = (SERVICE_MEALS[serviceIdx] || [])[0] ?? null;
      return [
        ...prev,
        { id: nextItemId(), serviceIdx, guests, date: "", dishes: {}, activeMeal },
      ];
    });
  };

  /* Supports a plain patch OR a functional updater that returns a patch —
   * needed by the dish toggler which has to read-then-write the item's dishes. */
  const updateServiceItem = (id, patchOrFn) => {
    setServiceItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const patch = typeof patchOrFn === "function" ? patchOrFn(it) : patchOrFn;
        return { ...it, ...patch };
      }),
    );
  };

  /* Switching an item's service type blows away its dish picks — the old picks
   * may be for meals the new service doesn't cover. Active meal resets to the
   * first meal of the new service. */
  const changeItemService = (id, serviceIdx) => {
    updateServiceItem(id, () => ({
      serviceIdx,
      dishes: {},
      activeMeal: (SERVICE_MEALS[serviceIdx] || [])[0] ?? null,
    }));
  };

  const removeServiceItem = (id) => {
    setServiceItems((prev) => prev.filter((it) => it.id !== id));
  };

  /* Toggle a dish pick for ONE item. Limit (1 or 2 per meal) comes from that
   * item's guest count — larger parties get 2 options so the chef can prep
   * both. Hitting the limit auto-replaces the oldest pick in that meal. */
  const toggleDishInItem = (itemId, dishId, label, group) => {
    updateServiceItem(itemId, (it) => {
      const prevDishes = it.dishes || {};
      const limit = (Number(it.guests) || 2) >= 5 ? 2 : 1;
      if (prevDishes[dishId]) {
        const next = { ...prevDishes };
        delete next[dishId];
        return { dishes: next };
      }
      const groupEntries = Object.entries(prevDishes).filter(([, d]) => d.group === group);
      let nextDishes;
      if (groupEntries.length >= limit) {
        const [oldestId] = groupEntries[0];
        const next = { ...prevDishes };
        delete next[oldestId];
        nextDishes = { ...next, [dishId]: { label, group } };
      } else {
        nextDishes = { ...prevDishes, [dishId]: { label, group } };
      }
      return { dishes: nextDishes };
    });
  };

  const setItemActiveMeal = (itemId, meal) => updateServiceItem(itemId, { activeMeal: meal });

  const DISH_PRICE = 15;

  /* Desserts and bakery are priced items, so they are quantities — not the dish
   * "preferences" that `item.dishes` tracks for the meal menus. */
  const changeDishQty = (id, qty) => {
    setDishQty((prev) => ({ ...prev, [id]: Math.max(0, qty) }));
  };

  /* Add a new themed-night instance for `nightIdx`. Guests inherit from the
   * last themed instance (any night) so a party size set earlier persists. */
  const addThemedItem = (nightIdx) => {
    setThemedItems((prev) => {
      const lastGuests = prev.length ? prev[prev.length - 1].guests : 2;
      return [
        ...prev,
        { id: nextItemId(), nightIdx, guests: Math.max(2, Math.min(15, lastGuests)), date: "" },
      ];
    });
  };

  const updateThemedItem = (id, patch) => {
    setThemedItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  };

  const removeThemedItem = (id) => {
    setThemedItems((prev) => prev.filter((it) => it.id !== id));
  };

  const changeBevQty = (i, qty) => setBevQty((prev) => ({ ...prev, [i]: Math.max(0, qty) }));

  const pickBartender = (i) => setBartenderIdx((prev) => (prev === i ? null : i));

  const clearBartender = () => setBartenderIdx(null);

  const inCart = linesByService.some((g) => g.service.id === SERVICE);

  /*
   * Rehydrate the page from committed cart lines. Fires on first hydration AND
   * whenever `seedTrigger` changes — the drawer's "Edit" link bumps that token
   * so the page re-fills even on same-URL soft nav. Every field is explicitly
   * reset first so an Edit after a submit (which cleared local state) also
   * cleanly re-populates any field that would otherwise linger from before.
   */
  const lastSeed = useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    /* seedTrigger is null until the drawer's Edit link fires — no seed on a
     * fresh visit. Only re-populate when the guest explicitly asks to edit. */
    if (seedTrigger === null) return;
    if (lastSeed.current === seedTrigger) return;
    lastSeed.current = seedTrigger;

    const mine = lines.filter((l) => l.service === SERVICE);

    /* Reset first so the restore starts from a clean slate. */
    setServiceItems([]);
    setThemedItems([]);
    setBartenderIdx(null);
    setBevQty({});
    setDishQty({});
    setNotes("");

    if (!mine.length) {
      setMode("add");
      return;
    }
    setMode("edit");
    const bySku = new Map(mine.map((l) => [l.sku, l]));

    /* Per-day items — parse dishes back out of `options._dishes`. One
     * serviceItem per committed line, preserving cart order. */
    if (Array.isArray(pricingPS)) {
      const perServiceSkus = new Map();
      pricingPS.forEach((_, i) => {
        perServiceSkus.set(skuOf("privateChef.pricing.perService.items", i, "label"), i);
      });
      const restored = [];
      for (const line of mine) {
        const idx = perServiceSkus.get(line.sku);
        if (idx === undefined) continue;
        const n = parseInt(line.options?.guests, 10);
        let dishes = {};
        if (typeof line.options?._dishes === "string") {
          try { dishes = JSON.parse(line.options._dishes) || {}; } catch { dishes = {}; }
        }
        const meals = SERVICE_MEALS[idx] || [];
        restored.push({
          id: nextItemId(),
          serviceIdx: idx,
          guests: Number.isFinite(n) ? Math.max(2, n) : 2,
          date: line.date ?? "",
          dishes,
          activeMeal: meals[0] ?? null,
        });
      }
      if (restored.length) setServiceItems(restored);
    }

    /* Themed nights — multiple instances per night are allowed, so iterate
     * `mine` instead of `bySku` (which would only keep the last line of each
     * sku). Order follows cart order. */
    if (Array.isArray(themedNights)) {
      const nightSkus = new Map();
      themedNights.forEach((_, i) => {
        nightSkus.set(skuOf("privateChef.themedNights.nights", i, "title"), i);
      });
      const restoredThemed = [];
      for (const line of mine) {
        const idx = nightSkus.get(line.sku);
        if (idx === undefined) continue;
        const n = parseInt(line.options?.guests, 10);
        restoredThemed.push({
          id: nextItemId(),
          nightIdx: idx,
          guests: Number.isFinite(n) ? Math.max(2, Math.min(15, n)) : 2,
          date: line.date ?? "",
        });
      }
      if (restoredThemed.length) setThemedItems(restoredThemed);
    }

    if (Array.isArray(pricingBar)) {
      pricingBar.forEach((_, i) => {
        if (bySku.has(skuOf("privateChef.pricing.bartender.items", i, "label"))) setBartenderIdx(i);
      });
    }

    if (Array.isArray(fridgeBeverages?.items)) {
      const restored = {};
      fridgeBeverages.items.forEach((_, i) => {
        const line = bySku.get(skuOf("fullFridge.beverages.items", i, "title"));
        if (line) restored[i] = line.qty;
      });
      if (Object.keys(restored).length) setBevQty(restored);
    }

    const restoredQty = {};
    for (const [group, path] of [["dessert", "privateChef.desserts.items"], ["bakery", "privateChef.bakery.items"]]) {
      const items = t(path);
      if (!Array.isArray(items)) continue;
      items.forEach((_, i) => {
        const line = bySku.get(`${group}-${skuOf(path, i, "title")}`);
        if (line) restoredQty[`dish-${group}-${i}`] = line.qty;
      });
    }
    if (Object.keys(restoredQty).length) setDishQty(restoredQty);

    const saved = serviceForms[SERVICE];
    if (saved?.notes) setNotes(saved.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, seedTrigger]);

  /*
   * Everything priced on this page: the chosen service, a themed night, beverages,
   * the bartender, and dessert/bakery quantities.
   *
   * Guest counts drive the price but are NOT folded into the title — they go in
   * `options` so the drawer caption and the sheet keep them as their own field.
   */
  const buildLines = () => {
    const out = [];

    if (Array.isArray(pricingPS)) {
      /* One cart line per booked occasion. `it.id` is the lineId variant so
       * same-service bookings (e.g. two Lunches) don't collide in the cart.
       *
       * `_dishes` encodes this day's dish picks as JSON. The underscore prefix
       * tells `describeLine` (format.js) to keep it out of the drawer caption;
       * the seed effect parses it back on an Edit from the cart. */
      for (const it of serviceItems) {
        const item = pricingPS[it.serviceIdx];
        if (!item) continue;
        const sku = skuOf("privateChef.pricing.perService.items", it.serviceIdx, "label");
        const dishesJson = Object.keys(it.dishes || {}).length
          ? JSON.stringify(it.dishes)
          : "";
        out.push({
          lineId: lineIdOf(SERVICE, sku, it.id),
          service: SERVICE,
          sku,
          title: item.label,
          qty: 1,
          unitPrice: computeServicePrice(item, it.guests),
          date: it.date,
          options: {
            guests: `${it.guests} guests`,
            ...(dishesJson ? { _dishes: dishesJson } : {}),
          },
        });
      }
    }

    /* One cart line per themed-night instance. `it.id` as the lineId variant
     * lets two Mexican Fiestas on different dates coexist in the cart. */
    if (Array.isArray(themedNights) && Array.isArray(themedTiers)) {
      for (const it of themedItems) {
        const night = themedNights[it.nightIdx];
        if (!night) continue;
        const tier = findThemedTier(themedTiers, it.guests);
        const sku = skuOf("privateChef.themedNights.nights", it.nightIdx, "title");
        out.push({
          lineId: lineIdOf(SERVICE, sku, it.id),
          service: SERVICE,
          sku,
          title: night.title,
          qty: 1,
          unitPrice: tier?.priceValue ?? 0,
          date: it.date,
          options: { guests: `${it.guests} guests` },
        });
      }
    }

    if (Array.isArray(fridgeBeverages?.items)) {
      fridgeBeverages.items.forEach((item, i) => {
        const qty = bevQty[i] || 0;
        if (!qty) return;
        const sku = skuOf("fullFridge.beverages.items", i, "title");
        out.push({
          lineId: lineIdOf(SERVICE, sku),
          service: SERVICE,
          sku,
          title: item.title,
          qty,
          unitPrice: item.priceValue,
          date: "",
          options: {},
        });
      });
    }

    if (bartenderIdx !== null && Array.isArray(pricingBar)) {
      const item = pricingBar[bartenderIdx];
      const sku = skuOf("privateChef.pricing.bartender.items", bartenderIdx, "label");
      out.push({
        lineId: lineIdOf(SERVICE, sku),
        service: SERVICE,
        sku,
        title: `Bartender — ${item.label}`,
        qty: 1,
        unitPrice: item.priceValue,
        date: "",
        options: {},
      });
    }

    /* Desserts and bakery share one flat per-item price. */
    for (const [group, path] of [["dessert", "privateChef.desserts.items"], ["bakery", "privateChef.bakery.items"]]) {
      const items = t(path);
      if (!Array.isArray(items)) continue;
      items.forEach((item, i) => {
        const qty = dishQty[`dish-${group}-${i}`] || 0;
        if (!qty) return;
        const sku = `${group}-${skuOf(path, i, "title")}`;
        out.push({
          lineId: lineIdOf(SERVICE, sku),
          service: SERVICE,
          sku,
          title: item.title,
          qty,
          unitPrice: DISH_PRICE,
          date: "",
          options: {},
        });
      });
    }

    return out;
  };

  const draftLines = buildLines();
  const draftTotal = draftLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

  /* Per-day dish picks, formatted as an object keyed by day header so
   * describeServiceForm renders each day on its own row — "Day 1 — Lunch":
   * "Gallo Pinto, Casado". For Full Day items each meal is prefixed so the
   * chef can tell apart the three menus of the same day. */
  const buildDishPicks = () => {
    const picks = {};
    serviceItems.forEach((it, idx) => {
      const service = Array.isArray(pricingPS) ? pricingPS[it.serviceIdx] : null;
      if (!service) return;
      const byMeal = {};
      for (const d of Object.values(it.dishes || {})) {
        if (!["breakfast", "lunch", "dinner"].includes(d.group)) continue;
        (byMeal[d.group] ??= []).push(d.label);
      }
      if (!Object.keys(byMeal).length) return;
      const multiMeal = (SERVICE_MEALS[it.serviceIdx] || []).length > 1;
      const mealsOrder = ["breakfast", "lunch", "dinner"];
      const parts = mealsOrder
        .filter((m) => byMeal[m]?.length)
        .map((m) => {
          const names = byMeal[m].join(", ");
          return multiMeal ? `${m.charAt(0).toUpperCase() + m.slice(1)}: ${names}` : names;
        });
      const dateSuffix = it.date ? ` (${it.date})` : "";
      const key = `Day ${idx + 1} — ${service.label}${dateSuffix}`;
      picks[key] = parts.join(" · ");
    });
    return picks;
  };

  /* SKUs that are qty-based add-ons. In add mode these use `addLine` so the
   * guest's existing beverages / desserts / bakery in the cart grow rather
   * than get overwritten. Per-day items, themed nights and bartender keep
   * `setLine` semantics (each either has a unique lineId that just appends, or
   * an idempotent one that should mirror the page's state). */
  const isQtyAddOn = (line) => {
    if (line.sku?.startsWith("dessert-") || line.sku?.startsWith("bakery-")) return true;
    /* Beverages — their skus come from fullFridge.beverages.items via skuOf. */
    const bevSkus = Array.isArray(fridgeBeverages?.items)
      ? fridgeBeverages.items.map((_, i) => skuOf("fullFridge.beverages.items", i, "title"))
      : [];
    return bevSkus.includes(line.sku);
  };

  const addToCart = (dietary) => {
    if (!draftLines.length) return;

    if (mode === "edit") {
      /* Edit mode: the page represents the full chef section; wipe the cart's
       * copy first so deselections actually disappear. */
      clearService(SERVICE);
      draftLines.forEach(setLine);
    } else {
      /* Add mode: concatenate. Per-day items have fresh unique ids so they
       * append as new lines; themed-night and bartender are idempotent
       * replacements for their own skus; qty add-ons SUM into existing lines
       * via `addLine`. */
      draftLines.forEach((line) => {
        if (isQtyAddOn(line)) addLine(line);
        else setLine(line);
      });
    }

    /* Service-form shape: dietary + notes + dish picks (keyed per day). In
     * edit mode we pass the full fresh object (clearService wiped the old
     * form). In add mode, setServiceForm MERGES top-level keys for us, but
     * the `dishes` key itself needs a manual merge so prior days don't get
     * lost. */
    const form = { ...dietary };
    const picks = buildDishPicks();
    if (Object.keys(picks).length) {
      if (mode === "add") {
        const existing = serviceForms[SERVICE]?.dishes;
        form.dishes = existing && typeof existing === "object"
          ? { ...existing, ...picks }
          : picks;
      } else {
        form.dishes = picks;
      }
    }
    if (notes.trim()) form.notes = notes.trim();
    if (Object.keys(form).length) setServiceForm(SERVICE, form);

    openCart();

    /* Clear the page and flip back to add mode so the next interaction
     * concatenates (whether the guest keeps adding days or walks away). */
    setServiceItems([]);
    setThemedItems([]);
    setBartenderIdx(null);
    setBevQty({});
    setDishQty({});
    setNotes("");
    setMode("add");
  };

  /* Preview rows shown on the page BEFORE commit — one block per day: the
   * service header, then any dish picks for that day. */
  const buildInfoLines = () => {
    const lines = [];
    serviceItems.forEach((it, idx) => {
      const service = Array.isArray(pricingPS) ? pricingPS[it.serviceIdx] : null;
      if (!service) return;
      const parts = [`${it.guests} guests`];
      if (it.date) parts.push(`date: ${it.date}`);
      lines.push({ label: `Day ${idx + 1} · ${service.label} — ${parts.join(" · ")}`, price: 0 });

      const byMeal = {};
      for (const d of Object.values(it.dishes || {})) {
        if (!["breakfast", "lunch", "dinner"].includes(d.group)) continue;
        (byMeal[d.group] ??= []).push(d.label);
      }
      const multiMeal = (SERVICE_MEALS[it.serviceIdx] || []).length > 1;
      for (const m of ["breakfast", "lunch", "dinner"]) {
        if (!byMeal[m]) continue;
        const prefix = multiMeal ? `${m.charAt(0).toUpperCase() + m.slice(1)}: ` : "";
        lines.push({ label: `  ${prefix}${byMeal[m].join(", ")}`, price: 0 });
      }
    });

    return lines;
  };

  return (
    <>
      <Navbar />
      <main className="pt-24">

        {/* Hero */}
        <div className="px-8 md:px-16 pt-8 pb-10">
          <div className="flex flex-col gap-1" data-aos="fade-up">
            <Link
              href="/"
              className="flex items-center gap-1.5 w-fit mb-3 text-sm font-sans font-medium text-[#222E2C]/50 hover:text-[#222E2C] transition-colors duration-200"
            >
              <TbArrowLeft size={16} />
              {t("common.back")}
            </Link>
            <div className="flex items-center gap-2 w-fit border border-[#222E2C]/20 rounded-full px-4 py-2 mb-3">
              <TbLeaf size={15} className="text-[#222E2C]" />
              <span className="font-sans text-sm text-[#222E2C]">{t("privateChef.pill")}</span>
            </div>
            <h1
              className="text-4xl md:text-5xl text-[#213B2F] tracking-tight leading-tight"
              style={{ fontFamily: "var(--font-alpina)" }}
            >
              {t("privateChef.title")}
            </h1>
            <p className="font-sans text-sm text-[#222E2C]/50 mt-2 max-w-md">{t("privateChef.subtitle")}</p>
            <a
              href={`https://wa.me/${WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#213B2F] font-sans font-medium text-sm text-[#D8DDB8] hover:bg-[#213B2F]/90 transition-colors duration-200 shrink-0 w-fit mt-6"
            >
              <TbBrandWhatsapp size={16} />
              {t("privateChef.whatsapp")}
            </a>
          </div>
        </div>

        <div className="flex flex-col pb-8">

          {/* 01 — Overview / Story */}
          <div id="overview" className="flex flex-col gap-8 scroll-mt-40 px-8 md:px-16 pt-2 pb-14 md:pb-20">

            {/* Story — photo + text */}
            <div className="bg-[#213B2F] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 lg:h-[440px]" data-aos="fade-up">
              <div className="flex flex-col justify-center gap-5 px-8 md:px-12 py-12 lg:py-0 order-2 lg:order-1">
                <TbLeaf size={22} className="text-[#D8DDB8]/60" />
                <h2 className="text-3xl md:text-4xl text-[#EDE5D8] tracking-tight leading-tight" style={{ fontFamily: "var(--font-alpina)" }}>
                  {t("privateChef.story.heading")}
                </h2>
                <div className="w-12 h-px bg-[#D8DDB8]/40" />
                <p className="font-sans text-sm text-[#D8DDB8]/65 leading-relaxed whitespace-pre-line max-w-md">
                  {t("privateChef.story.body")}
                </p>
              </div>
              <div className="h-56 lg:h-full order-1 lg:order-2 overflow-hidden">
                <img src={STORY_IMAGE} alt={t("privateChef.story.heading")} className="w-full h-full object-cover" />
              </div>
            </div>

            {/* How it works — steps */}
            <div className="flex flex-col gap-6" data-aos="fade-up">
              <div className="flex flex-col gap-2 max-w-xl">
                <h2 className="text-3xl md:text-4xl text-[#213B2F] tracking-tight leading-tight" style={{ fontFamily: "var(--font-alpina)" }}>
                  How to build your experience
                </h2>
                <p className="font-sans text-sm text-[#222E2C]/50 leading-relaxed">
                  Browse the menus, pick your dishes, and submit — your chef handles the rest.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {[
                  { Icon: TbHandClick,     step: "Pick a service",      body: "Choose between Breakfast, Lunch, Dinner, or a Full Day — then set your guest count." },
                  { Icon: TbListCheck,     step: "Browse the menus",    body: "Explore each meal and select the dishes you'd like the chef to prepare." },
                  { Icon: TbAdjustments,   step: "Add preferences",     body: "Let the chef know about dietary restrictions, allergies, or anything you'd rather avoid." },
                  { Icon: TbSend,          step: "Review & submit",     body: "Scroll to the order summary at the bottom, add any final notes for the chef, and submit — we'll confirm everything before your stay." },
                ].map(({ Icon, step, body }, i) => (
                  <div key={i} className="flex-1 flex flex-col gap-3 bg-white rounded-2xl px-5 py-5 border border-[#222E2C]/8">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-[#213B2F] flex items-center justify-center shrink-0">
                        <Icon size={15} className="text-[#D8DDB8]" />
                      </div>
                      <span className="font-sans text-xs font-semibold text-[#222E2C]/40 uppercase tracking-widest">Step {i + 1}</span>
                    </div>
                    <p className="font-sans text-base font-medium text-[#222E2C] leading-snug">{step}</p>
                    <p className="font-sans text-sm text-[#222E2C]/55 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* 02 — Menu Builder */}
          <div id="menu" className="flex flex-col gap-10 scroll-mt-40 border-t border-[#222E2C]/10 px-8 md:px-16 py-14 md:py-20">

            <div className="flex flex-col gap-8" data-aos="fade-up">

              {/* Heading */}
              <div className="flex flex-col gap-1.5">
                <p className="font-sans text-xs font-semibold text-[#222E2C]/50 uppercase tracking-widest">02 — Menu Builder</p>
                <h2 className="font-sans font-semibold text-2xl md:text-3xl text-[#222E2C] tracking-tight">
                  {ob.standardHeading}
                </h2>
              </div>

              {/* One card per DAY of chef service. Each is a self-contained
               * menu builder — service type, guests, date, dish picks. Empty
               * state: the add-day card appears on its own. */}
              <div className="flex flex-col gap-5">
                {serviceItems.map((it, idx) => {
                  const service = Array.isArray(pricingPS) ? pricingPS[it.serviceIdx] : null;
                  if (!service) return null;
                  const itemMeals = SERVICE_MEALS[it.serviceIdx] || [];
                  const itemActive = it.activeMeal && itemMeals.includes(it.activeMeal)
                    ? it.activeMeal
                    : itemMeals[0] ?? null;
                  const itemMaxDishes = (Number(it.guests) || 2) >= 5 ? 2 : 1;
                  const lineTotal = computeServicePrice(service, it.guests);

                  const mealsI18n = {
                    breakfast: { heading: t("privateChef.breakfast.heading"), items: breakfastItems, note: t("privateChef.breakfast.note"), extras: breakfastExtras, extrasHeading: t("privateChef.breakfast.extrasHeading") },
                    lunch:     { heading: t("privateChef.lunch.heading"),     items: lunchItems },
                    dinner:    { heading: t("privateChef.dinner.heading"),    items: dinnerItems },
                  };

                  return (
                    <div key={it.id} className="rounded-2xl border border-[#213B2F]/15 bg-white overflow-hidden flex flex-col">
                      {/* Day header — gold eyebrow + remove */}
                      <div className="flex items-center justify-between gap-4 px-6 py-4 bg-[#213B2F]/6 border-b border-[#213B2F]/10">
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span className="font-sans text-[10px] font-bold text-[#C9974F] uppercase tracking-widest shrink-0">
                            Day {idx + 1}
                          </span>
                          <span className="font-sans font-semibold text-sm text-[#213B2F] truncate">
                            {service.label}
                            {it.date && <span className="font-normal text-[#222E2C]/55"> · {it.date}</span>}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeServiceItem(it.id)}
                          aria-label={`Remove Day ${idx + 1}`}
                          className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full font-sans text-xs font-medium text-[#222E2C]/55 hover:text-red-700 hover:bg-red-700/8 transition-colors"
                        >
                          <TbTrash size={13} />
                          Remove day
                        </button>
                      </div>

                      {/* Service type picker — per item */}
                      <div className="px-6 py-5 border-b border-[#213B2F]/8 flex flex-col gap-3">
                        <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#222E2C]/45">
                          Service type
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {Array.isArray(pricingPS) && pricingPS.map((opt, i) => {
                            const active = it.serviceIdx === i;
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => changeItemService(it.id, i)}
                                aria-pressed={active}
                                className={`text-left rounded-xl px-4 py-3 flex flex-col gap-0.5 border-2 transition-colors duration-200 ${
                                  active
                                    ? "bg-[#213B2F] border-[#213B2F]"
                                    : "bg-white border-[#222E2C]/10 hover:border-[#222E2C]/30"
                                }`}
                              >
                                <span className={`font-sans font-semibold text-sm ${active ? "text-[#D8DDB8]" : "text-[#222E2C]"}`}>
                                  {opt.label}
                                </span>
                                <span className={`font-sans text-xs ${active ? "text-[#D8DDB8]/70" : "text-[#222E2C]/55"}`}>
                                  ${opt.basePrice} base
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Guests + date + total */}
                      <div className="px-6 py-5 border-b border-[#213B2F]/8 flex flex-wrap items-end gap-5">
                        <div className="flex flex-col gap-1.5">
                          <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#222E2C]/40">
                            {ob.guestsLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateServiceItem(it.id, { guests: Math.max(2, (it.guests || 2) - 1) })}
                              aria-label="Decrease guests"
                              className="size-9 flex items-center justify-center rounded-full border-2 border-[#213B2F]/25 text-[#213B2F] font-sans text-lg hover:bg-[#213B2F]/8 transition-colors select-none"
                            >−</button>
                            <div className="flex items-center justify-center px-4 py-2 rounded-full bg-[#213B2F] min-w-[3rem]">
                              <span className="font-sans font-bold text-base text-[#EDE5D8] tabular-nums">{it.guests}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateServiceItem(it.id, { guests: (it.guests || 2) + 1 })}
                              aria-label="Increase guests"
                              className="size-9 flex items-center justify-center rounded-full border-2 border-[#213B2F]/25 text-[#213B2F] font-sans text-lg hover:bg-[#213B2F]/8 transition-colors select-none"
                            >+</button>
                          </div>
                        </div>

                        <DateField
                          value={it.date}
                          onChange={(d) => updateServiceItem(it.id, { date: d })}
                          optional
                          tone="light"
                          className="min-w-[12rem]"
                        />

                        <div className="ml-auto flex flex-col items-end gap-0.5">
                          <span className="font-sans text-[10px] text-[#222E2C]/40 uppercase tracking-widest">Day total</span>
                          <span className="font-sans font-bold text-2xl tabular-nums" style={{ color: "#C9974F" }}>
                            ${lineTotal.toLocaleString("en-US")}
                          </span>
                        </div>
                      </div>

                      {/* Dish picker — per item; shows the meals this service covers */}
                      {itemMeals.length > 0 && (
                        <div className="px-6 py-6 flex flex-col gap-5">
                          {/* Limit banner */}
                          <div className={`rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                            itemMaxDishes === 2 ? "bg-[#213B2F]" : "bg-[#222E2C]/6 border border-[#222E2C]/12"
                          }`}>
                            <div className="flex-1">
                              {itemMaxDishes === 2 ? (
                                <>
                                  <p className="font-sans font-semibold text-sm text-[#D8DDB8]">With {it.guests} guests, choose up to 2 dishes per meal</p>
                                  <p className="font-sans text-xs text-[#D8DDB8]/70 mt-0.5">The chef will prepare both options for your group.</p>
                                </>
                              ) : (
                                <>
                                  <p className="font-sans font-semibold text-sm text-[#222E2C]">Choose 1 dish per meal</p>
                                  <p className="font-sans text-xs text-[#222E2C]/60 mt-0.5">Picking another automatically replaces the current one.</p>
                                </>
                              )}
                            </div>
                            <span className={`shrink-0 font-sans text-xs font-semibold px-3 py-1.5 rounded-full ${
                              itemMaxDishes === 2 ? "bg-[#D8DDB8]/15 text-[#D8DDB8]" : "bg-[#222E2C]/10 text-[#222E2C]"
                            }`}>
                              {itemMaxDishes === 2 ? "Up to 2 dishes" : "1 dish per meal"}
                            </span>
                          </div>

                          {/* Meal tabs — only shown for Full Day */}
                          {itemMeals.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                              {itemMeals.map((meal) => {
                                const Icon = MEAL_META[meal]?.icon;
                                const picked = Object.values(it.dishes || {}).filter((d) => d.group === meal).length;
                                const tabActive = itemActive === meal;
                                return (
                                  <button
                                    key={meal}
                                    type="button"
                                    aria-pressed={tabActive}
                                    onClick={() => setItemActiveMeal(it.id, meal)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-full border font-sans text-sm font-medium transition-colors duration-200 ${
                                      tabActive
                                        ? "bg-[#213B2F] border-[#213B2F] text-[#D8DDB8]"
                                        : "border-[#222E2C]/20 text-[#222E2C] hover:border-[#222E2C]/40"
                                    }`}
                                  >
                                    {Icon && <Icon size={14} />}
                                    {t(`privateChef.${meal}.heading`)}
                                    {picked > 0 && (
                                      <span className={`size-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
                                        tabActive ? "bg-[#D8DDB8]/20 text-[#D8DDB8]" : "bg-[#213B2F] text-[#D8DDB8]"
                                      }`}>{picked}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {itemActive && mealsI18n[itemActive] && (
                            <MenuSection
                              heading={mealsI18n[itemActive].heading}
                              items={Array.isArray(mealsI18n[itemActive].items) ? mealsI18n[itemActive].items : []}
                              note={mealsI18n[itemActive].note}
                              extras={Array.isArray(mealsI18n[itemActive].extras) ? mealsI18n[itemActive].extras : []}
                              extrasHeading={mealsI18n[itemActive].extrasHeading}
                              group={itemActive}
                              dishes={it.dishes || {}}
                              onToggle={(dishId, label, group) => toggleDishInItem(it.id, dishId, label, group)}
                              maxDishes={itemMaxDishes}
                              hideHeading={itemMeals.length > 1}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* "Add another day" card — always visible at the end. On first
                 * use (no items yet), it's the primary call-to-action. */}
                <button
                  type="button"
                  onClick={() => addServiceItem()}
                  className="rounded-2xl border-2 border-dashed border-[#213B2F]/30 bg-[#213B2F]/3 hover:bg-[#213B2F]/6 hover:border-[#213B2F]/55 transition-colors px-6 py-8 flex flex-col items-center justify-center gap-3 group"
                >
                  <span className="size-12 rounded-full bg-[#213B2F] text-[#D8DDB8] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <TbPlus size={20} />
                  </span>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-sans font-semibold text-base text-[#213B2F]">
                      {serviceItems.length === 0 ? "Start building your menu" : "Add a menu for another day"}
                    </span>
                    <span className="font-sans text-sm text-[#222E2C]/60">
                      {serviceItems.length === 0
                        ? "Pick a day and meal type. You can combine several across a long stay."
                        : `Great for long stays — each day has its own service, guest count and dish picks.`}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* 03 — Themed Nights */}
          <div id="themed-nights" className="flex flex-col gap-6 scroll-mt-40 border-t border-[#222E2C]/8 px-8 md:px-16 py-14 md:py-20" data-aos="fade-up">
            <Eyebrow num="03" label={nav.themedNights} />
            <div className="border-b border-[#222E2C]/15 pb-4">
              <p className="font-sans text-xs font-semibold text-[#222E2C]/40 uppercase tracking-widest mb-1">
                {t("privateChef.themedNights.subheading")}
              </p>
              <h2 className="font-sans font-semibold text-xl md:text-2xl text-[#222E2C] tracking-tight">
                {t("privateChef.themedNights.heading")}
              </h2>
              <p className="font-sans text-sm text-[#222E2C]/50 mt-2 max-w-2xl">
                {t("privateChef.themedNights.description")}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {Array.isArray(themedNights) && themedNights.map((night, i) => {
                const instancesOfThisNight = themedItems
                  .map((it, idx) => ({ ...it, _globalIdx: idx }))
                  .filter((it) => it.nightIdx === i);
                return (
                  <ThemedNightPanel
                    key={i}
                    night={night}
                    image={NIGHT_IMAGES[i]}
                    instances={instancesOfThisNight}
                    onAddInstance={() => addThemedItem(i)}
                    onUpdateInstance={updateThemedItem}
                    onRemoveInstance={removeThemedItem}
                    priceOf={(g) => findThemedTier(themedTiers, g)?.priceValue}
                  />
                );
              })}
            </div>

            {/* Beverage add-ons */}
            <div className="flex flex-col gap-4 pt-2">
              <div className="border-b border-[#222E2C]/15 pb-3">
                <h3 className="font-sans font-semibold text-base text-[#222E2C]">
                  {fridgeBeverages.heading}
                </h3>
                <p className="font-sans text-sm text-[#222E2C]/50 mt-0.5">{fridgeBeverages.subheading}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.isArray(fridgeBeverages.items) && fridgeBeverages.items.map((item, i) => {
                  const qty = bevQty[i] || 0;
                  const active = qty > 0;
                  return (
                    <div
                      key={i}
                      className={`rounded-2xl p-5 flex flex-col gap-4 border-2 transition-all duration-200 ${
                        active
                          ? "bg-[#213B2F] border-[#213B2F] shadow-md"
                          : "bg-white border-transparent shadow-sm hover:border-[#213B2F]/15"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className={`font-sans font-semibold text-sm ${active ? "text-[#D8DDB8]" : "text-[#222E2C]"}`}>{item.title}</p>
                          {item.description && (
                            <p className={`font-sans text-xs leading-snug ${active ? "text-[#D8DDB8]/60" : "text-[#222E2C]/55"}`}>{item.description}</p>
                          )}
                        </div>
                        <span className={`font-sans font-semibold text-sm whitespace-nowrap shrink-0 ${active ? "text-[#D8DDB8]" : "text-[#222E2C]"}`}>{item.price}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {active ? (
                          <div className="flex items-center rounded-xl overflow-hidden border border-white/15 bg-white/10 w-fit">
                            <button type="button" onClick={() => changeBevQty(i, qty - 1)}
                              className="w-9 h-9 flex items-center justify-center font-sans text-lg leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none">−</button>
                            <span className="w-8 text-center font-sans text-sm font-bold text-[#EDE5D8]">{qty}</span>
                            <button type="button" onClick={() => changeBevQty(i, qty + 1)}
                              className="w-9 h-9 flex items-center justify-center font-sans text-lg leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none">+</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => changeBevQty(i, 1)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#213B2F] text-[#D8DDB8] font-sans text-xs font-semibold hover:bg-[#213B2F]/85 transition-colors">
                            <TbPlus size={11} />
                            Add
                          </button>
                        )}
                        {active && (
                          <span className="font-sans text-sm font-semibold text-[#D8DDB8]">
                            ${(item.priceValue * qty).toLocaleString("en-US")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="font-sans text-xs text-[#222E2C]/45 italic">{fridgeBeverages.note}</p>
            </div>

            {/* Bartender add-on */}
            <div className="flex flex-col gap-4 pt-2 border-t border-[#222E2C]/8">
              <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 font-sans font-semibold text-base text-[#222E2C]">
                  <TbGlassCocktail size={17} className="text-[#222E2C]/45" />
                  {ob.bartenderHeading}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                <RadioPill label={ob.bartenderNone} selected={bartenderIdx === null} onClick={clearBartender} />
                {Array.isArray(pricingBar) && pricingBar.map((item, i) => (
                  <RadioPill
                    key={i}
                    label={`${item.label} · $${item.priceValue}`}
                    selected={bartenderIdx === i}
                    onClick={() => pickBartender(i)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 04 — Desserts + Bakery */}
          <div id="sweets" className="flex flex-col gap-6 scroll-mt-40 border-t border-[#222E2C]/8 px-8 md:px-16 py-14 md:py-20" data-aos="fade-up">
            <Eyebrow num="04" label={nav.sweets} />
            <div className="border-b border-[#222E2C]/15 pb-4">
              <p className="font-sans text-xs font-semibold text-[#222E2C]/40 uppercase tracking-widest mb-1">
                {sweets.kicker}
              </p>
              <h2 className="font-sans font-semibold text-xl md:text-2xl text-[#222E2C] tracking-tight">
                {sweets.heading}
              </h2>
              <p className="font-sans text-sm text-[#222E2C]/50 mt-2 max-w-2xl">{sweets.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
              <SimpleMenuSection
                heading={t("privateChef.desserts.heading")}
                subheading={t("privateChef.desserts.subheading")}
                items={Array.isArray(dessertsItems) ? dessertsItems : []}
                group="dessert"
                dishQty={dishQty}
                onQtyChange={changeDishQty}
              />
              <SimpleMenuSection
                heading={t("privateChef.bakery.heading")}
                subheading={t("privateChef.bakery.subheading")}
                items={Array.isArray(bakeryItems) ? bakeryItems : []}
                group="bakery"
                dishQty={dishQty}
                onQtyChange={changeDishQty}
              />
            </div>
          </div>

          {/* Quote */}
          <div className="flex flex-col items-center text-center gap-5 py-8 border-t border-[#222E2C]/8 px-8 md:px-16" data-aos="fade-up">
            <div className="w-10 h-px bg-[#222E2C]/25" />
            <blockquote className="text-2xl md:text-3xl text-[#213B2F]/80 leading-relaxed max-w-2xl italic" style={{ fontFamily: "var(--font-alpina)" }}>
              "Tell me what you eat, and I will tell you what you are."
            </blockquote>
            <p className="font-sans text-sm text-[#222E2C]/45">— Jean Anthelme Brillat-Savarin</p>
            <div className="w-10 h-px bg-[#222E2C]/25" />
          </div>

          {/* 05 — Review & Submit */}
          <div id="book" className="flex flex-col gap-6 scroll-mt-40 border-t border-[#222E2C]/8 bg-[#E0D4C4]/35 px-8 md:px-16 py-14 md:py-20">
            <Eyebrow num="05" label={nav.book} standalone />

            <ChefSummary
              lines={draftLines.map((l) => ({
                label: l.qty > 1 ? `${l.title} × ${l.qty}` : l.title,
                price: l.qty * l.unitPrice,
              }))}
              infoLines={buildInfoLines()}
              total={draftTotal}
              notes={notes}
              onNotesChange={setNotes}
              onAddToCart={addToCart}
              inCart={inCart}
              mode={mode}
            />
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}

function Eyebrow({ num, label, standalone = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-sans text-xs font-semibold text-[#222E2C]/35 tabular-nums">{num}</span>
      <span className="w-5 h-px bg-[#222E2C]/25" />
      {!standalone && (
        <span className="font-sans text-xs font-semibold text-[#222E2C]/50 uppercase tracking-widest">{label}</span>
      )}
    </div>
  );
}


function MenuSection({ heading, items, note, extras, extrasHeading, group, dishes, onToggle, maxDishes = 1, hideHeading = false }) {
  const selectedCount = Object.values(dishes).filter(d => d.group === group).length;

  return (
    <div className="flex flex-col gap-5" data-aos="fade-up">
      {!hideHeading && (
        <h2 className="font-sans font-semibold text-xl text-[#222E2C] tracking-tight">{heading}</h2>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-2.5">
        {Array.from({ length: maxDishes }).map((_, i) => (
          <div key={i} className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${i < selectedCount ? "bg-[#213B2F]" : "bg-[#222E2C]/15"}`} />
        ))}
        <span className="font-sans text-sm text-[#222E2C]/65 ml-1">
          {selectedCount === 0
            ? maxDishes === 1 ? "Pick a dish" : "Pick up to 2 dishes"
            : `${selectedCount} of ${maxDishes} selected`}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item, i) => {
          const id = `dish-${group}-${i}`;
          const selected = Boolean(dishes[id]);
          return (
            <button key={i} type="button" aria-pressed={selected} onClick={() => onToggle(id, item.title, group)}
              className={`text-left rounded-xl px-5 py-5 flex flex-col gap-2.5 border-2 transition-all duration-200 ${
                selected ? "bg-[#213B2F] border-[#213B2F]" : "bg-white border-[#222E2C]/10 hover:border-[#222E2C]/25"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                {item.tag && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    selected ? "bg-[#D8DDB8]/20 text-[#D8DDB8]" : "bg-[#213B2F]/10 text-[#213B2F]"
                  }`}>
                    🇨🇷 {item.tag}
                  </span>
                )}
                {selected && <TbCheck size={16} className="text-[#D8DDB8] shrink-0 ml-auto" />}
              </div>
              <h3 className={`font-sans font-semibold text-sm leading-snug ${selected ? "text-[#D8DDB8]" : "text-[#222E2C]"}`}>{item.title}</h3>
              <p className={`font-sans text-sm leading-relaxed ${selected ? "text-[#D8DDB8]/70" : "text-[#222E2C]/65"}`}>{item.description}</p>
            </button>
          );
        })}
      </div>

      {note && <p className="font-sans text-sm text-[#222E2C]/65">{note}</p>}

      {extras && extras.length > 0 && (
        <div className="flex flex-col gap-3 pt-2 border-t border-[#222E2C]/10">
          <p className="font-sans font-semibold text-sm text-[#222E2C]">{extrasHeading}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            {extras.map((extra, i) => {
              const id = `dish-${group}-extra-${i}`;
              const selected = Boolean(dishes[id]);
              return (
                <button key={i} type="button" aria-pressed={selected} onClick={() => onToggle(id, extra.title, group)}
                  className={`text-left border-2 rounded-xl px-4 py-4 flex flex-col gap-1.5 flex-1 transition-all duration-200 ${
                    selected ? "bg-[#213B2F] border-[#213B2F]" : "bg-white border-[#222E2C]/10 hover:border-[#222E2C]/25"
                  }`}
                >
                  <p className={`font-sans font-semibold text-sm ${selected ? "text-[#D8DDB8]" : "text-[#222E2C]"}`}>{extra.title}</p>
                  <p className={`font-sans text-sm leading-relaxed ${selected ? "text-[#D8DDB8]/70" : "text-[#222E2C]/65"}`}>{extra.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleMenuSection({ heading, subheading, items, group, dishQty, onQtyChange }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-b border-[#222E2C]/15 pb-3">
        <p className="font-sans text-xs font-semibold text-[#222E2C]/40 uppercase tracking-widest mb-1">
          {subheading}
        </p>
        <h2 className="font-sans font-semibold text-lg text-[#222E2C] tracking-tight">{heading}</h2>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((item, i) => {
          const id = `dish-${group}-${i}`;
          const qty = dishQty?.[id] || 0;
          const active = qty > 0;
          return (
            <div
              key={i}
              className={`rounded-2xl px-4 py-3.5 flex items-center justify-between gap-4 border-2 transition-all duration-200 ${
                active
                  ? "bg-[#213B2F] border-[#213B2F] shadow-md"
                  : "bg-white border-transparent shadow-sm hover:border-[#213B2F]/15"
              }`}
            >
              <div className="min-w-0">
                <h3 className={`font-sans font-semibold text-sm ${active ? "text-[#D8DDB8]" : "text-[#222E2C]"}`}>{item.title}</h3>
                <p className={`font-sans text-xs leading-relaxed mt-0.5 ${active ? "text-[#D8DDB8]/65" : "text-[#222E2C]/55"}`}>{item.description}</p>
              </div>
              <div className="shrink-0">
                {active ? (
                  <div className="flex items-center rounded-xl overflow-hidden border border-white/15 bg-white/10">
                    <button type="button" onClick={() => onQtyChange(id, qty - 1)}
                      className="w-8 h-8 flex items-center justify-center font-sans text-lg leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none">−</button>
                    <span className="w-7 text-center font-sans text-sm font-bold text-[#EDE5D8]">{qty}</span>
                    <button type="button" onClick={() => onQtyChange(id, qty + 1)}
                      className="w-8 h-8 flex items-center justify-center font-sans text-lg leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none">+</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => onQtyChange(id, 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#213B2F] text-[#D8DDB8] font-sans text-xs font-semibold hover:bg-[#213B2F]/85 transition-colors">
                    <TbPlus size={11} />
                    Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DarkField({ label, placeholder, value, onChange }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-sans text-xs font-medium text-[#D8DDB8]/55">{label}</span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 font-sans text-sm text-[#D8DDB8] placeholder:text-[#D8DDB8]/35 focus:outline-none focus:ring-2 focus:ring-[#D8DDB8]/30 focus:border-transparent transition-all duration-200"
      />
    </label>
  );
}

/*
 * End-of-page summary. The dietary form lives here rather than on the page because
 * nothing else needs it; on commit it is handed up as structured data and stored in
 * the cart's `serviceForms["private-chef"]`, not flattened into zero-price lines the
 * way the old version did.
 */
function ChefSummary({ lines, infoLines = [], total, notes, onNotesChange, onAddToCart, inCart, mode = "add" }) {
  const { t } = useI18n();
  const { serviceForms, editSignal, hydrated } = useCart();

  const df  = t("privateChef.dietaryForm");

  const [restrictionCounts, setRestrictionCounts] = useState({});
  const [restrictionOther, setRestrictionOther]   = useState("");
  const [allergies, setAllergies]                 = useState("");
  const [preferences, setPreferences]             = useState("");

  const changeRestrictionCount = (opt, count) => {
    const next = Math.max(0, count);
    setRestrictionCounts((prev) => {
      if (next === 0) { const n = { ...prev }; delete n[opt]; return n; }
      return { ...prev, [opt]: next };
    });
  };

  const resetDietary = () => {
    setRestrictionCounts({});
    setRestrictionOther("");
    setAllergies("");
    setPreferences("");
  };

  /* Re-sync dietary fields ONLY when the drawer's Edit link fires. A fresh
   * visit to /private-chef/ keeps the form empty even if the cart already
   * carries dietary info — matching the parent's seed-on-edit-only rule. */
  const seedTrigger = editSignal.service === SERVICE ? editSignal.token : null;
  const lastSeed = useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    if (seedTrigger === null) return;
    if (lastSeed.current === seedTrigger) return;
    lastSeed.current = seedTrigger;

    const saved = serviceForms[SERVICE];
    setRestrictionCounts(saved?.restrictions && typeof saved.restrictions === "object" ? saved.restrictions : {});
    setRestrictionOther(saved?.restrictionOther ?? "");
    setAllergies(saved?.allergies ?? "");
    setPreferences(saved?.preferences ?? "");
  }, [hydrated, seedTrigger, serviceForms]);

  const handleAddToCart = () => {
    const dietary = {};
    if (Object.keys(restrictionCounts).length) dietary.restrictions = restrictionCounts;
    if (restrictionOther.trim()) dietary.restrictionOther = restrictionOther.trim();
    if (allergies.trim())        dietary.allergies        = allergies.trim();
    if (preferences.trim())      dietary.preferences      = preferences.trim();
    onAddToCart(dietary);
    /* Clear the dietary form after the submit — the parent clears the rest of
     * the page state in its addToCart. */
    resetDietary();
  };

  return (
    <div className="flex flex-col gap-6" data-aos="fade-up">
      <div className="bg-[#213B2F] rounded-2xl px-6 md:px-10 py-8 flex flex-col gap-8">

        {/* Priced summary */}
        <div className="flex flex-col gap-3">
          <h3 className="font-sans font-semibold text-sm text-[#D8DDB8]">Order Summary</h3>
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D8DDB8]/25 px-4 py-5 text-center">
              <p className="font-sans text-sm italic text-[#D8DDB8]/45">No items selected yet — browse the sections above.</p>
            </div>
          ) : (
            <div className="rounded-xl bg-white/8 divide-y divide-[#D8DDB8]/10 overflow-hidden">
              {lines.map((line, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="font-sans text-sm text-[#D8DDB8]/85">{line.label}</span>
                  <span className="font-sans font-medium text-sm whitespace-nowrap text-[#D8DDB8] tabular-nums">
                    {money(line.price)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white/10">
                <span className="font-sans font-semibold text-sm text-[#D8DDB8]">Total</span>
                <span className="font-sans font-semibold text-base text-[#D8DDB8] tabular-nums">{money(total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Preferences & dish picks */}
        {infoLines.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="font-sans font-semibold text-sm text-[#D8DDB8]">Preferences & Details</h3>
            <div className="rounded-xl border border-[#D8DDB8]/15 px-4 py-3 flex flex-col gap-2">
              {infoLines.map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  <TbCheck size={14} className="shrink-0 mt-0.5 text-[#D8DDB8]/45" />
                  <span className="font-sans text-sm leading-relaxed text-[#D8DDB8]/75">{line.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dietary restrictions — inline */}
        <div className="flex flex-col gap-4 pt-2 border-t border-white/10">
          <div>
            <h3 className="font-sans font-semibold text-sm text-[#D8DDB8]">{df.heading}</h3>
            <p className="font-sans text-xs text-[#D8DDB8]/55 mt-1">{df.description}</p>
          </div>

          {/* Restriction option chips */}
          <div className="flex flex-col gap-2">
            <span className="font-sans text-xs font-semibold text-[#D8DDB8]/45 uppercase tracking-widest">{df.restrictionsLabel}</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Array.isArray(df.options) && df.options.map((opt) => {
                const count = restrictionCounts[opt] || 0;
                const active = count > 0;
                return (
                  <div key={opt} className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 border transition-all duration-200 ${active ? "bg-white/15 border-white/25" : "bg-white/6 border-white/10 hover:border-white/20"}`}>
                    <span className="font-sans text-sm text-[#D8DDB8]/85">{opt}</span>
                    {active ? (
                      <div className="flex items-center rounded-lg overflow-hidden border border-white/15 bg-white/10 shrink-0">
                        <button type="button" onClick={() => changeRestrictionCount(opt, count - 1)} className="w-7 h-7 flex items-center justify-center font-sans text-base leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none">−</button>
                        <span className="w-6 text-center font-sans text-xs font-bold text-[#EDE5D8]">{count}</span>
                        <button type="button" onClick={() => changeRestrictionCount(opt, count + 1)} className="w-7 h-7 flex items-center justify-center font-sans text-base leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none">+</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => changeRestrictionCount(opt, 1)} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-[#D8DDB8]/70 font-sans text-xs font-semibold hover:bg-white/15 transition-colors shrink-0">
                        <TbPlus size={10} />
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Other / allergies / preferences */}
          <DarkField label={df.otherLabel} placeholder={df.otherPlaceholder} value={restrictionOther} onChange={(e) => setRestrictionOther(e.target.value)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DarkField label={df.allergiesLabel}   placeholder={df.allergiesPlaceholder}   value={allergies}   onChange={(e) => setAllergies(e.target.value)} />
            <DarkField label={df.preferencesLabel} placeholder={df.preferencesPlaceholder} value={preferences} onChange={(e) => setPreferences(e.target.value)} />
          </div>
        </div>

        {/* Notes */}
        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-xs font-medium text-[#D8DDB8]/60">Notes for the chef</span>
          <div className="relative">
            <TbNotes size={16} className="absolute left-3.5 top-3.5 pointer-events-none text-[#D8DDB8]/35" />
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Anything else you'd like the chef to know..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/10 shadow-sm font-sans text-sm text-[#D8DDB8] placeholder:text-[#D8DDB8]/40 focus:outline-none focus:ring-2 focus:ring-[#D8DDB8]/40 focus:border-transparent transition-all duration-200 resize-none"
            />
          </div>
        </label>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={lines.length === 0}
          className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-sans font-medium text-sm shadow-sm hover:shadow transition-all duration-200 w-fit disabled:opacity-50 bg-[#D8DDB8] text-[#213B2F] hover:bg-[#D8DDB8]/90"
        >
          {mode === "edit" ? <TbCheck size={16} /> : <TbShoppingBag size={16} />}
          {mode === "edit" ? t("cart.update") : (inCart ? t("cart.addToOrder") : t("cart.addToCart"))}
        </button>

      </div>
    </div>
  );
}

function RadioPill({ label, selected, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-full border font-sans text-sm transition-colors duration-200 ${
        selected
          ? "bg-[#213B2F] border-[#213B2F] text-[#D8DDB8]"
          : "border-[#222E2C]/20 text-[#222E2C]/70 hover:border-[#222E2C]/40"
      }`}
    >
      <span className={`flex items-center justify-center size-3.5 rounded-full border shrink-0 ${selected ? "border-[#D8DDB8]" : "border-[#222E2C]/35"}`}>
        {selected && <span className="size-1.5 rounded-full bg-[#D8DDB8]" />}
      </span>
      {label}
    </button>
  );
}


// Order must match the themedNights array order in i18n
const NIGHT_IMAGES = [
  "/assets/Chef/taco.avif",
  "/assets/Chef/smokehouse.avif",
  "/assets/Chef/tico.avif",
  "/assets/Chef/vegan.avif",
  "/assets/Chef/ocean.avif",
  "/assets/Chef/pasta.avif",
  "/assets/Chef/sushi.avif",
  "/assets/Chef/pizza.avif",
];

function ThemedNightPanel({ night, image, instances = [], onAddInstance, onUpdateInstance, onRemoveInstance, priceOf }) {
  const selected = instances.length > 0;

  const clampGuests = (g) => Math.max(2, Math.min(15, g));

  // Extract the choice count for a menu section by scanning the includes summary
  const getChoiceCount = (sectionHeading) => {
    const key = sectionHeading.toLowerCase().replace(/s$/, "");
    const match = night.includes?.find((inc) => inc.toLowerCase().includes(key));
    const num = match?.match(/\d+/)?.[0];
    return num ? `Choose ${num}` : null;
  };

  return (
    <div className={`rounded-2xl overflow-hidden border transition-all duration-500 ${
      selected
        ? "border-[#213B2F] shadow-xl ring-2 ring-[#213B2F]/20"
        : "border-[#222E2C]/12 hover:border-[#213B2F]/30"
    }`}>

      {/* ── Collapsed row — slides out when selected ── */}
      <div className={`grid transition-all duration-500 ease-in-out ${selected ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
        <div className="overflow-hidden">
          <button
            type="button"
            onClick={onAddInstance}
            className="w-full flex items-stretch text-left bg-white hover:bg-[#213B2F]/4 transition-colors duration-200"
          >
            <div className="w-44 shrink-0 overflow-hidden">
              <img src={image} alt={night.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 px-6 py-5 flex flex-col justify-center gap-1 min-w-0">
              <h3 className="font-sans font-semibold text-base text-[#222E2C]">{night.title}</h3>
              <p className="font-sans text-sm text-[#222E2C]/55">{night.subtitle}</p>
              <p className="font-sans text-xs text-[#222E2C]/40 mt-0.5 truncate">{night.description}</p>
            </div>
            <div className="px-6 py-5 flex flex-col items-end justify-center gap-2 shrink-0">
              <span className="font-sans text-xs text-[#222E2C]/40">from $530</span>
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#213B2F]/20 text-[#213B2F] font-sans text-sm font-medium">
                <TbPlus size={13} />
                Add this night
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Expanded panel — slides in when selected ── */}
      <div className={`grid transition-all duration-500 ease-in-out ${selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className={`transition-opacity duration-300 ${selected ? "opacity-100 delay-200" : "opacity-0"}`}>

            {/* Photo header with gradient overlay — shows instance count badge */}
            <div className="relative h-72 overflow-hidden">
              <img src={image} alt={night.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#213B2F] via-[#213B2F]/40 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 px-8 py-6 flex items-end justify-between gap-4">
                <div>
                  <h3 className="font-sans font-bold text-2xl text-[#EDE5D8] leading-tight">{night.title}</h3>
                  <p className="font-sans text-sm text-[#D8DDB8]/70 mt-1">{night.subtitle}</p>
                </div>
                <span className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#D8DDB8] text-[#213B2F] font-sans text-sm font-bold shadow-lg">
                  <TbCheck size={15} />
                  {instances.length} {instances.length === 1 ? "night" : "nights"}
                </span>
              </div>
            </div>

            {/* Instances list — one row per occasion. Each has its own guests,
              * date, total and remove. Below them, "Add another date" adds a
              * new instance that inherits the last guest count. */}
            <div
              className="bg-[#213B2F] px-8 py-6 flex flex-col gap-4 border-t border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {instances.map((instance, instanceIdx) => {
                const instancePrice = priceOf?.(instance.guests);
                return (
                  <div
                    key={instance.id}
                    className="flex flex-wrap items-end gap-6 pb-4 border-b border-white/10 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-col gap-1.5">
                      <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#C9974F]">
                        Occasion {instanceIdx + 1}
                      </span>
                      <div className="flex items-center bg-white/12 rounded-xl overflow-hidden w-fit border border-white/10">
                        <button
                          type="button"
                          onClick={() => onUpdateInstance(instance.id, { guests: clampGuests(instance.guests - 1) })}
                          aria-label="Decrease guests"
                          className="size-10 flex items-center justify-center font-sans text-xl leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none"
                        >−</button>
                        <span className="w-10 text-center font-sans text-sm font-bold text-[#EDE5D8] tabular-nums">{instance.guests}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateInstance(instance.id, { guests: clampGuests(instance.guests + 1) })}
                          aria-label="Increase guests"
                          className="size-10 flex items-center justify-center font-sans text-xl leading-none text-[#D8DDB8]/70 hover:bg-white/10 transition-colors select-none"
                        >+</button>
                      </div>
                    </div>

                    <div
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <DateField
                        value={instance.date}
                        onChange={(d) => onUpdateInstance(instance.id, { date: d })}
                        optional
                        tone="dark"
                        className="min-w-[12rem]"
                      />
                    </div>

                    <div className="ml-auto flex items-end gap-4">
                      {instancePrice && (
                        <div className="flex flex-col gap-0.5 text-right">
                          <span className="font-sans text-[10px] text-[#D8DDB8]/50 uppercase tracking-widest">
                            Total · {instance.guests} guests
                          </span>
                          <span className="font-sans font-bold text-2xl text-[#EDE5D8] tabular-nums">
                            ${instancePrice.toLocaleString("en-US")}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveInstance(instance.id)}
                        aria-label={`Remove occasion ${instanceIdx + 1}`}
                        className="size-10 rounded-full flex items-center justify-center text-[#D8DDB8]/50 hover:text-red-300 hover:bg-red-400/10 transition-colors shrink-0"
                      >
                        <TbTrash size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={onAddInstance}
                className="w-fit inline-flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-[#D8DDB8]/40 text-[#D8DDB8] hover:bg-white/10 hover:border-[#D8DDB8]/70 transition-colors font-sans text-sm font-semibold"
              >
                <TbPlus size={14} />
                Add another date for this night
              </button>
            </div>

            {/* Menu content */}
            <div className="bg-[#EDE5D8] px-8 py-8">
              {night.menu ? (
                /* Nights with selectable menus: show sections + "Choose N" badge */
                <div className="flex flex-col gap-8">
                  <p className="font-sans text-xs font-semibold uppercase tracking-widest text-[#213B2F]/50">
                    Menu — select your preferences below and mention them in the notes
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {night.menu.map((section, si) => {
                      const choiceLabel = getChoiceCount(section.heading);
                      return (
                        <div key={si} className="flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-3 pb-3 border-b-2 border-[#213B2F]/15">
                            <span className="font-sans font-bold text-sm text-[#213B2F] uppercase tracking-wider">
                              {section.heading}
                            </span>
                            {choiceLabel && (
                              <span className="font-sans text-xs font-bold px-3 py-1.5 rounded-full bg-[#213B2F] text-[#D8DDB8] shrink-0">
                                {choiceLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {section.items.map((item, ii) => (
                              <div key={ii} className="flex items-start gap-2">
                                <TbCircleCheck size={12} className="text-[#213B2F]/35 shrink-0 mt-0.5" />
                                <span className="font-sans text-xs text-[#222E2C]/70 leading-snug">{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* All-inclusive nights: just show what's included */
                <div className="flex flex-col gap-4">
                  <p className="font-sans text-xs font-semibold uppercase tracking-widest text-[#213B2F]/50 pb-3 border-b-2 border-[#213B2F]/15">
                    Everything included
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-8">
                    {night.includes.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <TbCircleCheck size={13} className="text-[#213B2F]/40 shrink-0 mt-0.5" />
                        <span className="font-sans text-sm text-[#222E2C]/70">{item}</span>
                      </div>
                    ))}
                  </div>
                  {night.dessert && (
                    <div className="pt-4 border-t border-[#213B2F]/12 flex items-center gap-2">
                      <span className="font-sans font-semibold text-sm text-[#222E2C]">Dessert:</span>
                      <span className="font-sans text-sm text-[#222E2C]/65">{night.dessert}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}
