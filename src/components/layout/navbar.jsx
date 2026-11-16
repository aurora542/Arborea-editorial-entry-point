"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/app/context/I18nContext";
import { useCart } from "@/app/context/CartContext";
import { SERVICES } from "@/data/services";
import { TbChevronDown, TbChevronRight, TbShoppingBag } from "react-icons/tb";

/* Links that drive both the desktop nav and the mobile hamburger. Absolute
 * hrefs (/#…) so the same link works from subpages like /fishing-tours/. */
const NAV_LINKS = [
  { key: "houses",      href: "/#casas" },
  { key: "tours",       href: "/#tours" },
  { key: "goodToKnow",  href: "/#bueno-saber" },
  { key: "emergencias", href: "/#emergencias" },
];

/* Order of signature experiences shown in the Experiences dropdown and in the
 * mobile hamburger's experience list. Driven off SERVICES so ids/labels/route
 * stay in one place. */
const SIGNATURE_IDS = ["private-chef", "full-fridge", "wellness-spa", "fishing-tours"];

export default function Navbar() {
  const { locale, toggleLocale, t } = useI18n();
  const { lineCount, openCart, hydrated } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [lastY, setLastY] = useState(0);
  const [expOpen, setExpOpen] = useState(false);
  const expRef = useRef(null);

  const signatureServices = SIGNATURE_IDS
    .map((id) => SERVICES[id])
    .filter(Boolean);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setVisible(y < lastY || y < 80);
      setLastY(y);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lastY]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setExpOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  /* Close the experiences dropdown when the guest clicks elsewhere. */
  useEffect(() => {
    if (!expOpen) return;
    const onMouseDown = (e) => {
      if (expRef.current && !expRef.current.contains(e.target)) setExpOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [expOpen]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 w-full z-40 flex items-center justify-between px-6 md:px-10 lg:px-14 py-4 transition-transform duration-300 pointer-events-none ${
          visible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        {/* Left: logo + language */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <Link href="/" className="inline-block bg-[#E0D4C4] p-2 rounded-xl hover:bg-[#E0D4C4]/80 transition-colors">
            <object
              type="image/svg+xml"
              data="/assets/logos/LogoNavbar.svg"
              width={142}
              height={55}
              aria-label="Arborea Experiences"
              className="pointer-events-none"
            />
          </Link>

          <button
            onClick={toggleLocale}
            className="flex items-center gap-1.5 bg-[#213B2F] rounded-xl px-3.5 py-2 font-sans text-xs lg:text-sm font-semibold text-[#D8DDB8] hover:bg-[#213B2F]/80 transition-colors"
            aria-label="Switch language"
          >
            <span className={locale === "en" ? "opacity-100" : "opacity-40"}>EN</span>
            <span className="opacity-30 select-none">|</span>
            <span className={locale === "es" ? "opacity-100" : "opacity-40"}>ES</span>
          </button>
        </div>

        {/* Desktop nav — visible from lg:, replaces the hamburger as the primary
         * navigation. The hamburger remains as the mobile-only entry point. */}
        <nav
          className="hidden xl:flex items-center gap-1 pointer-events-auto bg-[#EDE5D8]/92 backdrop-blur-sm border border-[#213B2F]/10 rounded-full px-2 py-1.5 shadow-sm"
          aria-label={t("nav.open")}
        >
          {/* Experiences dropdown */}
          <div className="relative" ref={expRef}>
            <button
              type="button"
              onClick={() => setExpOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={expOpen}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium transition-colors ${
                expOpen
                  ? "bg-[#213B2F] text-[#D8DDB8]"
                  : "text-[#213B2F] hover:bg-[#213B2F]/8"
              }`}
            >
              {t("nav.experiences")}
              <TbChevronDown
                size={14}
                className={`transition-transform duration-200 ${expOpen ? "rotate-180" : ""}`}
              />
            </button>

            {expOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 mt-3 w-80 bg-[#EDE5D8] border border-[#213B2F]/15 rounded-2xl shadow-xl p-3 flex flex-col gap-1"
              >
                <div className="px-3 pt-2 pb-3 border-b border-[#213B2F]/10 mb-1">
                  <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[#213B2F]/50">
                    {t("nav.experiencesSubheading")}
                  </p>
                  <p
                    className="font-sans font-semibold text-base text-[#213B2F] mt-0.5"
                    style={{ fontFamily: "var(--font-alpina)" }}
                  >
                    {t("nav.experiencesHeading")}
                  </p>
                </div>

                {signatureServices.map((svc) => {
                  const Icon = svc.icon;
                  return (
                    <Link
                      key={svc.id}
                      href={svc.href}
                      onClick={() => setExpOpen(false)}
                      role="menuitem"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#213B2F]/6 transition-colors group"
                    >
                      <span
                        className="size-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
                        style={{ backgroundColor: svc.color }}
                      >
                        <Icon size={16} className="text-[#EDE5D8]" />
                      </span>
                      <span className="font-sans font-medium text-sm text-[#213B2F] flex-1">
                        {t(svc.labelKey)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Other navigation entries */}
          {NAV_LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="px-4 py-2 rounded-full font-sans text-sm font-medium text-[#213B2F] hover:bg-[#213B2F]/8 transition-colors whitespace-nowrap"
            >
              {t(`nav.links.${link.key}`)}
            </Link>
          ))}

          {/* Cart pill — owned by the desktop nav from lg: upward so it never
           * collides with the horizontal nav row. The floating CartButton is
           * hidden on lg: for the same reason. */}
          <button
            type="button"
            onClick={openCart}
            aria-label={
              lineCount > 0
                ? `${t("cart.open")} — ${lineCount} ${lineCount === 1 ? t("cart.itemsOne") : t("cart.itemsMany")}`
                : t("cart.open")
            }
            className="relative flex items-center gap-2 ml-1 px-3.5 py-2 rounded-full bg-[#213B2F] text-[#D8DDB8] font-sans text-sm font-semibold hover:bg-[#213B2F]/90 transition-colors shadow-sm"
          >
            <TbShoppingBag size={16} />
            <span>{t("cart.open")}</span>
            {hydrated && lineCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#D8DDB8] flex items-center justify-center font-sans text-[10px] font-bold text-[#213B2F] tabular-nums">
                {lineCount}
              </span>
            )}
          </button>
        </nav>
      </header>

      {/* Mobile hamburger — hidden from lg: up since the desktop nav takes
       * over. Below lg: this is the only nav surface. */}
      <nav
        data-navigation-status={isOpen ? "active" : "not-active"}
        className="navigation xl:hidden"
        aria-label="Menú principal"
      >
        <div
          data-navigation-toggle="close"
          className="navigation__dark-bg"
          onClick={() => setIsOpen(false)}
        />

        <div className="hamburger-nav">
          <div className="hamburger-nav__bg" />

          {/* Mobile menu panel.
           *
           * The Osmo shell (`.hamburger-nav`, `.hamburger-nav__bg`,
           * `.hamburger-nav__group`) owns the scale/fade animation; everything
           * below is plain content that sizes itself. The width is capped so it
           * never overflows narrow viewports once combined with the shell's
           * ~4.5em of internal padding.
           *
           * Order mirrors a guest's decision flow:
           *   1) Signature experiences (the headliners, color-coded per svc)
           *   2) Menu links (secondary nav)
           *   3) Language picker as a two-button segmented control at the end
           */}
          <div className="hamburger-nav__group">
            <div className="w-[17rem] max-w-[calc(100vw-7rem)] max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain flex flex-col gap-6 pr-1">

              {/* Signature Experiences */}
              <div className="flex flex-col gap-2.5">
                <p className="font-sans text-[10px] font-bold text-[#213B2F] uppercase tracking-widest">
                  {t("nav.experiencesHeading")}
                </p>
                <ul className="flex flex-col gap-2 list-none p-0 m-0">
                  {signatureServices.map((svc) => {
                    const Icon = svc.icon;
                    return (
                      <li key={svc.id}>
                        <Link
                          href={svc.href}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-3 bg-white/70 hover:bg-white rounded-xl pl-3 pr-3 py-2.5 border-l-[3px] transition-colors group"
                          style={{ borderLeftColor: svc.color }}
                        >
                          <span
                            className="size-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: svc.color }}
                          >
                            <Icon size={16} className="text-[#EDE5D8]" />
                          </span>
                          <span className="flex-1 font-sans font-medium text-sm text-[#222E2C] leading-tight">
                            {t(svc.labelKey)}
                          </span>
                          <TbChevronRight
                            size={14}
                            className="shrink-0 text-[#222E2C]/30 group-hover:text-[#222E2C]/55 transition-colors"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Menu */}
              <div className="flex flex-col gap-1">
                <p className="font-sans text-[10px] font-bold text-[#213B2F] uppercase tracking-widest mb-1.5">
                  Menu
                </p>
                <ul className="flex flex-col list-none p-0 m-0">
                  {NAV_LINKS.map((link) => (
                    <li key={link.key} className="border-b border-[#213B2F]/10 last:border-b-0">
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center justify-between py-2.5 group"
                      >
                        <span className="font-sans text-base text-[#222E2C] group-hover:text-[#213B2F] transition-colors">
                          {t(`nav.links.${link.key}`)}
                        </span>
                        <TbChevronRight
                          size={14}
                          className="shrink-0 text-[#222E2C]/25 group-hover:text-[#222E2C]/55 transition-colors"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Language — segmented EN|ES, side by side, at the end */}
              <div className="flex flex-col gap-2 pt-2">
                <p className="font-sans text-[10px] font-bold text-[#213B2F] uppercase tracking-widest">
                  {locale === "es" ? "Idioma" : "Language"}
                </p>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#213B2F]/8 w-full">
                  {["en", "es"].map((code) => {
                    const active = locale === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => { if (!active) toggleLocale(); }}
                        className={`py-2 rounded-lg font-sans text-sm font-semibold transition-colors ${
                          active
                            ? "bg-[#213B2F] text-[#D8DDB8] shadow-sm"
                            : "text-[#213B2F]/55 hover:text-[#213B2F]"
                        }`}
                      >
                        {code.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          <button
            className="hamburger-nav__toggle"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? t("nav.close") : t("nav.open")}
            aria-expanded={isOpen}
          >
            <div className="hamburger-nav__toggle-bar" />
            <div className="hamburger-nav__toggle-bar" />
          </button>
        </div>
      </nav>
    </>
  );
}
