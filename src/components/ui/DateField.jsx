"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { TbCalendarEvent, TbChevronLeft, TbChevronRight } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useI18n } from "@/app/context/I18nContext";

/*
 * Custom popover date picker built on a plain <button> + portal'd calendar.
 * No external dependencies; API-compatible with the previous DateField so no
 * caller needs to change.
 *
 * Why not native <input type="date">? Native pickers look, feel and sometimes
 * behave very differently across Safari/Chrome/Firefox and iOS Safari drops you
 * into a wheel-picker — so guests on different devices were getting a different
 * experience inside the same booking flow.
 *
 * Why a portal? Several hosts wrap DateField in parents with `overflow-hidden`
 * (the fishing TourCard uses it for its collapsed/expanded animation). An
 * inline-positioned popover would be clipped at the panel edge; portalling to
 * <body> and positioning against the trigger's bounding rect keeps the popover
 * on top of the layout.
 */

/** "YYYY-MM-DD" in local timezone — avoids the UTC drift that
 *  `new Date().toISOString().slice(0, 10)` produces west of Greenwich. */
export function todayLocal() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ─── pure Y/M/D math (never touches Date's UTC midnight) ───────── */

function parseIso(s) {
  if (typeof s !== "string") return null;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function toIso({ y, m, d }) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function cmp(a, b) {
  if (!a || !b) return 0;
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

function sameYmd(a, b) {
  return !!(a && b && a.y === b.y && a.m === b.m && a.d === b.d);
}

function addMonths({ y, m }, delta) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 + 1 };
}

/* 42-cell grid including leading/trailing neighbour-month days so the
 * layout never jumps when the month's first day changes. */
function monthGrid({ y, m }, weekStart) {
  const firstDow = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (firstDow - weekStart + 7) % 7;
  const prev = addMonths({ y, m }, -1);
  const prevDays = new Date(prev.y, prev.m, 0).getDate();
  const next = addMonths({ y, m }, 1);

  const cells = [];
  for (let i = leading - 1; i >= 0; i--) {
    cells.push({ y: prev.y, m: prev.m, d: prevDays - i, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y, m, d, inMonth: true });
  }
  let d = 1;
  while (cells.length < 42) {
    cells.push({ y: next.y, m: next.m, d: d++, inMonth: false });
  }
  return cells;
}

/* ─── locale-aware display ──────────────────────────────────────── */

function intlLocale(locale) {
  return locale === "es" ? "es-CR" : "en-US";
}

function fullDateLabel(iso, locale) {
  const p = parseIso(iso);
  if (!p) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(p.y, p.m - 1, p.d));
}

function monthHeading(y, m, locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long", year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

/* Short weekday names starting from `weekStart` (0 = Sunday, 1 = Monday). */
function weekdayHeaders(locale, weekStart) {
  const anchor = new Date(2024, 0, 7); // a Sunday
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short" });
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + ((weekStart + i) % 7));
    out.push(fmt.format(d).replace(".", "").slice(0, 2));
  }
  return out;
}

/* ─── tones ─────────────────────────────────────────────────────── */

const TONES = {
  light: {
    label: "text-[#222E2C]/45",
    trigger:
      "bg-white border-[#222E2C]/15 text-[#222E2C] hover:border-[#222E2C]/30 focus-visible:ring-[#213B2F]/30 shadow-sm",
    placeholder: "text-[#222E2C]/40",
    icon: "text-[#222E2C]/50",
  },
  dark: {
    label: "text-[#D8DDB8]/60",
    trigger:
      "bg-white/10 border-white/15 text-[#EDE5D8] hover:bg-white/15 focus-visible:ring-white/25",
    placeholder: "text-[#D8DDB8]/45",
    icon: "text-[#D8DDB8]/70",
  },
  /* Terracotta fill for controls on the forest green — see the long note on the
   * matching tone in QtyStepper for why terracotta works as a fill and not as a
   * text colour, and why the spa and fishing cards must keep `dark`. */
  accent: {
    label: "text-[#D8DDB8]/60",
    trigger:
      "bg-[#8B5A3C] border-[#C9974F]/50 text-[#EDE5D8] hover:bg-[#7a4e34] focus-visible:ring-[#C9974F]/40 shadow-sm",
    placeholder: "text-[#EDE5D8]/60",
    icon: "text-[#EDE5D8]/85",
  },
};

/* ─── main component ────────────────────────────────────────────── */

export default function DateField({
  value = "",
  onChange,
  /* `null` en vez de un literal: el texto por defecto se resuelve con t() dentro
   * del componente, donde el hook ya corrió. Pasar `label={null}` explícitamente
   * sigue ocultando la etiqueta, como hace el formulario del checkout. */
  label = undefined,
  optional = false,
  tone = "light",
  /* Pass `null` to opt out of the today-minimum. Default below is applied after
   * hydration so SSR/CSR date differences never cause a hydration mismatch. */
  min: minProp,
  disabled = false,
  className,
}) {
  const { locale, t } = useI18n();
  const etiqueta = label === undefined ? t("common.a11y.preferredDate") : label;
  const c = TONES[tone] ?? TONES.light;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [minIso, setMinIso] = useState(null);
  const [coords, setCoords] = useState(null);

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const selected = useMemo(() => parseIso(value), [value]);
  const minParsed = useMemo(() => parseIso(minIso), [minIso]);

  /* The view month is the month shown in the calendar. Seeded with a
   * deterministic value for SSR, then snapped to today/selected on mount. */
  const [view, setView] = useState(() => {
    const p = parseIso(value);
    return p ? { y: p.y, m: p.m } : { y: 1970, m: 1 };
  });

  useEffect(() => {
    setMounted(true);
    if (minProp === null) {
      setMinIso(null);
    } else {
      setMinIso(minProp ?? todayLocal());
    }
  }, [minProp]);

  /* If we seeded view with the SSR fallback, replace it with today on mount. */
  useEffect(() => {
    if (view.y !== 1970) return;
    const p = parseIso(value) ?? parseIso(todayLocal());
    if (p) setView({ y: p.y, m: p.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* On each open, snap view to the selected month (or today). */
  useEffect(() => {
    if (!open) return;
    const p = parseIso(value) ?? parseIso(todayLocal());
    if (p) setView({ y: p.y, m: p.m });
  }, [open, value]);

  /* Position the popover below the trigger, clamped inside the viewport. */
  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popWidth = 288; // w-72
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - popWidth - margin),
    );
    setCoords({
      top: rect.bottom + window.scrollY + 6,
      left: left + window.scrollX,
      width: Math.max(rect.width, popWidth),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  /* Dismiss on outside click — both the trigger and the portal'd popover count
   * as "inside" so clicking in the calendar doesn't close it. */
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPopover = popoverRef.current?.contains(e.target);
      if (!inTrigger && !inPopover) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handlePick = useCallback(
    (cell) => {
      if (minParsed && cmp(cell, minParsed) < 0) return;
      onChange(toIso(cell));
      setOpen(false);
      triggerRef.current?.focus();
    },
    [minParsed, onChange],
  );

  const displayLabel = value ? fullDateLabel(value, locale) : "";
  const placeholder = locale === "es" ? "Elegí una fecha" : "Pick a date";

  return (
    <div className={cn("relative flex flex-col gap-1.5", className)}>
      {etiqueta && (
        <span
          className={cn(
            "flex items-center gap-1.5 font-sans text-[10px] font-semibold uppercase tracking-widest",
            c.label,
          )}
        >
          <TbCalendarEvent size={11} className="shrink-0" />
          {etiqueta}
          {optional && (
            <span className="font-normal normal-case tracking-normal opacity-70">
              {locale === "es" ? "(opcional)" : "(optional)"}
            </span>
          )}
        </span>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "font-sans text-sm rounded-xl px-3 py-2 border transition-all",
          "flex items-center justify-between gap-2 text-left",
          "focus:outline-none focus-visible:ring-2 focus-visible:border-transparent",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          c.trigger,
        )}
      >
        <span className={cn("truncate", !value && c.placeholder)}>
          {displayLabel || placeholder}
        </span>
        <TbCalendarEvent size={14} className={cn("shrink-0", c.icon)} />
      </button>

      {open && !disabled && mounted && coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={monthHeading(view.y, view.m, locale)}
            style={{
              position: "absolute",
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
            className="z-[60]"
          >
            <CalendarPopover
              view={view}
              selected={selected}
              min={minParsed}
              locale={locale}
              onPick={handlePick}
              onNav={(delta) => setView((v) => addMonths(v, delta))}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ─── calendar panel ────────────────────────────────────────────── */

function CalendarPopover({ view, selected, min, locale, onPick, onNav }) {
  const weekStart = locale === "es" ? 1 : 0; // Mon vs. Sun

  const grid = useMemo(() => monthGrid(view, weekStart), [view, weekStart]);
  const headers = useMemo(
    () => weekdayHeaders(locale, weekStart),
    [locale, weekStart],
  );
  const heading = useMemo(
    () => monthHeading(view.y, view.m, locale),
    [view, locale],
  );

  const today = useMemo(() => parseIso(todayLocal()), []);
  const prevDisabled = min
    ? cmp({ ...addMonths(view, 0), d: 1 }, { y: min.y, m: min.m, d: 1 }) <= 0
    : false;

  return (
    <div className="bg-[#EDE5D8] border border-[#213B2F]/15 rounded-2xl shadow-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => !prevDisabled && onNav(-1)}
          disabled={prevDisabled}
          aria-label={locale === "es" ? "Mes anterior" : "Previous month"}
          className="size-7 rounded-lg flex items-center justify-center text-[#213B2F]/70 hover:bg-[#213B2F]/8 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <TbChevronLeft size={16} />
        </button>
        <span className="font-sans font-semibold text-sm text-[#213B2F] capitalize">
          {heading}
        </span>
        <button
          type="button"
          onClick={() => onNav(1)}
          aria-label={locale === "es" ? "Mes siguiente" : "Next month"}
          className="size-7 rounded-lg flex items-center justify-center text-[#213B2F]/70 hover:bg-[#213B2F]/8 transition-colors"
        >
          <TbChevronRight size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5">
        {headers.map((h, i) => (
          <div
            key={i}
            className="text-center font-sans text-[10px] font-semibold uppercase tracking-wider text-[#213B2F]/40 py-1"
          >
            {h}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map((cell, i) => {
          const isSelected = sameYmd(selected, cell);
          const isToday = sameYmd(today, cell);
          const isDisabled = min != null && cmp(cell, min) < 0;

          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled}
              onClick={() => onPick(cell)}
              aria-selected={isSelected ? "true" : undefined}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "size-9 rounded-lg font-sans text-sm transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213B2F]/40",
                "disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                isSelected
                  ? "bg-[#213B2F] text-[#EDE5D8] font-semibold shadow-sm hover:bg-[#213B2F]"
                  : cell.inMonth
                  ? "text-[#213B2F] hover:bg-[#213B2F]/8"
                  : "text-[#213B2F]/30 hover:bg-[#213B2F]/5",
                isToday && !isSelected && "ring-1 ring-[#213B2F]/35",
              )}
            >
              {cell.d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
