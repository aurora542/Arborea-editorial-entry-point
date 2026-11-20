"use client";

import {
  createContext, useContext, useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { properties } from "@/data/properties";
import { KIOSK_CONFIG } from "@/lib/kioskConfig";
import { useCart } from "@/app/context/CartContext";
import { useI18n } from "@/app/context/I18nContext";

/*
 * Kiosk mode for the Casa Ceiba tablet, activated inside the same build by URL:
 *   /?kiosk=1&casa=casa-ceiba   → on, persisted in localStorage
 *   /?kiosk=0                   → off
 *   (no params)                 → read whatever was saved
 *
 * Static export: never read window/location/localStorage during render — all of it
 * happens in the mount effect. useSearchParams is avoided on purpose (it requires a
 * Suspense boundary in static export); we parse window.location.search instead.
 *
 * Outside kiosk mode, `isKiosk` is false and every kiosk surface no-ops, so the
 * public site behaves exactly as before.
 */

const KioskContext = createContext(null);

function readStored() {
  try {
    const raw = localStorage.getItem(KIOSK_CONFIG.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.casa && properties[parsed.casa] ? parsed : null;
  } catch {
    return null;
  }
}

export function KioskProvider({ children }) {
  const router = useRouter();
  const { clear, closeCart } = useCart();
  const { setLocale } = useI18n();

  const [casaSlug, setCasaSlug] = useState(null);
  const [ready, setReady] = useState(false);
  // Paused while a submission is in flight, so the idle timer can't reset mid-send.
  const pausedRef = useRef(false);

  const isKiosk = !!casaSlug;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kioskParam = params.get("kiosk");
    const casaParam = params.get("casa");

    let active = null;

    if (kioskParam === "0") {
      try {
        localStorage.removeItem(KIOSK_CONFIG.storageKey);
      } catch {
        /* ignore */
      }
      active = null;
    } else if (kioskParam === "1") {
      if (casaParam && properties[casaParam]) {
        active = { casa: casaParam };
        try {
          localStorage.setItem(KIOSK_CONFIG.storageKey, JSON.stringify(active));
        } catch {
          /* ignore — kiosk still works for this session */
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[kiosk] kiosk=1 sin casa válida (recibido: ${casaParam ?? "ninguna"}); modo kiosk no activado.`);
        active = readStored();
      }
    } else {
      active = readStored();
    }

    if (active?.casa) {
      setCasaSlug(active.casa);
      document.documentElement.classList.add("kiosk");
      window.dataLayer?.push({ event: "kiosk_session", kiosk_casa: active.casa });
    }

    setReady(true);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);
  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);
  const isPaused = useCallback(() => pausedRef.current, []);

  /* Full session reset — reused by the idle timeout and the success screens. */
  const resetKiosk = useCallback(() => {
    clear();
    closeCart();
    setLocale(KIOSK_CONFIG.defaultLocale);
    try {
      // Drop session drafts (arborea.cart.v1, etc.) but keep the kiosk flag,
      // which lives in localStorage, not sessionStorage.
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("arborea.")) keys.push(key);
      }
      keys.forEach((key) => sessionStorage.removeItem(key));
    } catch {
      /* ignore */
    }
    router.replace("/");
    window.scrollTo(0, 0);
  }, [clear, closeCart, setLocale, router]);

  const value = useMemo(
    () => ({
      isKiosk,
      casaSlug,
      casa: casaSlug ? properties[casaSlug] : null,
      ready,
      pause,
      resume,
      isPaused,
      resetKiosk,
    }),
    [isKiosk, casaSlug, ready, pause, resume, isPaused, resetKiosk]
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error("useKiosk must be used inside <KioskProvider>");
  return ctx;
}
