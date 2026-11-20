"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { TbAlertCircle, TbSend, TbLoader2 } from "react-icons/tb";
import { useI18n } from "@/app/context/I18nContext";
import { properties } from "@/data/properties";
import { RESERVATION_RE } from "@/lib/orderPayload";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, composePhone } from "@/data/countryCodes";
import DateField from "@/components/ui/DateField";

/*
 * The guest-details half of /checkout/. Collects the seven required fields plus the
 * order-level note, and hands them up — it does not build the payload and does not
 * know the backend exists.
 *
 * Validation uses react-hook-form's built-in rules. `@hookform/resolvers` was removed
 * from the project (no zod/yup installed), so do not reach for a resolver here.
 */

/* Simple Booking reservation numbers are exactly five digits ("23546"), confirmed
 * with the client on 2026-11-20. Imported rather than redeclared so the form and the
 * payload builder cannot drift apart on what a valid number is. */

/* Good enough to catch typos, not an RFC validator — the backend emails the guest
 * anyway, which is the real test. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Solo la parte local: el código de país va en su propio select. Entre 6 y 15
 * dígitos cubre desde un número tico de 8 hasta los más largos del mundo. Se
 * permiten espacios y guiones al escribir; se limpian al componer. */
const PHONE_RE = /^[\d\s().-]{6,20}$/;

export default function GuestDetailsForm({ onSubmit, submitting }) {
  const { t } = useI18n();

  const casaOptions = useMemo(
    () =>
      Object.values(properties).map((p) => ({
        value: p.slug,
        label: t(`properties.${p.i18nKey}.name`),
      })),
    [t]
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    mode: "onBlur",
    defaultValues: {
      reservationNumber: "",
      firstName: "",
      lastName: "",
      email: "",
      phoneCountry: DEFAULT_COUNTRY_CODE,
      phoneNumber: "",
      casa: "",
      checkInDate: "",
      notes: "",
    },
  });

  /* DateField is a custom popover, not an <input>, so it can't be `register`ed —
   * it's wired manually and validated through a registered hidden field. */
  const checkInDate = watch("checkInDate");

  const required = { required: t("checkout.form.required") };

  /* El formulario entrega `phone` ya compuesto: el resto de la app (y el contrato
   * del payload) sigue viendo un solo campo de teléfono. El select de país es
   * detalle de esta UI, no del contrato. */
  const submit = (values) => {
    const { phoneCountry, phoneNumber, ...resto } = values;
    onSubmit({ ...resto, phone: composePhone(phoneCountry, phoneNumber) });
  };

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="rounded-2xl bg-white/60 border border-[#222E2C]/8 px-5 py-5 flex flex-col gap-5"
    >
      <div>
        <h2 className="font-sans font-semibold text-lg text-[#222E2C] tracking-tight">
          {t("checkout.form.heading")}
        </h2>
        <p className="font-sans text-sm text-[#222E2C]/55 mt-1 leading-relaxed">
          {t("checkout.form.description")}
        </p>
      </div>

      {/* Reservation number — full width and first, because it is the key the whole
          order is filed under. */}
      <Field
        label={t("checkout.form.reservationNumber.label")}
        hint={t("checkout.form.reservationNumber.hint")}
        error={errors.reservationNumber?.message}
      >
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          /* Numeric keypad on phones, where most guests will be typing this. Not
           * type="number": that brings spinners, allows "e" and strips leading
           * zeros, and a reservation number is a label, not a quantity. */
          inputMode="numeric"
          maxLength={5}
          placeholder={t("checkout.form.reservationNumber.placeholder")}
          className={inputClass(errors.reservationNumber)}
          {...register("reservationNumber", {
            ...required,
            pattern: {
              value: RESERVATION_RE,
              message: t("checkout.form.reservationNumber.invalid"),
            },
            /* Digits only before validating, so a pasted " 23546 " passes instead of
             * failing on whitespace the guest cannot see. */
            setValueAs: (v) => String(v ?? "").replace(/\D/g, ""),
          })}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("checkout.form.firstName.label")} error={errors.firstName?.message}>
          <input
            type="text"
            autoComplete="given-name"
            placeholder={t("checkout.form.firstName.placeholder")}
            className={inputClass(errors.firstName)}
            {...register("firstName", required)}
          />
        </Field>

        <Field label={t("checkout.form.lastName.label")} error={errors.lastName?.message}>
          <input
            type="text"
            autoComplete="family-name"
            placeholder={t("checkout.form.lastName.placeholder")}
            className={inputClass(errors.lastName)}
            {...register("lastName", required)}
          />
        </Field>

        <Field label={t("checkout.form.email.label")} optional error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            placeholder={t("checkout.form.email.placeholder")}
            className={inputClass(errors.email)}
            {...register("email", {
              /* `validate` rather than `pattern`: RHF runs `pattern` against the
               * empty string too, so an optional field with a pattern would reject
               * being left blank. The `!v ||` guard is the whole point. */
              validate: (v) =>
                !String(v ?? "").trim() || EMAIL_RE.test(v) || t("checkout.form.invalidEmail"),
            })}
          />
        </Field>

        <Field label={t("checkout.form.phone.label")} error={errors.phoneNumber?.message}>
          <div className="flex gap-2">
            <select
              aria-label={t("checkout.form.phone.countryLabel")}
              className={`${inputClass(null)} w-28 shrink-0 px-2`}
              {...register("phoneCountry")}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} +{c.code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              autoComplete="tel-national"
              inputMode="numeric"
              placeholder={t("checkout.form.phone.placeholder")}
              className={inputClass(errors.phoneNumber)}
              {...register("phoneNumber", {
                ...required,
                pattern: { value: PHONE_RE, message: t("checkout.form.invalidPhone") },
              })}
            />
          </div>
        </Field>

        <Field label={t("checkout.form.casa.label")} error={errors.casa?.message}>
          <select
            className={inputClass(errors.casa)}
            defaultValue=""
            {...register("casa", required)}
          >
            <option value="" disabled>
              {t("checkout.form.casa.placeholder")}
            </option>
            {casaOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("checkout.form.checkInDate.label")} optional error={null}>
          {/* No `label` passed: DateField renders its own when given one, which would
              duplicate the <Field> label above it.
              `min={null}` opts out of the today-minimum on purpose — a guest can be
              mid-stay when they order, so their check-in date is in the past. */}
          <DateField
            value={checkInDate}
            onChange={(v) => setValue("checkInDate", v, { shouldDirty: true })}
            label={null}
            min={null}
            tone="light"
          />
          <input type="hidden" {...register("checkInDate")} />
        </Field>
      </div>

      <Field label={t("checkout.form.notes.label")} optional error={null}>
        <textarea
          rows={3}
          placeholder={t("checkout.form.notes.placeholder")}
          className={`${inputClass(null)} resize-y min-h-20`}
          {...register("notes")}
        />
      </Field>

      <p className="font-sans text-xs leading-relaxed text-[#222E2C]/50">
        {t("checkout.form.disclaimer")}
      </p>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-full bg-[#213B2F] font-sans text-sm font-semibold text-[#D8DDB8] hover:bg-[#213B2F]/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200"
      >
        {submitting ? (
          <>
            <TbLoader2 size={16} className="animate-spin" />
            {t("checkout.form.submitting")}
          </>
        ) : (
          <>
            <TbSend size={16} />
            {t("checkout.form.submit")}
          </>
        )}
      </button>
    </form>
  );
}

function inputClass(error) {
  return [
    "w-full rounded-xl bg-white px-4 py-3 font-sans text-sm text-[#222E2C]",
    "border-2 transition-colors duration-200 outline-none",
    "placeholder:text-[#222E2C]/35",
    error
      ? "border-red-700/60 focus:border-red-700"
      : "border-[#222E2C]/12 focus:border-[#213B2F]",
  ].join(" ");
}

function Field({ label, hint, error, optional = false, children }) {
  const { t } = useI18n();
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="font-sans text-xs font-semibold uppercase tracking-wide text-[#222E2C]/55">
        {label}
        {/* Most fields are required, so marking the exceptions is less noise than
            marking the rule. */}
        {optional && (
          <span className="font-normal normal-case tracking-normal text-[#222E2C]/40 ml-1.5">
            {t("checkout.form.optional")}
          </span>
        )}
      </span>
      {children}
      {hint && !error && (
        <span className="font-sans text-xs text-[#222E2C]/45 leading-snug">{hint}</span>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 font-sans text-xs text-red-700">
          <TbAlertCircle size={13} className="shrink-0" />
          {error}
        </span>
      )}
    </label>
  );
}
