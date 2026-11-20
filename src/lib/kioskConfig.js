/*
 * Central config for the Casa Ceiba tablet kiosk mode.
 *
 * Everything that Andrés might need to tweak lives here, marked `// POR CONFIRMAR`
 * where still pending, so no one has to hunt through component code.
 *
 * The category ids must match REQUEST_LABELS in apps-script/Code.gs. A new id does
 * not break the backend (it is shown as-is) but should be kept aligned.
 */

export const KIOSK_CONFIG = {
  storageKey: "arborea.kiosk.v1",
  idleSeconds: 180,
  warningSeconds: 15, // the countdown appears in the last 15 s
  successReturnSeconds: 20, // after submitting, returns home on its own
  defaultLocale: "en",
  frontDeskWhatsapp: "50685011042", // confirmado (por ahora)
  officeHours: {
    timeZone: "America/Costa_Rica",
    days: [0, 1, 2, 3, 4, 5, 6], // 0 = domingo. Todos los días.
    start: 8, // 8:00 inclusive
    end: 17, // 17:00 exclusive
  },
  afterHoursContact: null, // POR CONFIRMAR — contacto de guardia fuera de horario, si existe
  requestCategories: [
    "cleaning", // Limpieza extra
    "amenities", // Reposición de amenities
    "electricity", // Electricidad
    "wildlife", // Insectos o animales
    "checkout", // Check-out tardío o check-in temprano
    "concierge", // Recomendación o reserva
  ],
  // "message" (mensaje libre) es siempre la última tarjeta, no va en esta lista.
};
