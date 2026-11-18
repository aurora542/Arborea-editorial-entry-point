"use client";

import { useForm } from "react-hook-form";
import { properties } from "@/data/properties";
import { useI18n } from "@/app/context/I18nContext";

/*
 * Guest-details form for checkout.
 *
 * - Web: firstName, lastName, email, phone, casa (select) — all required — + notes.
 * - Kiosk: name (required), WhatsApp (optional), casa read-only, notes.
 *
 * On valid submit it calls onSubmit({ guest, notes }), shaping `guest` per mode to
 * match the payload contract (§4.1). The parent owns the submit button and state
 * so the same submit path serves both the idle/sending/error flow and retries.
 */
export default function GuestDetailsForm({ kiosk = false, casaSlug, disabled, onSubmit, formId }) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const casaSlugs = Object.keys(properties);

  const submit = (data) => {
    const notes = (data.notes || "").trim();
    if (kiosk) {
      onSubmit({
        guest: {
          name: (data.name || "").trim(),
          phone: (data.phone || "").trim(),
          casa: casaSlug,
        },
        notes,
      });
    } else {
      onSubmit({
        guest: {
          firstName: (data.firstName || "").trim(),
          lastName: (data.lastName || "").trim(),
          email: (data.email || "").trim(),
          phone: (data.phone || "").trim(),
          casa: data.casa,
        },
        notes,
      });
    }
  };

  const inputClass =
    "w-full min-h-[48px] rounded-xl border border-[#222E2C]/15 bg-white/70 px-4 font-sans text-sm text-[#222E2C] placeholder:text-[#222E2C]/35 focus:outline-none focus:border-[#213B2F] disabled:opacity-50";
  const labelClass =
    "font-sans text-xs font-semibold uppercase tracking-wide text-[#222E2C]/50 mb-1.5 block";
  const errClass = "font-sans text-xs text-red-700 mt-1";

  return (
    <form id={formId} onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
      {kiosk ? (
        <>
          <div>
            <label className={labelClass} htmlFor="gd-name">
              {t("guestForm.name")}
            </label>
            <input
              id="gd-name"
              className={inputClass}
              disabled={disabled}
              {...register("name", { required: true })}
            />
            {errors.name && <p className={errClass}>{t("guestForm.required")}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="gd-phone">
              {t("guestForm.whatsappOptional")}
            </label>
            <input id="gd-phone" className={inputClass} disabled={disabled} {...register("phone")} />
            <p className="font-sans text-xs text-[#222E2C]/45 mt-1">{t("guestForm.whatsappHint")}</p>
          </div>
          <div>
            <label className={labelClass}>{t("guestForm.casa")}</label>
            <p className="w-full min-h-[48px] rounded-xl bg-[#222E2C]/5 px-4 flex items-center font-sans text-sm text-[#222E2C]">
              {t(`properties.${properties[casaSlug]?.i18nKey}.name`)}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="gd-firstName">
                {t("guestForm.firstName")}
              </label>
              <input
                id="gd-firstName"
                className={inputClass}
                disabled={disabled}
                {...register("firstName", { required: true })}
              />
              {errors.firstName && <p className={errClass}>{t("guestForm.required")}</p>}
            </div>
            <div>
              <label className={labelClass} htmlFor="gd-lastName">
                {t("guestForm.lastName")}
              </label>
              <input
                id="gd-lastName"
                className={inputClass}
                disabled={disabled}
                {...register("lastName", { required: true })}
              />
              {errors.lastName && <p className={errClass}>{t("guestForm.required")}</p>}
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="gd-email">
              {t("guestForm.email")}
            </label>
            <input
              id="gd-email"
              type="email"
              className={inputClass}
              disabled={disabled}
              {...register("email", { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })}
            />
            {errors.email && <p className={errClass}>{t("guestForm.emailInvalid")}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="gd-phone">
              {t("guestForm.phone")}
            </label>
            <input
              id="gd-phone"
              className={inputClass}
              disabled={disabled}
              {...register("phone", { required: true })}
            />
            {errors.phone && <p className={errClass}>{t("guestForm.required")}</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="gd-casa">
              {t("guestForm.casa")}
            </label>
            <select
              id="gd-casa"
              className={inputClass}
              disabled={disabled}
              defaultValue=""
              {...register("casa", { required: true })}
            >
              <option value="" disabled>
                {t("guestForm.casaPlaceholder")}
              </option>
              {casaSlugs.map((slug) => (
                <option key={slug} value={slug}>
                  {t(`properties.${properties[slug].i18nKey}.name`)}
                </option>
              ))}
            </select>
            {errors.casa && <p className={errClass}>{t("guestForm.required")}</p>}
          </div>
        </>
      )}

      <div>
        <label className={labelClass} htmlFor="gd-notes">
          {t("guestForm.notes")}
        </label>
        <textarea
          id="gd-notes"
          rows={3}
          className={`${inputClass} py-3 resize-none`}
          disabled={disabled}
          {...register("notes")}
        />
      </div>
    </form>
  );
}
