"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useKiosk } from "@/app/context/KioskContext";
import { useCart } from "@/app/context/CartContext";
import { useI18n } from "@/app/context/I18nContext";
import { KIOSK_CONFIG } from "@/lib/kioskConfig";

/*
 * Resets the kiosk to a clean home state after `idleSeconds` of no interaction.
 * A full-screen "still there?" overlay with a 15s countdown appears in the last
 * `warningSeconds`; any touch cancels it.
 *
 * If we are already on a clean state (home, scrolled to top, empty cart, default
 * locale), the timer just restarts silently without resetting anything.
 *
 * Paused while a submission is in flight (via KioskContext.pause/resume) so a slow
 * network request can't be wiped mid-send.
 */

const { idleSeconds, warningSeconds, defaultLocale } = KIOSK_CONFIG;

export default function IdleReset() {
  const { isKiosk, resetKiosk, isPaused } = useKiosk();
  const { count } = useCart();
  const { locale } = useI18n();
  const pathname = usePathname();

  const [remaining, setRemaining] = useState(null); // null = no warning showing
  const deadlineRef = useRef(0);
  const warningRef = useRef(false);

  // Keep the latest "is this already a clean state" check without re-subscribing.
  const cleanStateRef = useRef(false);
  cleanStateRef.current =
    pathname === "/" &&
    count === 0 &&
    locale === defaultLocale &&
    (typeof window === "undefined" || window.scrollY === 0);

  const resetTimer = useCallback(() => {
    deadlineRef.current = Date.now() + idleSeconds * 1000;
    if (warningRef.current) {
      warningRef.current = false;
      setRemaining(null);
    }
  }, []);

  useEffect(() => {
    if (!isKiosk) return undefined;

    resetTimer();

    const events = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"];
    const onActivity = () => resetTimer();
    events.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true, capture: true })
    );

    const tick = setInterval(() => {
      if (isPaused()) {
        // Keep pushing the deadline forward while a send is in flight.
        resetTimer();
        return;
      }
      const msLeft = deadlineRef.current - Date.now();
      const secLeft = Math.ceil(msLeft / 1000);

      if (msLeft <= 0) {
        warningRef.current = false;
        setRemaining(null);
        if (cleanStateRef.current) {
          resetTimer(); // already clean — restart silently
        } else {
          resetKiosk();
          resetTimer();
        }
        return;
      }

      if (secLeft <= warningSeconds) {
        warningRef.current = true;
        setRemaining(secLeft);
      }
    }, 500);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }));
      clearInterval(tick);
    };
  }, [isKiosk, resetTimer, resetKiosk, isPaused]);

  if (!isKiosk || remaining === null) return null;

  return <IdleOverlay remaining={remaining} onStay={resetTimer} />;
}

function IdleOverlay({ remaining, onStay }) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-[850] flex flex-col items-center justify-center gap-8 bg-[#213B2F]/95 text-center px-8"
      onPointerDown={onStay}
    >
      <h2
        className="text-4xl md:text-5xl text-[#EDE5D8] leading-tight"
        style={{ fontFamily: "var(--font-alpina)" }}
      >
        {t("kiosk.idle.title")}
      </h2>
      <p className="font-sans text-lg text-[#D8DDB8]">
        {t("kiosk.idle.subtitle").replace("{seconds}", String(remaining))}
      </p>
      <button
        type="button"
        onClick={onStay}
        className="min-h-[56px] px-10 rounded-full bg-[#EDE5D8] font-sans text-lg font-semibold text-[#213B2F] hover:bg-white transition-colors"
      >
        {t("kiosk.idle.stay")}
      </button>
    </div>
  );
}
