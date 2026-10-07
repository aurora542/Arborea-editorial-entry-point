"use client";

import Link from "next/link";
import { TbHome, TbBellRinging, TbHomeHeart, TbLanguage } from "react-icons/tb";
import { useKiosk } from "@/app/context/KioskContext";
import { useI18n } from "@/app/context/I18nContext";

/*
 * Fixed bottom bar, kiosk only. Four large touch targets (≥48px). Respects the
 * safe-area inset; body gets matching padding-bottom in globals.css.
 */
export default function KioskBar() {
  const { isKiosk, casaSlug } = useKiosk();
  const { t, toggleLocale, locale } = useI18n();

  if (!isKiosk) return null;

  const itemClass =
    "flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 text-[#EDE5D8] font-sans text-xs font-medium transition-colors hover:bg-[#EDE5D8]/10 active:bg-[#EDE5D8]/15";

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[750] flex items-stretch bg-[#213B2F] border-t border-[#EDE5D8]/10"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Link href="/" className={itemClass}>
        <TbHome size={24} />
        {t("kiosk.bar.home")}
      </Link>
      <Link href="/solicitudes/" className={itemClass}>
        <TbBellRinging size={24} />
        {t("kiosk.bar.requests")}
      </Link>
      <Link href={`/${casaSlug}/`} className={itemClass}>
        <TbHomeHeart size={24} />
        {t("kiosk.bar.yourHome")}
      </Link>
      <button type="button" onClick={toggleLocale} className={itemClass}>
        <TbLanguage size={24} />
        {locale === "es" ? "EN" : "ES"}
      </button>
    </nav>
  );
}
