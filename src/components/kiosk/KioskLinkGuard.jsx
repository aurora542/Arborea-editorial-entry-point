"use client";

import { useState, useEffect, useCallback } from "react";
import { useKiosk } from "@/app/context/KioskContext";
import ExternalLinkModal from "@/components/kiosk/ExternalLinkModal";

/*
 * In kiosk mode, any link that would leave the app (WhatsApp, tel:, mailto:, or a
 * foreign origin like Google Maps) is caught here and shown as a QR instead. This
 * keeps the eight components that hold those links untouched — the interception is
 * global.
 */

function classify(href) {
  if (!href) return null;
  if (href.startsWith("https://wa.me") || href.startsWith("https://api.whatsapp.com")) {
    return { kind: "whatsapp", href };
  }
  if (href.startsWith("tel:")) return { kind: "tel", href };
  if (href.startsWith("mailto:")) return { kind: "external", href };
  // Absolute URL to a different origin → external.
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return { kind: "external", href: url.href };
  } catch {
    /* relative/in-app link — allow */
  }
  return null;
}

export default function KioskLinkGuard() {
  const { isKiosk } = useKiosk();
  const [modal, setModal] = useState(null);

  const open = useCallback((info) => setModal(info), []);
  const close = useCallback(() => setModal(null), []);

  useEffect(() => {
    if (!isKiosk) return undefined;

    const onClick = (e) => {
      const anchor = e.target.closest?.("a[href]");
      if (!anchor) return;
      const info = classify(anchor.getAttribute("href"));
      if (!info) return;
      e.preventDefault();
      e.stopPropagation();
      open(info);
    };

    document.addEventListener("click", onClick, true);

    // Also funnel window.open through the same modal.
    const originalOpen = window.open;
    window.open = function guardedOpen(url, ...rest) {
      const info = classify(typeof url === "string" ? url : "");
      if (info) {
        open(info);
        return null;
      }
      return originalOpen.call(window, url, ...rest);
    };

    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = originalOpen;
    };
  }, [isKiosk, open]);

  if (!isKiosk || !modal) return null;

  return <ExternalLinkModal href={modal.href} kind={modal.kind} onClose={close} />;
}
