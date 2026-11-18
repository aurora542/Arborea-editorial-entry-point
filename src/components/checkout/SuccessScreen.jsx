"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TbCircleCheck } from "react-icons/tb";
import { useKiosk } from "@/app/context/KioskContext";
import { useI18n } from "@/app/context/I18nContext";
import { KIOSK_CONFIG } from "@/lib/kioskConfig";
import ExternalLinkModal from "@/components/kiosk/ExternalLinkModal";

/*
 * Confirmation after an order or request is accepted.
 *
 * - Web: static confirmation + a link back to experiences.
 * - Kiosk: same message plus a countdown that returns home via resetKiosk, and a
 *   "back to home now" button.
 *
 * `type` is "order" | "request" (chooses the headline). `responseKind` is
 * "office" | "after" (office-hours-aware body copy, evaluated at success time by the
 * caller). Out of hours, if afterHoursContact is configured we offer it as a QR.
 */
export default function SuccessScreen({ type, responseKind }) {
  const { isKiosk, resetKiosk } = useKiosk();
  const { t } = useI18n();
  const [secondsLeft, setSecondsLeft] = useState(KIOSK_CONFIG.successReturnSeconds);
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    if (!isKiosk) return undefined;
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          resetKiosk();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [isKiosk, resetKiosk]);

  const { start, end } = KIOSK_CONFIG.officeHours;
  const afterContact = KIOSK_CONFIG.afterHoursContact;

  const headline = type === "request" ? t("kiosk.response.requestTitle") : t("kiosk.response.orderTitle");

  let body;
  if (responseKind === "after") {
    body = t("kiosk.response.afterHours")
      .replace("{start}", `${start}:00`)
      .replace("{end}", `${end}:00`);
  } else {
    body = type === "request" ? t("kiosk.response.officeRequest") : t("kiosk.response.officeOrder");
  }

  const wrapClass = isKiosk
    ? "fixed inset-0 z-[760] flex flex-col items-center justify-center gap-6 bg-[#EDE5D8] text-center px-8"
    : "flex flex-col items-center text-center gap-5 py-24 px-8";

  return (
    <div className={wrapClass}>
      <span className="size-20 rounded-full bg-[#213B2F] flex items-center justify-center">
        <TbCircleCheck size={40} className="text-[#D8DDB8]" />
      </span>
      <h1
        className="text-3xl md:text-4xl text-[#213B2F] leading-tight"
        style={{ fontFamily: "var(--font-alpina)" }}
      >
        {headline}
      </h1>
      <p className="font-sans text-base text-[#222E2C]/70 max-w-md leading-relaxed">{body}</p>

      {responseKind === "after" && afterContact && (
        <button
          type="button"
          onClick={() => setShowContact(true)}
          className="min-h-[48px] px-6 rounded-full border border-[#213B2F]/30 font-sans text-sm font-medium text-[#213B2F]"
        >
          {t("kiosk.response.showContact")}
        </button>
      )}

      {isKiosk ? (
        <div className="flex flex-col items-center gap-3 mt-2">
          <button
            type="button"
            onClick={resetKiosk}
            className="min-h-[52px] px-10 rounded-full bg-[#213B2F] font-sans text-base font-semibold text-[#D8DDB8] hover:bg-[#213B2F]/90 transition-colors"
          >
            {t("kiosk.response.backHome")}
          </button>
          <p className="font-sans text-xs text-[#222E2C]/40 tabular-nums">
            {t("kiosk.response.autoReturn").replace("{seconds}", String(secondsLeft))}
          </p>
        </div>
      ) : (
        <Link
          href="/#experiences"
          className="mt-2 inline-flex items-center gap-1.5 px-6 py-3 rounded-full bg-[#213B2F] font-sans text-sm font-medium text-[#D8DDB8] hover:bg-[#213B2F]/90 transition-colors"
        >
          {t("checkout.emptyCta")}
        </Link>
      )}

      {showContact && afterContact && (
        <ExternalLinkModal href={`tel:${afterContact}`} kind="tel" onClose={() => setShowContact(false)} />
      )}
    </div>
  );
}
