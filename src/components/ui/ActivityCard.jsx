"use client";

import { useState, useEffect, useRef } from "react";
import { TbPhoto, TbCirclePlus, TbCheck, TbTrash } from "react-icons/tb";
import { useCart } from "@/app/context/CartContext";
import { useI18n } from "@/app/context/I18nContext";
import { skuOf, titleOf, lineIdOf } from "@/lib/sku";
import { money } from "@/lib/format";
import QtyStepper from "@/components/ui/QtyStepper";
import DateField from "@/components/ui/DateField";

/*
 * Home-page activity card. Quantity and date are picked here as a local draft,
 * then committed to the cart in one explicit action — these never go through an
 * intermediate page summary.
 *
 * Only whitelisted fields are read off the activity object. `tours.activities` in
 * the i18n files also carries `commission`, `contactName` and `whatsapp`, which are
 * internal margin data and must never reach a cart line or the payload.
 */

export default function ActivityCard({ activity, index }) {
  const { t } = useI18n();
  const { getLine, setLine, removeLine, openCart, hydrated } = useCart();

  /* Solo los campos de cara al huésped. `pricing`, `commission`, `contactName` y
   * `whatsapp` viven en el mismo objeto y son internos — no se desestructuran aquí
   * para que no haya forma accidental de renderizarlos. */
  const { title, description, image, price, priceValue, features } = activity;

  const sku = skuOf("tours.activities", index, "title");
  const lineId = lineIdOf("tours", sku);
  const cartLine = getLine(lineId);

  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState("");

  /*
   * Seed the draft from the cart once, so returning to the home page shows what
   * was already chosen instead of resetting to 1.
   *
   * This can't be done in the useState initialisers: the first render happens
   * before the cart has read sessionStorage, so `cartLine` is still null then and
   * an initialiser would capture that and never re-run. Guarded by a ref so it
   * fires only on the hydration tick and can't later overwrite live edits.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !hydrated) return;
    seeded.current = true;
    if (cartLine) {
      setQty(cartLine.qty);
      setDate(cartLine.date);
      setOpen(true);
    }
  }, [hydrated, cartLine]);

  const dirty = cartLine ? cartLine.qty !== qty || cartLine.date !== date : true;
  const total = priceValue ? priceValue * qty : null;

  const commit = () => {
    setLine({
      lineId,
      service: "tours",
      sku,
      title,
      titleEn: titleOf("tours.activities", index, "title"),
      kind: "activity",
      qty,
      unitPrice: priceValue ?? 0,
      /* Most third-party activities are quoted by the operator rather than
       * carrying a fixed price. */
      byQuote: priceValue == null,
      date,
      options: {},
      data: {},
    });
    openCart();
  };

  const drop = () => {
    removeLine(lineId);
    setOpen(false);
    setQty(1);
    setDate("");
  };

  const active = open || Boolean(cartLine);

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all duration-300 ${
        active ? "bg-[#213B2F] shadow-lg" : "bg-[#222E2C]/5"
      }`}
    >
      <div className="flex flex-row items-stretch min-h-[88px]">
        <div className="w-36 md:w-48 shrink-0 bg-[#222E2C]/10 flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={image} alt={title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <TbPhoto size={24} className="text-[#222E2C]/30" />
          )}
        </div>

        <div
          className={`flex-1 px-5 py-4 flex flex-col gap-1 min-w-0 ${
            active ? "justify-start" : "justify-center"
          }`}
        >
          <p className={`font-sans font-medium text-base leading-snug ${active ? "text-[#D8DDB8]" : "text-[#222E2C]"}`}>
            {title}
          </p>
          {/* Collapsed the description is one line so every card in the grid keeps
              the same height. Expanded it runs in full — the truncation used to
              apply in both states, which hid most of what we know about the tour. */}
          <p
            className={`font-sans text-sm leading-relaxed ${active ? "text-[#D8DDB8]/70" : "line-clamp-1 text-[#222E2C]/55"}`}
          >
            {description}
          </p>

          {/* What the tour includes. Only rendered expanded, so the collapsed row
              stays scannable.
              Deliberately NOT rendered: `pricing`, `commission`, `contactName` and
              `whatsapp` also live on the activity object. They are the operator's
              rate card and our margin — internal data that happens to sit in the
              same i18n node. Never surface them to a guest. */}
          {active && Array.isArray(features) && features.length > 0 && (
            <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <TbCheck size={14} className="text-[#C9974F] shrink-0 mt-0.5" />
                  <span className="font-sans text-sm leading-snug text-[#D8DDB8]/75">{f}</span>
                </li>
              ))}
            </ul>
          )}

          {active && total !== null && (
            <p className="font-sans font-bold text-lg text-[#EDE5D8] mt-3 tabular-nums">
              {money(total)}
              {price && (
                <span className="font-normal text-sm text-[#D8DDB8]/55 ml-2">{price}</span>
              )}
            </p>
          )}
        </div>

        <div
          className={`shrink-0 flex flex-col items-end gap-2 px-5 py-4 ${
            active ? "justify-start" : "justify-center"
          }`}
        >
          {!active && price && (
            <span className="font-sans text-sm font-semibold text-[#222E2C]/50">{price}</span>
          )}
          {active ? (
            <QtyStepper value={qty} onChange={setQty} min={1} size="md" tone="accent" label={t("cart.quantity")} />
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 rounded-full px-4 py-2.5 font-sans text-sm font-medium transition-colors duration-200 whitespace-nowrap bg-[#222E2C] text-white hover:bg-[#213B2F]"
            >
              <TbCirclePlus size={15} />
              {t("cart.addToCart")}
            </button>
          )}
        </div>
      </div>

      {active && (
        <div className="px-5 pb-4 pt-3 border-t border-white/10 flex flex-wrap items-end gap-4">
          <DateField value={date} onChange={setDate} optional tone="accent" />

          <div className="flex items-center gap-2 ml-auto">
            {cartLine && (
              <button
                type="button"
                onClick={drop}
                aria-label={`${t("cart.remove")} — ${title}`}
                className="size-9 rounded-full flex items-center justify-center text-[#D8DDB8]/50 hover:text-red-300 hover:bg-red-400/10 transition-colors"
              >
                <TbTrash size={15} />
              </button>
            )}

            {dirty ? (
              <button
                type="button"
                onClick={commit}
                className="flex items-center gap-2 rounded-full bg-[#D8DDB8] px-5 py-2.5 font-sans text-sm font-semibold text-[#213B2F] hover:bg-[#D8DDB8]/90 transition-colors"
              >
                <TbCirclePlus size={15} />
                {cartLine ? t("cart.update") : t("cart.addToCart")}
              </button>
            ) : (
              <span className="flex items-center gap-2 rounded-full bg-white/12 px-5 py-2.5 font-sans text-sm font-semibold text-[#D8DDB8]">
                <TbCheck size={15} />
                {t("cart.inOrder")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
