import type { NextConfig } from "next";

/*
 * `output: "export"` was removed on 2026-11-20 when hosting moved from Hostinger to
 * Vercel. It is what made this a static site with no server, and therefore nowhere
 * to keep a secret: the order flow had to post straight from the browser to Apps
 * Script with the shared secret inlined in the JS bundle. With a server there is a
 * route handler (`app/api/orders/route.ts`) that holds the secret instead.
 *
 * Every page is still a client component, so nothing is server-rendered that was not
 * before — the only new server surface is the API route.
 *
 * `images.unoptimized` stays on deliberately. Next's optimizer is available now, but
 * every image on the site is a plain <img> pointing at /assets, and turning it on
 * would change both their delivery and the bill without anyone asking for it.
 */
const nextConfig: NextConfig = {
  /* Routes resolve as `/checkout/`, not `/checkout`. This applies to the API route
   * too, so clients must post to `/api/orders/` — without the trailing slash Next
   * answers with a 308 to the slashed URL, which a POST survives but pays a round
   * trip for. */
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
