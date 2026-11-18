"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TbArrowLeft, TbSparkles, TbBasket, TbBolt, TbBug, TbClock, TbMapPin, TbMessage, TbWifi,
} from "react-icons/tb";
import QRCode from "qrcode";
import { useKiosk } from "@/app/context/KioskContext";
import { useI18n } from "@/app/context/I18nContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { KIOSK_CONFIG } from "@/lib/kioskConfig";
import { buildRequestPayload } from "@/lib/orderPayload";
import { submitRequest } from "@/lib/orderApi";
import { isOfficeHours } from "@/lib/officeHours";
import SuccessScreen from "@/components/checkout/SuccessScreen";

/*
 * Quick guest requests, kiosk only. Grid of category cards + a full-width "free
 * message" card; tapping one opens a small form (detail, name, WhatsApp). Name and
 * WhatsApp are remembered for the session in sessionStorage under an `arborea.`
 * key, so resetKiosk's sweep clears them.
 */

const GUEST_KEY = "arborea.kiosk.guest";

const CATEGORY_ICONS = {
  cleaning: TbSparkles,
  amenities: TbBasket,
  electricity: TbBolt,
  wildlife: TbBug,
  checkout: TbClock,
  concierge: TbMapPin,
  message: TbMessage,
};

function readGuest() {
  try {
    return JSON.parse(sessionStorage.getItem(GUEST_KEY)) || {};
  } catch {
    return {};
  }
}

export default function RequestsPage() {
  const { isKiosk, casaSlug, ready, pause, resume } = useKiosk();
  const { t, locale } = useI18n();
  const router = useRouter();

  // Non-kiosk guard: short notice + link home.
  if (ready && !isKiosk) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-5 text-center px-8">
        <p className="font-sans text-lg text-[#222E2C]/70 max-w-md leading-relaxed">
          {t("kiosk.requests.notKiosk")}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full bg-[#213B2F] font-sans text-sm font-medium text-[#D8DDB8]"
        >
          <TbArrowLeft size={16} />
          {t("common.back")}
        </Link>
      </main>
    );
  }

  if (!ready) return <main className="min-h-screen" />;

  return (
    <RequestsKiosk
      casaSlug={casaSlug}
      t={t}
      locale={locale}
      router={router}
      pause={pause}
      resume={resume}
    />
  );
}

function RequestsKiosk({ casaSlug, t, locale, router, pause, resume }) {
  const online = useOnlineStatus();
  const [active, setActive] = useState(null); // active category id, or null = grid
  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [responseKind, setResponseKind] = useState(null);
  const submissionIdRef = useRef(null);

  const categories = [...KIOSK_CONFIG.requestCategories, "message"];

  const openCategory = (id) => {
    submissionIdRef.current = null;
    setStatus("idle");
    setActive(id);
  };

  const handleSubmit = async ({ name, phone, message }) => {
    if (status === "sending") return;
    if (!submissionIdRef.current) submissionIdRef.current = crypto.randomUUID();

    // Remember name/phone for the session.
    try {
      sessionStorage.setItem(GUEST_KEY, JSON.stringify({ name, phone }));
    } catch {
      /* ignore */
    }

    setStatus("sending");
    pause?.();
    const payload = buildRequestPayload({
      category: active,
      message,
      guest: { name, phone, casa: casaSlug },
      locale,
      submissionId: submissionIdRef.current,
    });
    const result = await submitRequest(payload);
    resume?.();

    if (result?.ok) {
      setResponseKind(isOfficeHours() ? "office" : "after");
      setStatus("success");
    } else {
      setStatus("error");
    }
  };

  if (status === "success") {
    return <SuccessScreen type="request" responseKind={responseKind} />;
  }

  if (active) {
    return (
      <RequestForm
        category={active}
        t={t}
        online={online}
        status={status}
        onBack={() => setActive(null)}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <main className="min-h-screen pt-10 px-6 pb-8">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="flex items-center gap-1.5 mb-4 font-sans text-sm font-medium text-[#222E2C]/50"
      >
        <TbArrowLeft size={16} />
        {t("common.back")}
      </button>

      <h1
        className="text-4xl text-[#213B2F] leading-tight mb-2"
        style={{ fontFamily: "var(--font-alpina)" }}
      >
        {t("kiosk.requests.title")}
      </h1>
      <p className="font-sans text-sm text-[#222E2C]/55 mb-6">
        {t("kiosk.requests.hours")
          .replace("{start}", `${KIOSK_CONFIG.officeHours.start}:00`)
          .replace("{end}", `${KIOSK_CONFIG.officeHours.end}:00`)}
      </p>

      <div className="grid grid-cols-2 gap-4">
        {categories.map((id) => {
          const Icon = CATEGORY_ICONS[id] || TbMessage;
          const full = id === "message";
          return (
            <button
              key={id}
              type="button"
              onClick={() => openCategory(id)}
              className={`${full ? "col-span-2" : ""} min-h-[120px] rounded-2xl bg-white/60 border border-[#222E2C]/8 flex flex-col items-center justify-center gap-3 p-5 text-center hover:bg-white/80 active:bg-white transition-colors`}
            >
              <span className="size-12 rounded-full bg-[#213B2F] flex items-center justify-center">
                <Icon size={24} className="text-[#D8DDB8]" />
              </span>
              <span className="font-sans text-sm font-semibold text-[#222E2C] leading-snug">
                {t(`kiosk.requests.categories.${id}`)}
              </span>
            </button>
          );
        })}
      </div>

      <WhatsAppBackup casaSlug={casaSlug} t={t} />
    </main>
  );
}

function RequestForm({ category, t, online, status, onBack, onSubmit }) {
  const saved = typeof window !== "undefined" ? readGuest() : {};
  const [name, setName] = useState(saved.name || "");
  const [phone, setPhone] = useState(saved.phone || "");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);

  const isMessage = category === "message";
  const messageRequired = isMessage;
  const valid = name.trim() && (!messageRequired || message.trim());

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit({ name: name.trim(), phone: phone.trim(), message: message.trim() });
  };

  const inputClass =
    "w-full min-h-[48px] rounded-xl border border-[#222E2C]/15 bg-white/70 px-4 font-sans text-sm text-[#222E2C] placeholder:text-[#222E2C]/35 focus:outline-none focus:border-[#213B2F] disabled:opacity-50";
  const labelClass =
    "font-sans text-xs font-semibold uppercase tracking-wide text-[#222E2C]/50 mb-1.5 block";

  return (
    <main className="min-h-screen pt-10 px-6 pb-8">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 mb-4 font-sans text-sm font-medium text-[#222E2C]/50"
      >
        <TbArrowLeft size={16} />
        {t("common.back")}
      </button>

      <h1
        className="text-3xl text-[#213B2F] leading-tight mb-6"
        style={{ fontFamily: "var(--font-alpina)" }}
      >
        {t(`kiosk.requests.categories.${category}`)}
      </h1>

      <form onSubmit={submit} className="flex flex-col gap-4 max-w-lg">
        <div>
          <label className={labelClass} htmlFor="req-detail">
            {isMessage ? t("kiosk.requests.messageLabel") : t("kiosk.requests.detailLabel")}
          </label>
          <textarea
            id="req-detail"
            rows={4}
            className={`${inputClass} py-3 resize-none`}
            disabled={status === "sending"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {touched && messageRequired && !message.trim() && (
            <p className="font-sans text-xs text-red-700 mt-1">{t("guestForm.required")}</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="req-name">
            {t("guestForm.name")}
          </label>
          <input
            id="req-name"
            className={inputClass}
            disabled={status === "sending"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {touched && !name.trim() && (
            <p className="font-sans text-xs text-red-700 mt-1">{t("guestForm.required")}</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="req-phone">
            {t("guestForm.whatsappOptional")}
          </label>
          <input
            id="req-phone"
            className={inputClass}
            disabled={status === "sending"}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {status === "error" && (
          <p className="font-sans text-sm text-red-700">{t("checkout.error")}</p>
        )}
        {!online && <p className="font-sans text-sm text-[#5C3324]">{t("checkout.offline")}</p>}

        <button
          type="submit"
          disabled={status === "sending" || !online}
          className="min-h-[52px] rounded-full bg-[#213B2F] font-sans text-base font-semibold text-[#D8DDB8] hover:bg-[#213B2F]/90 transition-colors disabled:opacity-50"
        >
          {status === "sending"
            ? t("checkout.sending")
            : status === "error"
            ? t("checkout.retry")
            : t("kiosk.requests.send")}
        </button>
      </form>
    </main>
  );
}

function WhatsAppBackup({ casaSlug, t }) {
  const [svg, setSvg] = useState("");
  const casaName = casaSlug ? casaSlug.replace(/-/g, " ") : "";
  const text = encodeURIComponent(t("kiosk.requests.waText").replace("{casa}", casaName));
  const url = `https://wa.me/${KIOSK_CONFIG.frontDeskWhatsapp}?text=${text}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: "svg", margin: 1, width: 160 })
      .then((out) => !cancelled && setSvg(out))
      .catch(() => !cancelled && setSvg(""));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="mt-6 rounded-2xl bg-[#213B2F] px-6 py-5 flex items-center gap-5">
      <div className="flex-1">
        <p className="font-sans text-sm font-semibold text-[#EDE5D8] mb-1 flex items-center gap-2">
          <TbWifi size={18} />
          {t("kiosk.requests.waTitle")}
        </p>
        <p className="font-sans text-xs text-[#D8DDB8]/70 leading-relaxed">
          {t("kiosk.requests.waHint")}
        </p>
      </div>
      {svg ? (
        <div
          className="size-24 bg-white rounded-xl p-2 shrink-0 [&>svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="size-24 bg-white/90 rounded-xl shrink-0 animate-pulse" />
      )}
    </div>
  );
}
