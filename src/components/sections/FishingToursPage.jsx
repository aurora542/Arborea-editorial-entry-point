"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/app/context/I18nContext";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/Footer";
import { useDraft, useSeedDraftFromCart } from "@/hooks/useDraft";
import { useCart } from "@/app/context/CartContext";
import { skuOf, titleOf, lineIdOf } from "@/lib/sku";
import { money, formatDateLabel, countLabel } from "@/lib/format";
import DateField from "@/components/ui/DateField";
import {
  TbArrowLeft, TbAnchor, TbBrandWhatsapp, TbCircleCheck, TbCheck,
  TbFish, TbHandClick, TbAdjustments, TbCirclePlus, TbSend,
  TbClock, TbMapPin, TbNotes, TbShoppingBag,
  TbUsersGroup, TbInfoCircle,
} from "react-icons/tb";

const WHATSAPP = "50685011042";
const FISHING_COLOR = "#6B5A2E";
const STORY_IMAGE = "/assets/InHouseServices/fishingTours.avif";
const SERVICE = "fishing-tours";

/* Order must match the anglers/family item arrays in i18n. */
const ANGLER_IMAGES = [
  "/assets/bote/Bote572.avif",  // Elite Offshore
  "/assets/bote/Bote525.avif",  // Caño Island
  "/assets/bote/Bote507.avif",  // Half-day Inshore
  "/assets/bote/Bote487.avif",  // Sierpe River
];

const FAMILY_IMAGES = [
  "/assets/bote/Bote561.avif",  // Whales / Fishing / Beach
  "/assets/bote/Bote548.avif",  // Wild Dolphins
  "/assets/bote/Bote475.avif",  // Mangrove Wildlife
];

/* Compact per-person label: $128.50 but $150 when whole. */
function perPersonLabel(value) {
  const n = Number(value) || 0;
  const hasCents = Math.abs(n - Math.round(n)) > 0.009;
  return hasCents
    ? `$${n.toFixed(2)}`
    : `$${Math.round(n).toLocaleString("en-US")}`;
}

/* ── tour card ─────────────────────────────────────────────── */

/*
 * Collapsed/expanded card modelled on PrivateChefPage's ThemedNightPanel. A tour
 * is "selected" (= expanded) when a tier lives in the draft; clicking the row
 * auto-selects the smallest-guest tier, clicking the photo header deselects.
 * Tier chips in the dark controls bar swap tiers in place.
 */
function TourCard({ tour, image, groupId, draft, labels }) {
  const entry = draft.get(groupId);
  const selectedTier = entry?.tier;
  const date = entry?.date ?? "";
  const selected = Boolean(selectedTier);

  const tiers = Array.isArray(tour.tiers) ? tour.tiers : [];
  const fromTotal = tiers.length ? Math.min(...tiers.map((tr) => tr.total)) : 0;

  const pickTier = (tier) => {
    draft.replace(groupId, {
      qty: 1,
      date,
      tier,
      unitPrice: tier.total,
    });
  };

  /* Al expandir la tarjeta se preselecciona el tier de 4 personas, no el primero.
   *
   * Antes `tiers[0]` ERA el de 4, porque era el grupo más pequeño que se ofrecía.
   * Al añadir la opción de 2 personas —que cuesta lo mismo que la de 4— el primero
   * pasó a ser ese, y el precio por persona que vería el huésped de entrada saltaba
   * al doble ($650 en vez de $325) sin que nadie hubiera pedido ese cambio de
   * presentación. Se fija por `guests`, no por índice, para que insertar o
   * reordenar tiers no vuelva a moverlo. */
  const toggleCard = () => {
    if (selected) {
      draft.remove(groupId);
    } else if (tiers.length) {
      pickTier(tiers.find((tr) => tr.guests === 4) ?? tiers[0]);
    }
  };

  const changeDate = (newDate) => {
    if (!entry) return;
    draft.set(groupId, { date: newDate });
  };

  return (
    <div
      className={`rounded-2xl overflow-hidden border transition-all duration-500 ${
        selected
          ? "border-[#6B5A2E] shadow-xl ring-2 ring-[#6B5A2E]/20"
          : "border-[#222E2C]/12 hover:border-[#6B5A2E]/40"
      }`}
    >
      {/* ── Collapsed row — slides out when selected ── */}
      <div className={`grid transition-all duration-500 ease-in-out ${selected ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
        <div className="overflow-hidden">
          <button
            type="button"
            onClick={toggleCard}
            className="w-full flex items-stretch text-left bg-white hover:bg-[#6B5A2E]/5 transition-colors duration-200"
          >
            <div className="w-36 sm:w-44 shrink-0 overflow-hidden bg-[#D8CEBC]">
              {image && (
                <img src={image} alt={tour.name} className="w-full h-full object-cover" loading="lazy" />
              )}
            </div>
            <div className="flex-1 px-5 md:px-6 py-5 flex flex-col justify-center gap-1 min-w-0">
              <h3 className="font-sans font-semibold text-base text-[#222E2C] leading-tight">{tour.name}</h3>
              {tour.tagline && (
                <p className="font-sans text-sm text-[#222E2C]/55 leading-snug">{tour.tagline}</p>
              )}
              {tour.species && (
                <p
                  className="font-sans text-xs font-semibold mt-1 line-clamp-2 sm:line-clamp-1"
                  style={{ color: FISHING_COLOR }}
                >
                  {tour.species}
                </p>
              )}
            </div>
            <div className="px-5 md:px-6 py-5 flex flex-col items-end justify-center gap-2 shrink-0">
              {fromTotal > 0 && (
                <span className="font-sans text-xs text-[#222E2C]/40 whitespace-nowrap">
                  {labels.from} {money(fromTotal)}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#6B5A2E]/30 font-sans text-sm font-medium whitespace-nowrap" style={{ color: FISHING_COLOR }}>
                {labels.selectTour}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Expanded panel — slides in when selected ── */}
      <div className={`grid transition-all duration-500 ease-in-out ${selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className={`transition-opacity duration-300 ${selected ? "opacity-100 delay-200" : "opacity-0"}`}>

            {/* Photo header — click to deselect */}
            <div
              className="relative h-72 overflow-hidden cursor-pointer"
              onClick={toggleCard}
            >
              {image && (
                <img src={image} alt={tour.name} className="w-full h-full object-cover" loading="lazy" />
              )}
              <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${FISHING_COLOR} 0%, ${FISHING_COLOR}66 50%, transparent 100%)` }} />
              <div className="absolute bottom-0 left-0 right-0 px-6 md:px-8 py-6 flex items-end justify-between gap-4">
                <div>
                  <h3 className="font-sans font-bold text-2xl md:text-3xl text-[#EDE5D8] leading-tight">{tour.name}</h3>
                  {tour.tagline && (
                    <p className="font-sans text-sm text-[#D8DDB8]/80 mt-1">{tour.tagline}</p>
                  )}
                </div>
                <span className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#D8DDB8] font-sans text-sm font-bold shadow-lg" style={{ color: FISHING_COLOR }}>
                  <TbCheck size={15} />
                  {labels.selected}
                </span>
              </div>
            </div>

            {/* Controls bar: tier picker + date + total */}
            <div
              className="px-6 md:px-8 py-6 border-t border-white/10 flex flex-col gap-5"
              style={{ backgroundColor: FISHING_COLOR }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2">
                <span className="font-sans text-xs font-semibold uppercase tracking-widest text-[#D8DDB8]/55">
                  {labels.pickGroup}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {tiers.map((tier) => {
                    const active = selectedTier?.guests === tier.guests;
                    return (
                      <button
                        key={tier.guests}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => pickTier(tier)}
                        className={`flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl border font-sans transition-colors duration-200 ${
                          active
                            ? "bg-white/25 border-white/40 text-white"
                            : "bg-white/8 border-white/15 text-[#EDE5D8]/75 hover:bg-white/12 hover:border-white/25"
                        }`}
                      >
                        <span className="font-semibold text-sm">
                          {tier.guests} {labels.guests}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wide ${active ? "opacity-90" : "opacity-65"}`}>
                          {perPersonLabel(tier.perPerson)} {labels.perPerson}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-5 pt-1">
                <DateField
                  value={date}
                  onChange={changeDate}
                  optional
                  tone="dark"
                  className="flex-1 min-w-[12rem]"
                />
                {selectedTier && (
                  <div className="flex flex-col gap-0.5 text-right">
                    <span className="font-sans text-xs text-[#D8DDB8]/55 uppercase tracking-widest">
                      {labels.total} · {selectedTier.guests} {labels.guests}
                    </span>
                    <span className="font-sans font-bold text-3xl text-[#EDE5D8] tabular-nums">
                      {money(selectedTier.total)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Body — description + meta grid + wildlife note */}
            <div className="bg-[#EDE5D8] px-6 md:px-8 py-8 flex flex-col gap-6">

              <p className="font-sans text-sm text-[#222E2C]/70 leading-relaxed whitespace-pre-line">
                {tour.description}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-[#6B5A2E]/15">
                <MetaRow label={labels.species} value={tour.species} icon={TbFish} />
                <MetaRow label={labels.included} value={tour.included} icon={TbCircleCheck} />
                <MetaRow label={labels.duration} value={tour.duration} icon={TbClock} />
                <MetaRow label={labels.departure} value={tour.departure} icon={TbMapPin} />
                {tour.capacityNote && (
                  <MetaRow label={labels.capacity} value={tour.capacityNote} icon={TbUsersGroup} />
                )}
              </div>

              {tour.wildlifeNote && (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-[#6B5A2E]/8">
                  <TbInfoCircle size={15} className="shrink-0 mt-0.5" style={{ color: FISHING_COLOR }} />
                  <p className="font-sans text-xs leading-relaxed italic text-[#222E2C]/65">
                    {tour.wildlifeNote}
                  </p>
                </div>
              )}

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="shrink-0 mt-1 text-[#6B5A2E]/70" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#222E2C]/45">
          {label}
        </span>
        <span className="font-sans text-sm leading-snug text-[#222E2C]/75">
          {value}
        </span>
      </div>
    </div>
  );
}

/* ── summary block ─────────────────────────────────────────── */

/* Mini collapsed-card. Mirrors the tour's collapsed row so a guest sees the same
 * silhouette they clicked — image left, title + tagline + species middle,
 * guest-count caption + total right. */
function SummaryLineCard({ line, locale }) {
  const dateLabel = formatDateLabel(line.date, locale);
  return (
    <div className="rounded-xl bg-white overflow-hidden flex items-stretch shadow-sm">
      {line.image && (
        <div className="w-24 sm:w-32 shrink-0 overflow-hidden bg-[#D8CEBC]">
          <img src={line.image} alt={line.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="flex-1 px-4 sm:px-5 py-3.5 flex flex-col justify-center gap-0.5 min-w-0">
        <h4 className="font-sans font-semibold text-sm text-[#222E2C] leading-snug line-clamp-2">
          {line.name}
        </h4>
        {line.tagline && (
          <p className="font-sans text-xs text-[#222E2C]/55 leading-snug line-clamp-1">
            {line.tagline}
          </p>
        )}
        {line.species && (
          <p
            className="font-sans text-[11px] font-semibold mt-0.5 line-clamp-1"
            style={{ color: FISHING_COLOR }}
          >
            {line.species}
          </p>
        )}
      </div>
      <div className="px-4 sm:px-5 py-3.5 flex flex-col items-end justify-center gap-0.5 shrink-0">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#222E2C]/45 whitespace-nowrap">
          {line.guestsLabel}
          {dateLabel && ` · ${dateLabel}`}
        </span>
        <span className="font-sans font-bold text-base tabular-nums whitespace-nowrap" style={{ color: FISHING_COLOR }}>
          {money(line.total)}
        </span>
      </div>
    </div>
  );
}

function FishingSummary({ lines, total, notes, onNotesChange, onAddToCart, inCart, copy }) {
  const { t, locale } = useI18n();

  return (
    <div id="checkout" className="scroll-mt-24 flex flex-col gap-6">
      <div className="border-b border-[#213B2F]/15 pb-4">
        <p className="font-sans text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: FISHING_COLOR }}>
          {copy.eyebrow}
        </p>
        <h2 className="font-sans font-semibold text-xl md:text-2xl text-[#213B2F] tracking-tight">
          {copy.heading}
        </h2>
        <p className="font-sans text-sm text-[#213B2F]/55 mt-2 max-w-2xl">
          {copy.description}
        </p>
      </div>

      <div className="rounded-2xl px-6 md:px-10 py-8 flex flex-col gap-8" style={{ backgroundColor: FISHING_COLOR }}>

        <div className="flex flex-col gap-3">
          <h3 className="font-sans font-semibold text-sm text-[#EDE5D8]">{copy.yourSelection}</h3>
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 px-4 py-5 text-center">
              <p className="font-sans text-sm italic text-[#EDE5D8]/40">{copy.emptyState}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lines.map((line, i) => (
                <SummaryLineCard key={i} line={line} locale={locale} />
              ))}
              <div className="flex items-center justify-between gap-4 px-5 py-3.5 mt-1 rounded-xl bg-white/10">
                <span className="font-sans font-semibold text-sm text-[#EDE5D8]">{copy.totalLabel}</span>
                <span className="font-sans font-bold text-xl text-[#EDE5D8] tabular-nums">{money(total)}</span>
              </div>
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-xs font-medium text-[#EDE5D8]/60 flex items-center gap-1.5">
            <TbNotes size={12} />
            {copy.notesLabel}
          </span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={copy.notesPlaceholder}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 font-sans text-sm text-[#EDE5D8] placeholder:text-[#EDE5D8]/35 focus:outline-none focus:ring-2 focus:ring-white/25 focus:border-transparent transition-all duration-200 resize-none"
          />
        </label>

        <button
          type="button"
          onClick={onAddToCart}
          disabled={lines.length === 0}
          style={{ color: FISHING_COLOR }}
          className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#EDE5D8] hover:bg-[#EDE5D8]/90 font-sans font-semibold text-sm shadow-sm transition-all duration-200 w-fit disabled:opacity-50"
        >
          {inCart ? <TbCheck size={16} /> : <TbShoppingBag size={16} />}
          {inCart ? t("cart.update") : t("cart.addToCart")}
        </button>

        {inCart && (
          <p className="font-sans text-xs text-[#EDE5D8]/60 -mt-4">
            {t("cart.inOrder")} — {t("cart.estimateNote")}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── main page ─────────────────────────────────────────────── */

export default function FishingToursPage() {
  const { t } = useI18n();
  const draft = useDraft();
  const {
    setLine, clearService, setServiceForm, openCart,
    linesByService, lines, serviceForms, hydrated, editSignal,
  } = useCart();
  const [notes, setNotes] = useState("");

  /* Re-fires the seed hook when the drawer's "Edit" link targets fishing. */
  const seedTrigger = editSignal.service === SERVICE ? editSignal.token : "__initial__";

  const anglers    = t("fishingTours.anglers");
  const family     = t("fishingTours.family");
  const booking    = t("fishingTours.booking");
  const conditions = t("fishingTours.conditions.items");
  const summary    = t("fishingTours.summary");
  const quote      = t("fishingTours.closingQuote");

  const anglerItems = Array.isArray(anglers?.items) ? anglers.items : [];
  const familyItems = Array.isArray(family?.items) ? family.items : [];
  const bookingSteps = Array.isArray(booking?.steps) ? booking.steps : [];

  const labels = useMemo(() => ({
    species:    anglers?.speciesLabel    ?? "Target species",
    included:   anglers?.includedLabel   ?? "Included",
    duration:   anglers?.durationLabel   ?? "Duration",
    departure:  anglers?.departureLabel  ?? "Departure",
    capacity:   anglers?.capacityLabel   ?? "Capacity",
    guests:     anglers?.guestsLabel     ?? "guests",
    perPerson:  anglers?.perPersonLabel  ?? "per person",
    total:      anglers?.totalLabel      ?? "Total",
    pickGroup:  anglers?.pickGroupLabel  ?? "Group size",
    selectTour: anglers?.selectTourLabel ?? "Select tour",
    selected:   anglers?.selectedLabel   ?? "Selected",
    from:       anglers?.fromLabel       ?? "from",
  }), [anglers]);

  const inCart = linesByService.some((g) => g.service.id === SERVICE);

  /* sku -> draft id, inverse of buildLines(). */
  const skuToDraftId = useMemo(() => {
    const map = {};
    anglerItems.forEach((_, i) => {
      map[skuOf("fishingTours.anglers.items", i, "name")] = `angler-${i}`;
    });
    familyItems.forEach((_, i) => {
      map[skuOf("fishingTours.family.items", i, "name")] = `family-${i}`;
    });
    return map;
  }, [anglerItems, familyItems]);

  /* Rehydrate the draft from any existing cart lines on first mount, so the
   * "Edit" link in the cart drawer doesn't land the guest on an empty page.
   * We need the full tier back, not just the price — the guest count is parsed
   * from the stored "4 guests" caption since describeLine() would surface any
   * extra numeric option as its own caption chunk. */
  useSeedDraftFromCart({
    hydrated,
    lines,
    service: SERVICE,
    skuToId: (line) => skuToDraftId[line.sku],
    setItems: draft.setItems,
    trigger: seedTrigger,
    onSeed: (mine) => {
      const next = {};
      for (const line of mine) {
        const id = skuToDraftId[line.sku];
        if (!id) continue;
        const [group, idxStr] = id.split("-");
        const items = group === "angler" ? anglerItems : familyItems;
        const item = items[Number(idxStr)];
        /* The guest count comes off the line's typed `data`. It used to be scraped
         * out of the localised `"4 personas"` caption with a regex. */
        const guestCount = Number(line.data?.guests);
        const tier = item?.tiers?.find((t) => Number(t.guests) === guestCount);
        if (!tier) continue;
        next[id] = {
          qty: 1,
          date: line.date ?? "",
          unitPrice: tier.total,
          tier,
        };
      }
      /* Replace — the hook's own setItems has already run with a trimmed entry
       * (no tier), and we want the tier-aware version to supersede it cleanly. */
      draft.setItems(next);
      const form = serviceForms[SERVICE];
      setNotes(form?.notes ?? "");
    },
  });

  /*
   * Draft entries -> cart lines. The "N guests" string is the single source of
   * guest-count truth; describeLine() renders options.values(), so any extra
   * numeric here would leak as its own caption chunk.
   */
  const buildLines = () => {
    const out = [];

    const push = (id, sku, title, titleEn) => {
      const entry = draft.get(id);
      if (!entry?.tier) return;
      const { tier } = entry;
      out.push({
        lineId: lineIdOf(SERVICE, sku, `${tier.guests}-guests`),
        service: SERVICE,
        sku,
        title,
        titleEn: titleEn || title,
        kind: "charter",
        qty: 1,
        unitPrice: tier.total,
        byQuote: false,
        date: entry.date ?? "",
        /* `options.guests` is a localised label for the caption; the number
         * itself goes in `data` so the sheet gets a number. */
        options: { guests: countLabel(t, tier.guests, "guest") },
        data: { guests: tier.guests },
      });
    };

    anglerItems.forEach((item, i) =>
      push(
        `angler-${i}`,
        skuOf("fishingTours.anglers.items", i, "name"),
        item.name,
        titleOf("fishingTours.anglers.items", i, "name")
      )
    );
    familyItems.forEach((item, i) =>
      push(
        `family-${i}`,
        skuOf("fishingTours.family.items", i, "name"),
        item.name,
        titleOf("fishingTours.family.items", i, "name")
      )
    );
    return out;
  };

  /* Rich summary rows — same shape as the tour's collapsed card so the summary
   * can render a mini version. Built straight from the draft + i18n items rather
   * than from `buildLines()`, which is cart-shape only. */
  const summaryLines = [];
  anglerItems.forEach((item, i) => {
    const entry = draft.get(`angler-${i}`);
    if (!entry?.tier) return;
    summaryLines.push({
      image: ANGLER_IMAGES[i % ANGLER_IMAGES.length],
      name: item.name,
      tagline: item.tagline,
      species: item.species,
      guestsLabel: `${entry.tier.guests} ${labels.guests}`,
      date: entry.date ?? "",
      total: entry.tier.total,
    });
  });
  familyItems.forEach((item, i) => {
    const entry = draft.get(`family-${i}`);
    if (!entry?.tier) return;
    summaryLines.push({
      image: FAMILY_IMAGES[i % FAMILY_IMAGES.length],
      name: item.name,
      tagline: item.tagline,
      species: item.species,
      guestsLabel: `${entry.tier.guests} ${labels.guests}`,
      date: entry.date ?? "",
      total: entry.tier.total,
    });
  });
  const summaryTotal = summaryLines.reduce((sum, l) => sum + l.total, 0);

  const addToCart = () => {
    const builtLines = buildLines();
    if (!builtLines.length) return;

    clearService(SERVICE);
    builtLines.forEach(setLine);

    if (notes.trim()) setServiceForm(SERVICE, { notes: notes.trim() });

    openCart();

    /* El draft NO se vacía: tiene que seguir siendo el espejo completo de lo que
     * este servicio tiene en el carrito.
     *
     * El commit hace `clearService(SERVICE)` y después agrega todo lo que haya en
     * el draft, así que el draft es el estado deseado completo, no un incremento.
     * Vaciarlo aquí significaba que, sin salir de la página, seleccionar algo más
     * y volver a enviar borraba lo anterior: el `clearService` limpiaba el carrito
     * y solo se reponía la selección nueva.
     *
     * Dejándolo intacto, la página sigue mostrando lo que ya está pedido y agregar
     * algo más suma en vez de reemplazar. */
  };

  return (
    <>
      <Navbar />
      <main className="pt-24 bg-[#EDE5D8]">

        {/* Header */}
        <div className="px-8 md:px-16 pt-8 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex flex-col gap-1" data-aos="fade-up">
            <Link
              href="/"
              className="flex items-center gap-1.5 w-fit mb-3 text-sm font-sans font-medium text-[#213B2F]/50 hover:text-[#213B2F] transition-colors duration-200"
            >
              <TbArrowLeft size={16} />
              {t("common.back")}
            </Link>
            <div className="flex items-center gap-2 w-fit border border-[#213B2F]/20 rounded-full px-4 py-2 mb-3">
              <TbAnchor size={15} className="text-[#213B2F]" />
              <span className="font-sans text-sm text-[#213B2F]">{t("fishingTours.pill")}</span>
            </div>
            <h1
              className="text-4xl md:text-5xl text-[#213B2F] tracking-tight leading-tight"
              style={{ fontFamily: "var(--font-alpina)" }}
            >
              {t("fishingTours.title")}
            </h1>
            <p className="font-sans text-sm text-[#213B2F]/55 mt-1">{t("fishingTours.subtitle")}</p>
          </div>
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#213B2F] font-sans font-medium text-sm text-[#D8DDB8] hover:bg-[#213B2F]/90 transition-colors duration-200 shrink-0 w-fit"
          >
            <TbBrandWhatsapp size={16} />
            {t("fishingTours.whatsapp")}
          </a>
        </div>

        <div className="px-8 md:px-16 flex flex-col gap-16 pb-24">

          {/* Story */}
          <div
            className="rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 lg:min-h-[420px]"
            style={{ backgroundColor: FISHING_COLOR }}
            data-aos="fade-up"
          >
            <div className="flex flex-col justify-center gap-5 px-8 md:px-12 py-12 lg:py-14 order-2 lg:order-1">
              <TbAnchor size={22} className="text-[#D8DDB8]/60" />
              <h2
                className="text-3xl md:text-4xl text-[#EDE5D8] tracking-tight leading-tight"
                style={{ fontFamily: "var(--font-alpina)" }}
              >
                {t("fishingTours.story.heading")}
              </h2>
              <div className="w-12 h-px bg-[#D8DDB8]/40" />
              <p className="font-sans text-sm text-[#D8DDB8]/70 leading-relaxed whitespace-pre-line max-w-md">
                {t("fishingTours.story.body")}
              </p>
            </div>
            <div className="h-56 lg:h-auto lg:min-h-[420px] order-1 lg:order-2 overflow-hidden">
              <img src={STORY_IMAGE} alt={t("fishingTours.story.heading")} className="w-full h-full object-cover" />
            </div>
          </div>

          {/* How to book */}
          {bookingSteps.length > 0 && (
            <div className="flex flex-col gap-6" data-aos="fade-up">
              <div className="flex flex-col gap-2 max-w-xl">
                <h2
                  className="text-3xl md:text-4xl text-[#213B2F] tracking-tight leading-tight"
                  style={{ fontFamily: "var(--font-alpina)" }}
                >
                  {booking.heading}
                </h2>
                <p className="font-sans text-sm text-[#213B2F]/55 leading-relaxed">
                  {booking.description}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {bookingSteps.map((item, i) => {
                  const Icon = [TbHandClick, TbAdjustments, TbCirclePlus, TbSend][i] ?? TbHandClick;
                  return (
                    <div key={i} className="flex-1 flex flex-col gap-3 bg-white rounded-2xl px-5 py-5 border border-[#213B2F]/8">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: FISHING_COLOR }}>
                          <Icon size={15} className="text-[#D8DDB8]" />
                        </div>
                        <span className="font-sans text-xs font-semibold uppercase tracking-widest" style={{ color: `${FISHING_COLOR}99` }}>
                          Step {i + 1}
                        </span>
                      </div>
                      <p className="font-sans text-base font-medium text-[#213B2F] leading-snug">{item.step}</p>
                      <p className="font-sans text-sm text-[#213B2F]/55 leading-relaxed">{item.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Anglers' Expeditions */}
          <div className="flex flex-col gap-6" data-aos="fade-up">
            <div className="border-b border-[#213B2F]/15 pb-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: FISHING_COLOR }}>
                {anglers?.subheading}
              </p>
              <h2 className="font-sans font-semibold text-xl md:text-2xl text-[#213B2F] tracking-tight">
                {anglers?.heading}
              </h2>
              <p className="font-sans text-sm text-[#213B2F]/55 mt-2 max-w-2xl">
                {anglers?.description}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {anglerItems.map((tour, i) => (
                <TourCard
                  key={i}
                  tour={tour}
                  image={ANGLER_IMAGES[i % ANGLER_IMAGES.length]}
                  groupId={`angler-${i}`}
                  draft={draft}
                  labels={labels}
                />
              ))}
            </div>
          </div>

          {/* Family Experiences */}
          <div className="flex flex-col gap-6" data-aos="fade-up">
            <div className="border-b border-[#213B2F]/15 pb-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: FISHING_COLOR }}>
                {family?.subheading}
              </p>
              <h2 className="font-sans font-semibold text-xl md:text-2xl text-[#213B2F] tracking-tight">
                {family?.heading}
              </h2>
              <p className="font-sans text-sm text-[#213B2F]/55 mt-2 max-w-2xl">
                {family?.description}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {familyItems.map((tour, i) => (
                <TourCard
                  key={i}
                  tour={tour}
                  image={FAMILY_IMAGES[i % FAMILY_IMAGES.length]}
                  groupId={`family-${i}`}
                  draft={draft}
                  labels={labels}
                />
              ))}
            </div>
          </div>

          {/* Good to Know */}
          <div className="flex flex-col gap-6" data-aos="fade-up">
            <div className="border-b border-[#213B2F]/15 pb-4">
              <h2 className="font-sans font-semibold text-xl md:text-2xl text-[#213B2F] tracking-tight">
                {t("fishingTours.conditions.heading")}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.isArray(conditions) && conditions.map((item, i) => (
                <div key={i} className="bg-white rounded-xl px-5 py-5 flex items-start gap-3 border border-[#213B2F]/8">
                  <TbCircleCheck size={18} className="shrink-0 mt-0.5" style={{ color: FISHING_COLOR }} />
                  <span className="font-sans text-sm text-[#222E2C]/65 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
            <p className="font-sans text-xs text-[#213B2F]/45 italic">{t("fishingTours.note")}</p>
          </div>

          {/* Closing quote */}
          {quote?.body && (
            <div className="flex flex-col items-center text-center gap-5 py-8" data-aos="fade-up">
              <div className="w-10 h-px bg-[#213B2F]/25" />
              <blockquote
                className="text-2xl md:text-3xl text-[#213B2F]/80 leading-relaxed max-w-2xl italic"
                style={{ fontFamily: "var(--font-alpina)" }}
              >
                &ldquo;{quote.body}&rdquo;
              </blockquote>
              {quote.attribution && (
                <p className="font-sans text-sm text-[#213B2F]/45">{quote.attribution}</p>
              )}
              <div className="w-10 h-px bg-[#213B2F]/25" />
            </div>
          )}

          {/* Order summary & submit */}
          <FishingSummary
            lines={summaryLines}
            total={summaryTotal}
            notes={notes}
            onNotesChange={setNotes}
            onAddToCart={addToCart}
            inCart={inCart}
            copy={summary || {}}
          />

          {/* Bottom CTA */}
          <div
            className="rounded-2xl px-8 md:px-12 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
            style={{ backgroundColor: FISHING_COLOR }}
            data-aos="fade-up"
          >
            <div className="flex flex-col gap-1.5">
              <h2 className="font-sans font-semibold text-xl text-[#EDE5D8]">
                {t("fishingTours.ctaHeading")}
              </h2>
              <p className="font-sans text-sm text-[#EDE5D8]/70">
                {t("fishingTours.ctaSubheading")}
              </p>
            </div>
            <a
              href={`https://wa.me/${WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: FISHING_COLOR }}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#EDE5D8] hover:bg-[#EDE5D8]/90 font-sans font-medium text-sm transition-colors duration-200 shrink-0"
            >
              <TbBrandWhatsapp size={16} />
              {t("fishingTours.whatsapp")}
            </a>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
