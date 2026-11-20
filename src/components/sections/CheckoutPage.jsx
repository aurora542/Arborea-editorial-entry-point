"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  TbArrowLeft, TbShoppingBag, TbArrowRight, TbPencil, TbTrash,
  TbCircleCheck, TbAlertTriangle,
} from "react-icons/tb";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/Footer";
import { useCart } from "@/app/context/CartContext";
import { useI18n } from "@/app/context/I18nContext";
import { money, describeLine } from "@/lib/format";
import { describeServiceForm } from "@/lib/serviceForm";
import QtyStepper from "@/components/ui/QtyStepper";
import GuestDetailsForm from "@/components/sections/GuestDetailsForm";
import { buildOrderPayload } from "@/lib/orderPayload";
import { submitOrder } from "@/lib/orderApi";

/*
 * Order review + the guest-details form + the one and only submit.
 *
 * This is the only place in the product that sends an order. Service pages add to
 * the cart; nothing else posts. See docs/ORDERS-BACKEND.md §6.
 */

/* `crypto.randomUUID` is unavailable outside a secure context (plain http on a LAN
 * IP, for instance). This id is what stops a retry from creating a duplicate order,
 * so it must never be the thing that breaks submitting. */
function newSubmissionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CheckoutPage() {
  const {
    linesByService, lines, subtotal, count,
    setQty, removeLine, serviceForms, hydrated, clear,
  } = useCart();
  const { t, locale } = useI18n();

  const [status, setStatus] = useState("idle"); /* idle | submitting | success | error */
  const [errorCode, setErrorCode] = useState("");
  const [sentReservation, setSentReservation] = useState("");

  /*
   * Generated once per checkout ATTEMPT and deliberately reused while that attempt is
   * unresolved, so a retry after a network error carries the same id and the backend
   * dedupes instead of writing the order twice. Cleared only on success, so a guest
   * who orders again later starts a genuinely new order.
   */
  const submissionIdRef = useRef(null);

  const handleSubmit = async (values) => {
    if (!lines.length) return;

    if (!submissionIdRef.current) submissionIdRef.current = newSubmissionId();

    setStatus("submitting");
    setErrorCode("");

    const payload = buildOrderPayload({
      submissionId: submissionIdRef.current,
      lines,
      serviceForms,
      guest: values,
      notes: values.notes,
      locale,
    });

    const result = await submitOrder(payload);

    if (result?.ok) {
      setSentReservation(payload.guest.reservationNumber);
      submissionIdRef.current = null;
      setStatus("success");
      /* The order is committed server-side; the cart has done its job. Cleared after
       * `status` is set, because the success panel short-circuits the empty state. */
      clear();
      return;
    }

    setErrorCode(result?.error || "unknown");
    setStatus("error");
  };

  return (
    <>
      <Navbar />
      <main className="pt-24 min-h-screen">
        <div className="px-8 md:px-16 pt-8 pb-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 w-fit mb-3 text-sm font-sans font-medium text-[#222E2C]/50 hover:text-[#222E2C] transition-colors duration-200"
          >
            <TbArrowLeft size={16} />
            {t("common.back")}
          </Link>
          <p className="font-sans text-xs font-semibold text-[#222E2C]/40 uppercase tracking-widest mb-1">
            {t("checkout.eyebrow")}
          </p>
          <h1
            className="text-4xl md:text-5xl text-[#213B2F] tracking-tight leading-tight"
            style={{ fontFamily: "var(--font-alpina)" }}
          >
            {t("checkout.title")}
          </h1>
          <p className="font-sans text-sm text-[#222E2C]/55 mt-2 max-w-2xl leading-relaxed">
            {t("checkout.subtitle")}
          </p>
        </div>

        <div className="px-8 md:px-16 pb-24">
          {/* `hydrated` keeps the prerendered HTML from flashing the empty state
              before sessionStorage has been read. */}
          {!hydrated ? (
            <div className="h-64" />
          ) : status === "success" ? (
            /* Must come BEFORE the empty-state check: the cart is cleared on a
               successful submit, so `count` is 0 by the time this renders. */
            <SuccessPanel t={t} reservation={sentReservation} />
          ) : count === 0 ? (
            <EmptyState t={t} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start max-w-6xl">
              {/* Review */}
              <div className="flex flex-col gap-4">
                <h2 className="font-sans font-semibold text-lg text-[#222E2C] tracking-tight pb-3 border-b border-[#222E2C]/15">
                  {t("checkout.yourOrder")}
                </h2>

                {linesByService.map(({ service, lines, subtotal: groupTotal }) => {
                  const Icon = service.icon;
                  const prefRows = describeServiceForm(serviceForms[service.id], t);

                  return (
                    <section key={service.id} className="rounded-2xl bg-white/60 border border-[#222E2C]/8 overflow-hidden">
                      <div
                        className="flex items-center gap-3 px-5 py-3.5"
                        style={{ backgroundColor: `${service.color}12` }}
                      >
                        <span
                          className="size-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: service.color }}
                        >
                          <Icon size={15} className="text-[#EDE5D8]" />
                        </span>
                        <h3 className="font-sans font-semibold text-sm text-[#222E2C] flex-1 min-w-0">
                          {t(service.labelKey)}
                        </h3>
                        <Link
                          href={service.href}
                          className="inline-flex items-center gap-1 font-sans text-xs font-medium text-[#222E2C]/55 hover:text-[#213B2F] transition-colors shrink-0"
                        >
                          <TbPencil size={12} />
                          {t("cart.editPreferences")}
                        </Link>
                        <span className="font-sans font-semibold text-sm text-[#222E2C] shrink-0 ml-1 tabular-nums">
                          {groupTotal > 0 ? money(groupTotal) : (
                            <span className="uppercase tracking-wide text-xs">{t("cart.byQuote")}</span>
                          )}
                        </span>
                      </div>

                      <ul className="divide-y divide-[#222E2C]/8">
                        {lines.map((line) => {
                          const caption = describeLine(line, locale);
                          return (
                            <li key={line.lineId} className="px-5 py-4 flex flex-wrap items-center gap-4">
                              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                                <p className="font-sans font-medium text-sm text-[#222E2C] leading-snug">
                                  {line.title}
                                </p>
                                {caption && (
                                  <p className="font-sans text-xs text-[#222E2C]/50">{caption}</p>
                                )}
                              </div>

                              <QtyStepper
                                value={line.qty}
                                onChange={(n) => setQty(line.lineId, n)}
                                min={0}
                                size="sm"
                                tone="light"
                                label={`${t("cart.quantity")} — ${line.title}`}
                              />

                              <div className="flex flex-col items-end leading-tight w-20 shrink-0">
                                {line.unitPrice > 0 ? (
                                  <>
                                    <span className="font-sans font-semibold text-sm text-[#222E2C] tabular-nums">
                                      {money(line.lineTotal)}
                                    </span>
                                    {line.qty > 1 && (
                                      <span className="font-sans text-[11px] text-[#222E2C]/40 tabular-nums">
                                        {money(line.unitPrice)} {t("cart.each")}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-[#222E2C]/55 text-right">
                                    {t("cart.byQuote")}
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => removeLine(line.lineId)}
                                aria-label={`${t("cart.remove")} — ${line.title}`}
                                className="shrink-0 size-8 rounded-full flex items-center justify-center text-[#222E2C]/30 hover:text-red-700 hover:bg-red-700/8 transition-colors"
                              >
                                <TbTrash size={15} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      {prefRows.length > 0 && (
                        <div className="px-5 py-4 border-t border-[#222E2C]/8 bg-[#222E2C]/3">
                          <p className="font-sans text-xs font-semibold uppercase tracking-widest text-[#222E2C]/40 mb-3">
                            {t("cart.formLabels.preferencesHeading")}
                          </p>
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                            {prefRows.map((row) => (
                              <div key={row.key} className="flex flex-col gap-0.5 min-w-0">
                                <dt className="font-sans text-[11px] font-semibold uppercase tracking-wide text-[#222E2C]/45">
                                  {row.label}
                                </dt>
                                <dd className="font-sans text-sm leading-snug text-[#222E2C]/75 break-words">
                                  {row.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </section>
                  );
                })}

                {status === "error" && (
                  <div
                    role="alert"
                    className="rounded-2xl border-2 border-red-700/30 bg-red-700/5 px-5 py-4 flex items-start gap-3"
                  >
                    <TbAlertTriangle size={18} className="text-red-700 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-sans font-semibold text-sm text-[#222E2C]">
                        {t("checkout.form.error.heading")}
                      </p>
                      <p className="font-sans text-sm text-[#222E2C]/65 mt-1 leading-relaxed">
                        {t("checkout.form.error.body")}
                      </p>
                      {/* The code is for us, not the guest — but having it on screen
                          turns "it didn't work" into something diagnosable. */}
                      {errorCode && (
                        <p className="font-sans text-xs text-[#222E2C]/40 mt-2 break-all">
                          {errorCode}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <GuestDetailsForm
                  onSubmit={handleSubmit}
                  submitting={status === "submitting"}
                />
              </div>

              {/* Totals */}
              <aside className="lg:sticky lg:top-28 rounded-2xl bg-[#213B2F] px-6 py-6 flex flex-col gap-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-sans font-semibold text-sm text-[#D8DDB8]">
                    {t("cart.subtotal")}
                  </span>
                  {subtotal > 0 ? (
                    <span className="font-sans font-bold text-3xl text-[#EDE5D8] tabular-nums">
                      {money(subtotal)}
                    </span>
                  ) : (
                    <span className="font-sans font-bold text-lg text-[#EDE5D8] uppercase tracking-wide">
                      {t("cart.byQuote")}
                    </span>
                  )}
                </div>
                <p className="font-sans text-sm text-[#D8DDB8]/60 tabular-nums">
                  {count} {count === 1 ? t("cart.itemsOne") : t("cart.itemsMany")}
                </p>
                <div className="h-px bg-[#D8DDB8]/15" />
                <p className="font-sans text-xs leading-relaxed text-[#D8DDB8]/60">
                  {t("cart.estimateNote")}
                </p>
              </aside>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function SuccessPanel({ t, reservation }) {
  const body = t("checkout.form.success.body").replace("{reservation}", reservation || "—");

  return (
    <div className="flex flex-col items-center text-center gap-4 py-24 max-w-xl mx-auto">
      <span className="size-16 rounded-full bg-[#213B2F]/10 flex items-center justify-center">
        <TbCircleCheck size={30} className="text-[#213B2F]" />
      </span>
      <h2
        className="text-3xl md:text-4xl text-[#213B2F] tracking-tight"
        style={{ fontFamily: "var(--font-alpina)" }}
      >
        {t("checkout.form.success.heading")}
      </h2>
      <p className="font-sans text-sm text-[#222E2C]/65 leading-relaxed">{body}</p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-1.5 px-5 py-3 rounded-full bg-[#213B2F] font-sans text-sm font-medium text-[#D8DDB8] hover:bg-[#213B2F]/90 transition-colors"
      >
        {t("checkout.form.success.cta")}
        <TbArrowRight size={15} />
      </Link>
    </div>
  );
}

function EmptyState({ t }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-24">
      <span className="size-16 rounded-full bg-[#222E2C]/6 flex items-center justify-center">
        <TbShoppingBag size={28} className="text-[#222E2C]/30" />
      </span>
      <p className="font-sans font-medium text-lg text-[#222E2C]">{t("checkout.empty")}</p>
      <Link
        href="/#experiences"
        className="mt-1 inline-flex items-center gap-1.5 px-5 py-3 rounded-full bg-[#213B2F] font-sans text-sm font-medium text-[#D8DDB8] hover:bg-[#213B2F]/90 transition-colors"
      >
        {t("checkout.emptyCta")}
        <TbArrowRight size={15} />
      </Link>
    </div>
  );
}
