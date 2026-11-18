"use client";

import { useState, useEffect } from "react";
import {
  TbUsers, TbCirclePlus, TbCircleCheck, TbPhoto, TbTrash,
  TbMessageCircle, TbTag, TbBriefcase, TbEngine,
} from "react-icons/tb";
import { useCart } from "@/app/context/CartContext";
import { useI18n } from "@/app/context/I18nContext";
import { lineIdOf } from "@/lib/sku";
import { money } from "@/lib/format";
import QtyStepper from "@/components/ui/QtyStepper";
import DateField from "@/components/ui/DateField";

/*
 * Pricing model (as of nov 2026):
 * - `sidebyside` carries a real `dailyRate` — the only vehicle with a visible,
 *   deterministic price (it is Arborea-owned, not fleet-rented).
 * - Every other vehicle is by-quote. We book through a preferred-partner
 *   agreement with Alamo / Enterprise / National so the final rate depends on
 *   season, availability, and inventory — it can't be fixed in the UI.
 *
 * Specs (seats / luggage / engine) match the partner fleet sheet. See the
 * nov 2026 SUV 4X4 + Luxury 4X4 + Pickup 4X4 category sheets.
 */
const VEHICLES = [
  {
    id: "sidebyside",
    name: "Yamaha Side-by-Side 700",
    type: "Off-road · Automatic",
    seats: 5,
    engine: "700cc",
    /* No luggage field — a UTV doesn't really carry suitcases. */
    idealFor: "Couples or small groups who want to explore Arborea's trails, viewpoints, and jungle paths — without leaving the property.",
    badge: "Arborea exclusive",
    image: "/assets/transporte/sidebyside.avif",
    dailyRate: 200,
  },
  {
    id: "rav4",
    name: "Toyota RAV4",
    type: "Standard 4x4 SUV · Automatic",
    seats: 5,
    luggage: 2,
    engine: "2400cc",
    idealFor: "Families of 4–5 planning day trips to waterfalls, beaches, or nearby towns — comfortable, reliable, and easy to drive.",
    image: "/assets/transporte/rav4.avif",
  },
  {
    id: "jimny",
    name: "Suzuki Jimny",
    type: "Compact 4x4 All-Terrain · Manual",
    seats: 4,
    luggage: 2,
    engine: "1500cc",
    idealFor: "Couples or duos who enjoy a mix of on-property time and adventurous back-road driving. Agile in tight jungle tracks.",
    image: "/assets/transporte/jimny.avif",
  },
  {
    id: "fortuner",
    name: "Toyota Fortuner",
    type: "Full-size 4x4 SUV · Automatic",
    seats: 7,
    luggage: 3,
    engine: "2800cc",
    idealFor: "Larger groups mixing comfortable highway driving with national-park access and gravel back roads — true 7-seat capacity with cargo room.",
    image: "/assets/transporte/fortuner.avif",
  },
  {
    id: "hilux",
    name: "Toyota Hilux",
    type: "Fullsize Pickup 4x4 · Automatic",
    seats: 5,
    luggage: 4,
    engine: "2400cc",
    idealFor: "Fishing, surf trips, or any plan involving gear, boards, or bulky luggage. Rugged and proven on the most demanding Osa routes.",
    image: "/assets/transporte/hilux.avif",
  },
  {
    id: "everest",
    name: "Ford Everest",
    type: "Premium 4x4 SUV · Automatic",
    seats: 7,
    luggage: 3,
    engine: "2800cc",
    idealFor: "Families needing three full rows plus confident off-road capability for Corcovado, Drake Bay, and beach approaches.",
    image: "/assets/transporte/everest.avif",
  },
  {
    id: "bronco",
    name: "Ford Bronco",
    type: "Sport All-Terrain 4x4 · Automatic",
    seats: 5,
    luggage: 2,
    engine: "1500cc",
    idealFor: "Adventure-forward couples or groups of four who want serious off-road capability with a distinctive look for the trip.",
    image: "/assets/transporte/bronco.avif",
  },
];

const initConfigs = Object.fromEntries(VEHICLES.map((v) => [v.id, { days: 1, date: "" }]));

function VehicleCard({ vehicle, days, date, cartLine, onDaysChange, onDateChange, onCommit, onRemove, featured = false }) {
  const { t } = useI18n();
  const isPriced = typeof vehicle.dailyRate === "number" && vehicle.dailyRate > 0;
  const total = isPriced ? days * vehicle.dailyRate : 0;

  /* Days live in the cart line as the "N days" option string (not derived from
   * price) — works for both priced and by-quote vehicles. Priced vehicles also
   * re-check unitPrice so a day change on a priced vehicle still trips `dirty`. */
  const committedDays = cartLine
    ? Number(String(cartLine.options?.days ?? "").match(/^(\d+)/)?.[1]) || 1
    : null;

  const dirty = cartLine
    ? committedDays !== days
        || cartLine.date !== date
        || (isPriced && cartLine.unitPrice !== total)
    : true;

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all duration-300 h-full bg-[#213B2F] ${
        featured ? "flex flex-col lg:flex-row" : "flex flex-col"
      } ${
        cartLine
          ? "ring-2 ring-[#D8DDB8]/50 shadow-lg"
          : "ring-1 ring-white/10 hover:ring-white/20 hover:shadow-md"
      }`}
    >
      {/* Photo */}
      <div
        className={`shrink-0 overflow-hidden bg-[#1a2e24] flex items-center justify-center relative ${
          featured ? "h-64 lg:h-auto lg:w-2/5" : "h-52"
        }`}
      >
        {vehicle.image ? (
          <img
            src={vehicle.image}
            alt={vehicle.name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <TbPhoto size={28} className="text-[#D8DDB8]/30" />
        )}
        {vehicle.badge && (
          <span className="absolute top-3 left-3 bg-[#C9974F] text-[#222E2C] font-sans text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest shadow-md">
            {vehicle.badge}
          </span>
        )}
      </div>

      {/* Right side (when featured) wraps info + booking so the two halves are
       * side-by-side on wide viewports. Otherwise behaves exactly like a regular
       * stacked card. */}
      <div className={featured ? "flex flex-col flex-1 lg:border-l lg:border-white/10" : "flex flex-col flex-1"}>

      {/* Info */}
      <div className={`flex flex-col gap-4 flex-1 ${featured ? "px-6 pt-6 pb-5" : "px-5 pt-5 pb-4"}`}>

        {/* Name + type */}
        <div className="flex flex-col gap-0.5">
          <h3 className={`font-sans font-semibold text-white leading-snug ${featured ? "text-xl md:text-2xl" : "text-base"}`}>{vehicle.name}</h3>
          <p className={`font-sans text-[#D8DDB8]/60 ${featured ? "text-sm" : "text-xs"}`}>{vehicle.type}</p>
        </div>

        {/* Specs chips — each metric has its own accent from the palette so the
         * eye recognises the type at a glance: sage = who fits, sand = what
         * fits, gold = how it performs. */}
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-[#D8DDB8]/15 border border-[#D8DDB8]/30">
            <TbUsers size={12} className="text-[#D8DDB8] shrink-0" />
            <span className="font-sans text-xs font-semibold text-[#D8DDB8]">
              {vehicle.seats} {vehicle.seats === 1 ? "seat" : "seats"}
            </span>
          </span>
          {typeof vehicle.luggage === "number" && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-[#E0D4C4]/15 border border-[#E0D4C4]/30">
              <TbBriefcase size={12} className="text-[#E0D4C4] shrink-0" />
              <span className="font-sans text-xs font-semibold text-[#E0D4C4]">
                {vehicle.luggage} {vehicle.luggage === 1 ? "bag" : "bags"}
              </span>
            </span>
          )}
          {vehicle.engine && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-[#C9974F]/15 border border-[#C9974F]/40">
              <TbEngine size={12} className="text-[#C9974F] shrink-0" />
              <span className="font-sans text-xs font-semibold text-[#C9974F]">
                {vehicle.engine}
              </span>
            </span>
          )}
        </div>

        {/* Ideal for — gold accent eyebrow + sand-tinted container to stand out
         * as the editorial note within the forest-green card. */}
        <div className="bg-[#C9974F]/10 border border-[#C9974F]/20 rounded-xl px-3.5 py-3 flex flex-col gap-1">
          <p className="font-sans text-[10px] font-bold text-[#C9974F] uppercase tracking-widest">Ideal for</p>
          <p className={`font-sans text-[#EDE5D8]/85 leading-relaxed ${featured ? "text-sm" : "text-xs"}`}>{vehicle.idealFor}</p>
        </div>
      </div>

      {/* Booking controls */}
      <div className={`flex flex-col gap-4 border-t border-white/10 bg-black/15 ${featured ? "px-6 pt-5 pb-6" : "px-5 pt-4 pb-5"}`}>

        {/* Days + Date side by side */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 shrink-0">
            <label className="font-sans text-[10px] font-semibold text-[#D8DDB8]/50 uppercase tracking-wide">
              {t("cart.days")}
            </label>
            <QtyStepper value={days} onChange={onDaysChange} min={1} size="md" tone="dark" label={t("cart.days")} />
          </div>
          <div className="flex-1 min-w-0">
            <DateField value={date} onChange={onDateChange} label={t("cart.pickupDate")} tone="dark" />
          </div>
        </div>

        {/* Price / Quote + CTA.
         *
         * Priced vehicles: the total gets the gold accent since it's the single
         * most scannable fact on the card. Daily rate sits above in muted bone.
         *
         * By-quote vehicles: sand-tinted pill (not sage) so they visually
         * differentiate from the priced sidebyside at a glance. */}
        <div className="flex items-end justify-between gap-3">
          {isPriced ? (
            <div className="flex flex-col gap-0 leading-tight">
              <p className="font-sans text-[10px] text-[#D8DDB8]/55 uppercase tracking-widest">
                {money(vehicle.dailyRate)} / day
              </p>
              <p className="font-sans font-bold text-2xl tabular-nums text-[#C9974F]">
                {money(total)}
              </p>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-[#E0D4C4]/15 border border-[#E0D4C4]/30 rounded-full px-3 py-1.5">
              <TbMessageCircle size={13} className="text-[#E0D4C4] shrink-0" />
              <span className="font-sans text-xs font-bold text-[#E0D4C4] uppercase tracking-wide">
                By quote
              </span>
            </span>
          )}

          <div className="flex items-center gap-1.5">
            {cartLine && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`${t("cart.remove")} — ${vehicle.name}`}
                className="size-9 rounded-full flex items-center justify-center text-[#D8DDB8]/50 hover:text-red-300 hover:bg-red-400/10 transition-colors"
              >
                <TbTrash size={15} />
              </button>
            )}

            {dirty ? (
              <button
                type="button"
                onClick={onCommit}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 font-sans text-sm font-semibold transition-all duration-200 whitespace-nowrap bg-[#D8DDB8] text-[#213B2F] hover:bg-[#C9974F] hover:text-[#222E2C] shadow-sm"
              >
                <TbCirclePlus size={15} />
                {cartLine
                  ? t("cart.update")
                  : isPriced ? t("cart.addToCart") : "Request quote"}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 font-sans text-sm font-semibold whitespace-nowrap bg-[#D8DDB8]/15 ring-1 ring-[#D8DDB8]/35 text-[#D8DDB8]">
                <TbCircleCheck size={15} className="text-[#C9974F]" />
                {t("cart.inOrder")}
              </span>
            )}
          </div>
        </div>
      </div>

      </div>
    </div>
  );
}

/* ── partnership banner ──────────────────────────────────────────── */

const PARTNER_BRANDS = ["Alamo", "Enterprise", "National Rent a Car"];

function PartnershipBanner() {
  return (
    <div
      className="rounded-2xl overflow-hidden px-6 md:px-10 py-8 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10"
      style={{ backgroundColor: "#8B5A3C" }}
      data-aos="fade-up"
    >
      <div className="flex items-start gap-4 flex-1">
        <span className="size-11 shrink-0 rounded-xl bg-[#C9974F]/25 border border-[#C9974F]/40 flex items-center justify-center">
          <TbTag size={20} className="text-[#C9974F]" />
        </span>
        <div className="flex flex-col gap-2">
          <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#C9974F]">
            Preferred partner rates
          </p>
          <h3
            className="text-xl md:text-2xl text-[#EDE5D8] tracking-tight leading-snug"
            style={{ fontFamily: "var(--font-alpina)" }}
          >
            Better rates than booking the rental brands directly
          </h3>
          <p className="font-sans text-sm text-[#D8DDB8]/75 leading-relaxed max-w-2xl">
            We work with three of Costa Rica&apos;s largest rental brands — all under
            the same parent company. Thanks to our commercial agreement with them,
            we&apos;re able to offer our guests preferential rates that aren&apos;t
            available when booking directly.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0 lg:justify-end">
        {PARTNER_BRANDS.map((brand) => (
          <span
            key={brand}
            className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-[#EDE5D8]/10 border border-[#C9974F]/35 font-sans text-xs font-semibold text-[#EDE5D8] whitespace-nowrap"
          >
            {brand}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── section ────────────────────────────────────────────────────── */

export default function MulaRentalSection() {
  const { getLine, setLine, removeLine, openCart, hydrated } = useCart();
  const [configs, setConfigs] = useState(initConfigs);

  /*
   * Restore each card's day count and pickup date from the cart once hydration
   * finishes, so coming back to the home page doesn't show "1 day" for a vehicle
   * already booked for five. Day count is parsed from `options.days` — works
   * identically for priced and by-quote lines (we no longer back-derive from
   * unitPrice / dailyRate, which would break for quote-only vehicles).
   */
  useEffect(() => {
    if (!hydrated) return;
    setConfigs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const vehicle of VEHICLES) {
        const line = getLine(lineIdOf("transport", vehicle.id));
        if (!line) continue;
        const match = String(line.options?.days ?? "").match(/^(\d+)/);
        const days = Math.max(1, Number(match?.[1]) || 1);
        if (next[vehicle.id].days !== days || next[vehicle.id].date !== line.date) {
          next[vehicle.id] = { days, date: line.date };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hydrated]);

  const updateDays = (id, val) =>
    setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], days: val } }));

  const updateDate = (id, val) =>
    setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], date: val } }));

  /*
   * qty is the number of VEHICLES, not days — so the drawer's stepper reads as
   * "two of this vehicle" rather than silently changing the rental length. The
   * day count rides in `options.days` as a string ("3 days") because
   * describeLine() joins option values and hides the keys; a bare number would
   * render as "3" on its own in the cart caption.
   *
   * Priced vehicles (currently just the Side-by-Side) commit a real unitPrice.
   * Everything else is by-quote (unitPrice 0) and the drawer surfaces "By quote"
   * in place of a price.
   */
  const commit = (vehicle) => {
    const { days, date } = configs[vehicle.id];
    const isPriced = typeof vehicle.dailyRate === "number" && vehicle.dailyRate > 0;
    setLine({
      lineId: lineIdOf("transport", vehicle.id),
      service: "transport",
      sku: vehicle.id,
      title: vehicle.name,
      qty: 1,
      unitPrice: isPriced ? days * vehicle.dailyRate : 0,
      date,
      options: { days: `${days} ${days === 1 ? "day" : "days"}` },
    });
    openCart();
  };

  return (
    <section id="transport" className="flex flex-col px-8 md:px-16 pb-24 gap-10 scroll-mt-24">

      {/* Header */}
      <div className="flex flex-col gap-3" data-aos="fade-up">
        <h2
          className="text-4xl md:text-5xl text-[#222E2C] tracking-tight leading-tight"
          style={{ fontFamily: "var(--font-alpina)" }}
        >
          Transportation
        </h2>
      </div>

      {/* Partnership banner */}
      <PartnershipBanner />

      {/* Vehicle grid. No section summary or submit here by design — vehicles go
          straight into the cart, and the drawer is the only place they're reviewed.
          Featured (Side-by-Side) gets its own full-width row with a horizontal
          layout; the six fleet vehicles then tile 3 across below it. */}
      {(() => {
        const featuredVehicle = VEHICLES.find((v) => v.id === "sidebyside");
        const restVehicles = VEHICLES.filter((v) => v.id !== "sidebyside");

        const cardProps = (vehicle) => ({
          vehicle,
          days: configs[vehicle.id].days,
          date: configs[vehicle.id].date,
          cartLine: getLine(lineIdOf("transport", vehicle.id)),
          onDaysChange: (val) => updateDays(vehicle.id, val),
          onDateChange: (val) => updateDate(vehicle.id, val),
          onCommit: () => commit(vehicle),
          onRemove: () => removeLine(lineIdOf("transport", vehicle.id)),
        });

        return (
          <div className="flex flex-col gap-4">
            {featuredVehicle && (
              <VehicleCard {...cardProps(featuredVehicle)} featured />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {restVehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} {...cardProps(vehicle)} />
              ))}
            </div>
          </div>
        );
      })()}

    </section>
  );
}
