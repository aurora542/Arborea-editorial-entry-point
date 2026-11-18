"use client";

import { createContext, useContext, useState, useEffect } from "react";
import en from "@/i18n/en.json";
import es from "@/i18n/es.json";

const messages = { en, es };

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    const saved = localStorage.getItem("locale");
    if (saved === "en" || saved === "es") setLocale(saved);
  }, []);

  // Set the locale explicitly and persist it. The kiosk reset uses this to force
  // the default locale back; toggleLocale is kept for the ES/EN switch.
  const changeLocale = (next) => {
    if (next !== "en" && next !== "es") return;
    setLocale(next);
    try {
      localStorage.setItem("locale", next);
    } catch {
      /* private mode / disabled storage — locale still changes in memory */
    }
  };

  const toggleLocale = () => {
    changeLocale(locale === "es" ? "en" : "es");
  };

  // t("common.seeMore") → navega el JSON con dot notation
  const t = (key) => {
    const parts = key.split(".");
    let val = messages[locale];
    for (const p of parts) {
      val = val?.[p];
    }
    return val ?? key;
  };

  return (
    <I18nContext.Provider value={{ locale, toggleLocale, setLocale: changeLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
