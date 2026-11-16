"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

/*
 * Local selection store for an in-house service page.
 *
 * These pages are a draft until the guest presses "Add to cart" once at the bottom:
 * selections and preference answers accumulate here, the page renders its own
 * summary from them, and only the commit writes to the global cart. Nothing in here
 * is persisted — the cart is the committed order (see CLAUDE.md).
 *
 * Entries are free-form per page; in practice `{ qty, date, duration, unitPrice }`.
 * Unlike the old `useOrderCart` this deliberately does NOT track labels or fold
 * quantity into a price — the commit builds those from the i18n data.
 *
 * `useOrderCart` still exists for FishingToursPage, which is intentionally not
 * wired to the cart yet.
 */

export function useDraft(initial = {}) {
  const [items, setItems] = useState(initial);

  const get = useCallback((id) => items[id], [items]);
  const has = useCallback((id) => Boolean(items[id]), [items]);

  /** Shallow-merges into the entry, creating it if absent. */
  const set = useCallback((id, patch) => {
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  /** Replaces the entry outright. */
  const replace = useCallback((id, value) => {
    setItems((prev) => ({ ...prev, [id]: value }));
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clear = useCallback(() => setItems({}), []);

  const ids = useMemo(() => Object.keys(items), [items]);
  const count = ids.length;

  return { items, ids, count, get, has, set, replace, remove, clear, setItems };
}

/**
 * Restores a page's draft from lines already committed to the cart.
 *
 * Fires on the first hydration tick (initial mount) AND every time `trigger`
 * changes — the latter is how the cart drawer's "Edit" link re-populates the
 * page even when the guest is already on that same URL (same-URL soft nav keeps
 * the component mounted, so a mount-only seed would be invisible). Pass
 * `trigger = cart.editSignal.token` from the service page, gated so it only
 * changes when that service is the one being edited.
 *
 * On re-fire the whole draft is replaced, not merged — otherwise half-filled
 * selections from before the Edit would hang around alongside the restored
 * lines. On the very first fire (no prior draft) that's a no-op.
 *
 * `skuToId` maps a committed line back to the draft key the page uses for it;
 * return a falsy value to ignore a line.
 */
export function useSeedDraftFromCart({ hydrated, lines, service, skuToId, setItems, onSeed, trigger }) {
  const lastTrigger = useRef(null);

  useEffect(() => {
    if (!hydrated) return;
    if (lastTrigger.current === trigger) return;
    lastTrigger.current = trigger;

    const mine = lines.filter((l) => l.service === service);

    const next = {};
    for (const line of mine) {
      const id = skuToId(line);
      if (!id) continue;
      next[id] = {
        qty: line.qty,
        date: line.date ?? "",
        unitPrice: line.unitPrice,
        ...(line.options?.duration ? { duration: line.options.duration } : {}),
      };
    }

    setItems(next);
    onSeed?.(mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, trigger]);
}

export default useDraft;
