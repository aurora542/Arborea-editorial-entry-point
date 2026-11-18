// Flat config. Next 16 removed `next lint`, so `npm run lint` runs ESLint directly
// with the same presets the old .eslintrc.json extended.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", "out/**", "apps-script/**", "next-env.d.ts"] },
  // Flat config only lints .js/.mjs/.cjs by default; the site is mostly .jsx.
  { files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
