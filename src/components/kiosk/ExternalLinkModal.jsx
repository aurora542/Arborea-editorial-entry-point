"use client";

import { useState, useEffect } from "react";
import { TbX } from "react-icons/tb";
import QRCode from "qrcode";
import { useI18n } from "@/app/context/I18nContext";

/*
 * Shows a QR of an external link so the guest scans it with their own phone — the
 * kiosk never navigates away. Reused by KioskLinkGuard (T6) and the after-hours
 * message (T13).
 *
 * `href` is the raw link. `kind` tunes the copy: "whatsapp" | "tel" | "external".
 * For tel: the number is also shown large, since a QR of a tel: link is awkward.
 */
export default function ExternalLinkModal({ href, kind = "external", onClose }) {
  const { t } = useI18n();
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(href, { type: "svg", margin: 1, width: 320 })
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [href]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title =
    kind === "whatsapp"
      ? t("kiosk.externalModal.whatsappTitle")
      : kind === "tel"
      ? t("kiosk.externalModal.telTitle")
      : t("kiosk.externalModal.title");

  const telNumber = kind === "tel" ? href.replace(/^tel:/, "") : null;

  return (
    <div
      className="fixed inset-0 z-[800] flex items-center justify-center bg-[#222E2C]/70 p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-[#EDE5D8] px-8 py-10 flex flex-col items-center text-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("kiosk.externalModal.close")}
          className="absolute top-4 right-4 size-12 rounded-full flex items-center justify-center text-[#222E2C]/50 hover:bg-[#222E2C]/8 transition-colors"
        >
          <TbX size={22} />
        </button>

        <h2
          className="text-2xl text-[#213B2F] leading-tight"
          style={{ fontFamily: "var(--font-alpina)" }}
        >
          {title}
        </h2>

        {svg ? (
          <div
            className="size-56 bg-white rounded-2xl p-3 [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="size-56 bg-white rounded-2xl animate-pulse" />
        )}

        {telNumber && (
          <p className="font-sans text-3xl font-bold text-[#222E2C] tabular-nums tracking-wide">
            {telNumber}
          </p>
        )}

        <p className="font-sans text-sm text-[#222E2C]/60 leading-relaxed">
          {t("kiosk.externalModal.scanHint")}
        </p>
      </div>
    </div>
  );
}
