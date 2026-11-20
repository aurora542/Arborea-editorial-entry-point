"use client";

import { TbWifiOff } from "react-icons/tb";
import { useKiosk } from "@/app/context/KioskContext";
import { useI18n } from "@/app/context/I18nContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/* Discreet top banner shown only in kiosk mode while the tablet is offline.
 * Clears itself when the network returns. */
export default function OfflineBanner() {
  const { isKiosk } = useKiosk();
  const { t } = useI18n();
  const online = useOnlineStatus();

  if (!isKiosk || online) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[700] flex items-center justify-center gap-2 bg-[#5C3324] text-[#EDE5D8] px-4 py-2 font-sans text-sm font-medium"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <TbWifiOff size={16} />
      {t("kiosk.offline.banner")}
    </div>
  );
}
