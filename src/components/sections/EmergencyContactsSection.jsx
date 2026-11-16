"use client";

import { useState, useMemo } from "react";
import {
  TbPhone, TbChevronDown, TbBrandWhatsapp, TbAlertTriangle,
  TbMapPin, TbStarFilled, TbShieldCheck, TbBuildingHospital,
} from "react-icons/tb";
import { useI18n } from "@/app/context/I18nContext";

/*
 * Emergency contacts — rebuilt around three UX principles common to safety /
 * first-aid interfaces (reviewed patterns from Red Cross apps, hotel concierge
 * safety screens, and Material/Human Interface emergency-screen guidance):
 *
 *   1) Tap-to-call is the primary action. Every phone number is a <a href=tel:>
 *      styled as an obvious button with a phone icon — not a text link. Tapping
 *      a card dials; there is no secondary step.
 *
 *   2) Hierarchy mirrors urgency. The 911/128/117 block lives at the top as a
 *      single high-contrast card. Hospitals come next with a short advisory,
 *      because that's what a non-local guest actually needs to figure out at
 *      3am. Doctors and non-urgent contacts come after.
 *
 *   3) Classify, don't just list. Public vs. private hospitals carry very
 *      different implications in Costa Rica (coverage, triage, cost). Both are
 *      tagged with a coloured pill and a top accent stripe so they're
 *      scannable in a stressed glance, and the advisory sits above them.
 *
 * The "nearest hospital" ribbon on Cortés is a direct client request — they
 * wanted that explicit because few guests know where Cortés is on the map.
 */

/* Split a value like "+506 2786-8198 / +506 2786-8148" into actionable numbers.
 * We dial the raw digits (no country-code assumptions) to avoid breaking
 * perfectly-formatted international numbers. */
function splitNumbers(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function telHref(phone) {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}

function waHref(phone) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

/* ─── reusable action pieces ────────────────────────────────────── */

function CallButton({ value, tone = "light", isWhatsApp = false, label }) {
  const numbers = splitNumbers(value);
  if (!numbers.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {numbers.map((n, i) => {
        const href = isWhatsApp ? waHref(n) : telHref(n);
        const Icon = isWhatsApp ? TbBrandWhatsapp : TbPhone;
        const toneClass = tone === "dark"
          ? "bg-white/10 border-white/20 text-[#EDE5D8] hover:bg-white/20"
          : "bg-white border-[#213B2F]/20 text-[#213B2F] hover:bg-[#213B2F]/5";
        return (
          <a
            key={i}
            href={href}
            target={isWhatsApp ? "_blank" : undefined}
            rel={isWhatsApp ? "noopener noreferrer" : undefined}
            aria-label={`${label || "Call"} ${n}`}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 font-sans text-sm font-semibold tabular-nums transition-colors ${toneClass}`}
          >
            <Icon size={15} className="shrink-0" />
            <span>{n}</span>
          </a>
        );
      })}
    </div>
  );
}

function RowActions({ rows, tone = "light", callLabel }) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, i) => {
        const l = (row.label || "").toLowerCase();
        const isWhatsApp = l.includes("whatsapp");
        return (
          <CallButton
            key={i}
            value={row.value}
            tone={tone}
            isWhatsApp={isWhatsApp}
            label={callLabel}
          />
        );
      })}
    </div>
  );
}

/* ─── cards ─────────────────────────────────────────────────────── */

function FeaturedCard({ title, subtitle, rows }) {
  return (
    <div className="bg-[#643C2D] rounded-2xl px-6 md:px-10 py-8 md:py-10 flex flex-col gap-6 md:flex-row md:items-start md:gap-12">
      <div className="flex items-start gap-4 flex-1">
        <span className="size-12 rounded-full bg-[#D8DDB8]/15 flex items-center justify-center shrink-0 mt-1">
          <TbAlertTriangle size={22} className="text-[#D8DDB8]" />
        </span>
        <div className="flex flex-col gap-2">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#D8DDB8]/55">
            24/7
          </p>
          <h3 className="font-sans font-semibold text-xl md:text-2xl text-[#EDE5D8] leading-snug">
            {title}
          </h3>
          {subtitle && (
            <p className="font-sans text-sm text-[#D8DDB8]/70 leading-relaxed max-w-md">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 w-full md:w-auto md:min-w-[18rem]">
        {(rows || []).map((row, i) => {
          const number = row.label.replace(":", "").trim();
          return (
            <a
              key={i}
              href={telHref(number)}
              aria-label={`Call ${number} — ${row.value}`}
              className="flex items-center gap-4 bg-white/8 hover:bg-white/15 transition-colors rounded-xl px-4 py-3 group"
            >
              <span className="min-w-[48px] px-2 py-1 rounded-lg bg-[#D8DDB8] text-[#213B2F] font-sans font-bold text-base text-center tabular-nums shrink-0">
                {number}
              </span>
              <span className="font-sans text-sm text-[#D8DDB8]/85 group-hover:text-[#EDE5D8] transition-colors leading-snug flex-1">
                {row.value}
              </span>
              <TbPhone size={16} className="text-[#D8DDB8]/60 group-hover:text-[#D8DDB8] transition-colors shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function HospitalCard({ title, subtitle, rows, type, isNearest, labels }) {
  const isPublic = type === "hospital-public";
  const accent = isPublic ? "#213B2F" : "#8B5A3C";
  const badgeLabel = isPublic ? labels.publicBadge : labels.privateBadge;

  return (
    <div className="relative bg-white rounded-2xl border border-[#213B2F]/12 overflow-hidden flex flex-col">
      {/* Top accent stripe — primary signal of public vs private */}
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />

      <div className="px-6 py-6 flex flex-col gap-5 flex-1">
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-widest text-[#EDE5D8]"
            style={{ backgroundColor: accent }}
          >
            {isPublic ? <TbShieldCheck size={11} /> : <TbBuildingHospital size={11} />}
            {badgeLabel}
          </span>
          {isNearest && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-sans text-[10px] font-bold uppercase tracking-widest bg-[#C9974F] text-[#222E2C]">
              <TbStarFilled size={11} />
              {labels.nearestBadge}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-sans font-semibold text-lg text-[#222E2C] leading-snug">
            {title}
          </h3>
          {subtitle && (
            <p className="font-sans text-sm text-[#222E2C]/60 leading-relaxed flex items-start gap-1.5">
              <TbMapPin size={14} className="shrink-0 mt-0.5 text-[#213B2F]/55" />
              <span>{subtitle}</span>
            </p>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-[#213B2F]/8">
          <RowActions rows={rows} callLabel={labels.callAction} />
        </div>
      </div>
    </div>
  );
}

function ContactCard({ title, subtitle, rows, labels }) {
  return (
    <div className="bg-white border border-[#213B2F]/12 rounded-2xl px-6 py-6 flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-1.5">
        <h3 className="font-sans font-semibold text-base text-[#222E2C] leading-snug">
          {title}
        </h3>
        {subtitle && (
          <p className="font-sans text-sm text-[#222E2C]/55 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      <div className="mt-auto pt-3 border-t border-[#213B2F]/8">
        <RowActions rows={rows} callLabel={labels.callAction} />
      </div>
    </div>
  );
}

function HospitalAdvisory({ text }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-2xl bg-[#C9974F]/12 border border-[#C9974F]/40 px-5 py-4"
    >
      <TbAlertTriangle size={18} className="shrink-0 mt-0.5 text-[#B8894F]" />
      <p className="font-sans text-sm text-[#222E2C]/75 leading-relaxed">
        {text}
      </p>
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-4 pt-2">
      <p className="font-sans text-xs font-bold text-[#213B2F] uppercase tracking-widest">
        {children}
      </p>
      <span className="flex-1 h-px bg-[#213B2F]/15" />
    </div>
  );
}

/* ─── main section ──────────────────────────────────────────────── */

export default function EmergencyContactsSection() {
  const { t } = useI18n();
  const contacts = t("emergency.contacts");
  const [expanded, setExpanded] = useState(false);

  const labels = useMemo(() => ({
    publicBadge: t("emergency.publicBadge"),
    privateBadge: t("emergency.privateBadge"),
    nearestBadge: t("emergency.nearestBadge"),
    callAction: t("emergency.callAction"),
  }), [t]);

  /* Group by type. The first `featured` entry is the big emergency card; the
   * rest flow into themed sections. */
  const { featured, hospitals, medical, other } = useMemo(() => {
    if (!Array.isArray(contacts)) return { featured: null, hospitals: [], medical: [], other: [] };
    const out = { featured: null, hospitals: [], medical: [], other: [] };
    for (const c of contacts) {
      if (c.type === "featured" || (!out.featured && !c.type)) {
        if (!out.featured) out.featured = c;
      } else if (c.type === "hospital-public" || c.type === "hospital-private") {
        out.hospitals.push(c);
      } else if (c.type === "medical") {
        out.medical.push(c);
      } else {
        out.other.push(c);
      }
    }
    /* Public hospitals first — the advisory above tells guests to prefer them,
     * so the visual order has to match that recommendation. */
    out.hospitals.sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === "hospital-public" ? -1 : 1;
    });
    return out;
  }, [contacts]);

  return (
    <section id="emergencias" className="flex flex-col px-8 md:px-16 pb-24 gap-10 scroll-mt-24">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6" data-aos="fade-up">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 w-fit border border-[#222E2C]/20 rounded-full px-3 py-1.5">
            <TbPhone size={14} className="text-[#222E2C]/60" />
            <span className="font-sans text-xs text-[#222E2C]/60 tracking-wide">
              {t("emergency.pill")}
            </span>
          </div>
          <h2
            className="text-4xl md:text-5xl text-[#222E2C] tracking-tight leading-tight"
            style={{ fontFamily: "var(--font-alpina)" }}
          >
            {t("emergency.title")}
          </h2>
        </div>
        <p className="font-sans text-base text-[#222E2C]/55 leading-relaxed max-w-lg">
          {t("emergency.description")}
        </p>
      </div>

      {/* 1. Featured — 911 block */}
      {featured && <FeaturedCard {...featured} />}

      {/* 2. Hospitals */}
      {hospitals.length > 0 && (
        <div className="flex flex-col gap-5">
          <SectionHeading>{t("emergency.hospitalsHeading")}</SectionHeading>
          <HospitalAdvisory text={t("emergency.hospitalAdvisory")} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hospitals.map((h, i) => (
              <HospitalCard key={i} {...h} labels={labels} />
            ))}
          </div>
        </div>
      )}

      {/* 3. Medical Help */}
      {medical.length > 0 && (
        <div className="flex flex-col gap-5">
          <SectionHeading>{t("emergency.medicalHeading")}</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {medical.map((c, i) => (
              <ContactCard key={i} {...c} labels={labels} />
            ))}
          </div>
        </div>
      )}

      {/* 4. Other (collapsible) */}
      {other.length > 0 && (
        <div className="flex flex-col gap-5">
          <SectionHeading>{t("emergency.otherHeading")}</SectionHeading>
          <div className="relative">
            <div
              className="overflow-hidden transition-all duration-700 ease-in-out"
              style={{ maxHeight: expanded ? "3000px" : "150px" }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {other.map((c, i) => (
                  <ContactCard key={i} {...c} labels={labels} />
                ))}
              </div>
            </div>
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-4 transition-opacity duration-500 pointer-events-none"
              style={{
                height: expanded ? 0 : "160px",
                opacity: expanded ? 0 : 1,
                background: "linear-gradient(to bottom, transparent 0%, rgba(237,229,216,0.8) 50%, #EDE5D8 85%)",
              }}
            >
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="pointer-events-auto flex items-center gap-2 px-6 py-3 rounded-full bg-[#213B2F] font-sans font-semibold text-sm text-[#D8DDB8] shadow-lg hover:bg-[#213B2F]/90 transition-colors"
              >
                {t("emergency.seeMore")}
                <TbChevronDown size={16} />
              </button>
            </div>
          </div>
          {expanded && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#222E2C]/25 font-sans text-sm font-medium text-[#222E2C]/65 hover:text-[#222E2C] hover:border-[#222E2C]/50 transition-colors"
              >
                {t("emergency.seeLess")}
                <TbChevronDown size={16} className="rotate-180" />
              </button>
            </div>
          )}
        </div>
      )}

    </section>
  );
}
