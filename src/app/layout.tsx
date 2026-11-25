import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { I18nProvider } from "./context/I18nContext";
import { CartProvider } from "./context/CartContext";
import { KioskProvider } from "./context/KioskContext";
import LenisProvider from "@/components/LenisProvider";
import CartButton from "@/components/cart/CartButton";
import CartDrawer from "@/components/cart/CartDrawer";
import IdleReset from "@/components/kiosk/IdleReset";
import KioskBar from "@/components/kiosk/KioskBar";
import KioskLinkGuard from "@/components/kiosk/KioskLinkGuard";
import OfflineBanner from "@/components/kiosk/OfflineBanner";
import { GoogleTagManager } from '@next/third-parties/google';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});


import JsonLd from "@/components/JsonLd";

/*
 * Esto es el WELCOME, no el sitio de marketing: la metadata describe el servicio de
 * servicios de la estadía para huéspedes que ya reservaron, no las casas en
 * alquiler. La versión
 * anterior describía las casas y aparecía así en WhatsApp.
 *
 * Va en inglés porque el sitio arranca en inglés (`useState("en")` en I18nContext)
 * y la metadata es estática: se resuelve en el servidor y no puede reaccionar al
 * idioma que el huésped elija después.
 */
export const metadata: Metadata = {
  title: {
    default: "Welcome to Arbórea Experiences",
    template: "%s | Arbórea Experiences",
  },
  description:
    "Everything for your stay in one place: a private chef, a stocked fridge, spa treatments, fishing, tours and vehicles — arranged before you arrive.",
  authors: [{ name: "Arbórea Experiences", url: "https://welcome.arboreaexperiences.com" }],
  creator: "Arbórea Experiences",
  publisher: "Arbórea Experiences",
  metadataBase: new URL("https://welcome.arboreaexperiences.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    /* El sitio es bilingüe y arranca en inglés; el español se declara como
     * alternativo en vez de como principal, que es lo que decía antes. */
    locale: "en_US",
    alternateLocale: "es_CR",
    url: "/",
    siteName: "Arbórea Experiences",
    title: "Welcome to Arbórea Experiences",
    description:
      "Private chef, stocked fridge, spa, fishing, tours and vehicles — arranged before you arrive.",
    images: [
      {
        url: "/assets/og-welcome.jpg",
        width: 1200,
        height: 630,
        alt: "Welcome to Arbórea Experiences",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Welcome to Arbórea Experiences",
    description:
      "Private chef, stocked fridge, spa, fishing, tours and vehicles — arranged before you arrive.",
    images: ["/assets/og-welcome.jpg"],
    creator: "@arboreaexperiences",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  verification: {
    google: "",
    yandex: "",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <JsonLd />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <GoogleTagManager gtmId="GTM-W7KC623M" />
        <I18nProvider>
          <CartProvider>
            <KioskProvider>
              <LenisProvider />
              {children}
              <CartButton />
              <CartDrawer />
              <KioskBar />
              <IdleReset />
              <KioskLinkGuard />
              <OfflineBanner />
            </KioskProvider>
          </CartProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
