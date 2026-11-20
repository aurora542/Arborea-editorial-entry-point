import { KIOSK_CONFIG } from "@/lib/kioskConfig";

/*
 * Is `date` within front-desk office hours in Costa Rica, regardless of the
 * tablet's own timezone? We resolve the weekday and hour through Intl in the
 * configured timeZone (not the device's) so the tablet can be set to anything.
 *
 * Evaluate this at the moment of success, not on page load.
 */
export function isOfficeHours(date = new Date()) {
  const { timeZone, days, start, end } = KIOSK_CONFIG.officeHours;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hourStr = parts.find((p) => p.type === "hour")?.value;
  const hour = Number(hourStr);

  const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIndex = WEEKDAY_INDEX[weekday];

  if (!days.includes(dayIndex)) return false;
  if (!Number.isFinite(hour)) return false;
  return hour >= start && hour < end;
}
