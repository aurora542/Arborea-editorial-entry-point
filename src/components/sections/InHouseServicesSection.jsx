"use client";

import { TbPhoto, TbArrowRight, TbHandClick, TbAdjustments, TbShoppingCart, TbCirclePlus, TbSend } from "react-icons/tb";
import { useI18n } from "@/app/context/I18nContext";
import Link from "next/link";

const STEP_ICONS = [TbHandClick, TbAdjustments, TbShoppingCart, TbCirclePlus, TbSend];

const CARD_PALETTE = [
  { bg: "#8B5A3C", dark: false }, // Spa — warm clay
  { bg: "#213B2F", dark: false }, // Chef — deep forest green
  { bg: "#5C3324", dark: false }, // Full Fridge — deep sienna
  { bg: "#6B5A2E", dark: false }, // Fishing — olive brown
];

function ServiceCard({ category, title, description, image, href, cta, palette }) {
  const fg       = palette.dark ? "#222E2C" : "#ffffff";
  const fgMuted  = palette.dark ? "rgba(34,46,44,0.55)" : "rgba(255,255,255,0.60)";
  const content = (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full transition-opacity duration-200 hover:opacity-95" style={{ backgroundColor: palette.bg }}>
      <div className="h-72 flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.08)" }}>
        {image ? (
          <img src={image} alt={title} className="w-full h-full object-cover" />
        ) : (
          <TbPhoto size={26} style={{ color: fgMuted }} />
        )}
      </div>
      <div className="px-6 py-6 flex flex-col gap-3 flex-1">
        <div className="flex flex-col gap-1.5">
          <p className="font-sans font-semibold text-sm" style={{ color: fgMuted }}>{category}</p>
          <p className="font-sans font-medium text-lg" style={{ color: fg }}>{title}</p>
        </div>
        <p className="font-sans text-sm leading-relaxed" style={{ color: fgMuted }}>{description}</p>
        {href && cta && (
          <div className="pt-2 mt-auto">
            <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-sm" style={{ color: fg }}>
              {cta}
              <TbArrowRight size={15} />
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="h-full">{content}</Link>;
  }
  return content;
}

export default function InHouseServicesSection() {
  const { t } = useI18n();
  const services = t("inhouse.services");

  const steps = t("inhouse.craftSteps");

  return (
    <section id="experiences" className="flex flex-col px-8 md:px-16 pb-24 gap-16 scroll-mt-24">

      {/* Craft intro + steps.
       *
       * Hierarchy here is built with typographic scale — not with new container
       * primitives. The entire site already uses flat cards, forest-green
       * accents and tight eyebrows; the "how to book" pattern on the service
       * pages (WellnessSpaPage, FishingToursPage, etc.) is the established
       * vocabulary for a 4–5-step guide. We reuse it literally here so the
       * home's onboarding reads as the SAME idea the guest will see again on
       * every service page they visit.
       *
       * Levels of emphasis, loudest → softest:
       *   1. Alpina h2 title
       *   2. Larger body paragraph (text-lg on md)
       *   3. Small uppercase eyebrow sitting above the title
       *   4. Card titles (base, medium weight)
       *   5. Step eyebrow inside each card (10px uppercase, with icon)
       */}
      {/* Centered hero-style onboarding block.
       *
       * The eyebrow "How it works" sits inside the same horizontal-rule
       * framing that the fishing-tours closing quote already uses (see
       * FishingToursPage: `<div className="w-10 h-px bg-[#213B2F]/25" />`)
       * — that bar-TITLE-bar pattern is established brand vocabulary for
       * chapter-marker labels, so we reuse it instead of inventing a pill.
       *
       * Each step card centers its own content so the whole block reads as a
       * single symmetrical unit on desktop, and collapses naturally on mobile. */}
      <div className="flex flex-col gap-12" data-aos="fade-up">
        <div className="flex flex-col items-center text-center gap-5 max-w-3xl mx-auto">
          <div className="flex items-center gap-4">
            <span aria-hidden className="h-px w-10 bg-[#213B2F]/35" />
            <p className="font-sans text-sm font-bold text-[#213B2F] uppercase tracking-widest">
              {t("inhouse.craftEyebrow")}
            </p>
            <span aria-hidden className="h-px w-10 bg-[#213B2F]/35" />
          </div>
          <h2
            className="text-5xl md:text-6xl text-[#222E2C] tracking-tight leading-[1.05]"
            style={{ fontFamily: "var(--font-alpina)" }}
          >
            {t("inhouse.craftTitle")}
          </h2>
          <p className="font-sans text-lg md:text-xl text-[#222E2C]/65 leading-relaxed">
            {t("inhouse.craftDescription")}
          </p>
        </div>

        {Array.isArray(steps) && (
          <div className="flex flex-col sm:flex-row gap-3">
            {steps.map((step, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center text-center gap-3 bg-white rounded-2xl px-5 py-7 border border-[#213B2F]/8"
                >
                  <div className="size-10 rounded-full bg-[#213B2F] flex items-center justify-center shrink-0">
                    <Icon size={17} className="text-[#D8DDB8]" />
                  </div>
                  <span className="font-sans text-xs font-semibold text-[#222E2C]/40 uppercase tracking-widest">
                    Step {i + 1}
                  </span>
                  <p className="font-sans text-base font-medium text-[#222E2C] leading-snug">
                    {step}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Signature Experiences title */}
      <h2
        className="text-4xl md:text-5xl text-[#222E2C] tracking-tight leading-tight"
        style={{ fontFamily: "var(--font-alpina)" }}
        data-aos="fade-up"
      >
        {t("inhouse.title")}
      </h2>

      {/* Cards */}
      {Array.isArray(services) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {services.map((svc, i) => (
            <ServiceCard key={i} {...svc} palette={CARD_PALETTE[i % CARD_PALETTE.length]} />
          ))}
        </div>
      )}

    </section>
  );
}
