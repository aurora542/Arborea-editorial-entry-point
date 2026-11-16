"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { useCart } from "@/app/context/CartContext";

export default function LenisProvider() {
  const { isOpen } = useCart();
  const lenisRef = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      /* Let Lenis intercept same-page hash links (nav anchors like /#tours)
       * and perform a smooth scroll instead of the browser's instant jump.
       * The negative offset lands the section below the fixed navbar instead
       * of hidden under it. */
      anchors: { offset: -96 },
    });
    lenisRef.current = lenis;

    let rafId;
    let pointerTimeout;

    lenis.on("scroll", () => {
      document.body.style.pointerEvents = "none";
      clearTimeout(pointerTimeout);
      pointerTimeout = setTimeout(() => {
        document.body.style.pointerEvents = "";
      }, 150);
    });

    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(pointerTimeout);
      document.body.style.pointerEvents = "";
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  /*
   * Freeze smooth scrolling while the cart drawer is open, otherwise the page
   * keeps gliding behind the overlay.
   *
   * Also force-clears the pointer-events lock above: if the guest opens the
   * drawer mid-scroll, that 150ms timeout would otherwise leave the whole body
   * (drawer included) unclickable, and with Lenis stopped no further scroll event
   * fires to clear it.
   */
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    if (isOpen) {
      lenis.stop();
      document.body.style.pointerEvents = "";
    } else {
      lenis.start();
    }
  }, [isOpen]);

  return null;
}
