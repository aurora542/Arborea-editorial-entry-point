/*
 * Country dial codes for the checkout phone field.
 *
 * Deliberately a short, curated list rather than all ~240 countries: a guest on a
 * phone scrolling to find their code is worse than a list that covers where Arbórea
 * guests actually come from. Costa Rica first because the kiosk and in-country
 * guests are the common case; the rest roughly by volume of visitors to the Osa.
 *
 * `code` is what gets stored, in the `(506)88888888` shape the concierge sheet
 * expects — see `composePhone` below for why the parentheses matter.
 */
export const COUNTRY_CODES = [
  { code: "506", label: "Costa Rica", flag: "🇨🇷" },
  { code: "1",   label: "USA / Canada", flag: "🇺🇸" },
  { code: "52",  label: "México", flag: "🇲🇽" },
  { code: "44",  label: "United Kingdom", flag: "🇬🇧" },
  { code: "49",  label: "Deutschland", flag: "🇩🇪" },
  { code: "34",  label: "España", flag: "🇪🇸" },
  { code: "33",  label: "France", flag: "🇫🇷" },
  { code: "39",  label: "Italia", flag: "🇮🇹" },
  { code: "31",  label: "Nederland", flag: "🇳🇱" },
  { code: "41",  label: "Schweiz", flag: "🇨🇭" },
  { code: "46",  label: "Sverige", flag: "🇸🇪" },
  { code: "61",  label: "Australia", flag: "🇦🇺" },
  { code: "55",  label: "Brasil", flag: "🇧🇷" },
  { code: "54",  label: "Argentina", flag: "🇦🇷" },
  { code: "56",  label: "Chile", flag: "🇨🇱" },
  { code: "57",  label: "Colombia", flag: "🇨🇴" },
  { code: "507", label: "Panamá", flag: "🇵🇦" },
  { code: "502", label: "Guatemala", flag: "🇬🇹" },
  { code: "503", label: "El Salvador", flag: "🇸🇻" },
  { code: "504", label: "Honduras", flag: "🇭🇳" },
  { code: "505", label: "Nicaragua", flag: "🇳🇮" },
];

export const DEFAULT_COUNTRY_CODE = "506";

/*
 * Builds the stored phone string: `(506)88888888`.
 *
 * The parentheses are not decoration. The previous format was `+506 8888 8888`, and
 * a leading `+` makes Google Sheets treat the cell as a formula — the concierge's
 * master sheet showed an error instead of a phone number. Wrapping the dial code
 * removes the `+` while keeping it legible and unambiguous.
 */
export function composePhone(dialCode, number) {
  const code = String(dialCode ?? "").replace(/\D/g, "");
  const digits = String(number ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return code ? `(${code})${digits}` : digits;
}
