"use client";

import { useState, useEffect } from "react";

/*
 * Tracks navigator.onLine. Starts `true` so the prerendered HTML and first client
 * render agree (static export), then corrects itself in the effect.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
