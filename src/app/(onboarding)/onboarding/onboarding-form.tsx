"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import { formatCuit, isValidCuit, normalizeCuit } from "@/lib/cuit";
import { createCompany, type OnboardingState } from "@/lib/onboarding/actions";

const inputClass = "h-12 text-base md:h-9 md:text-sm";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="border-danger border-l-2 pl-3 text-xs">
      {message}
    </p>
  );
}

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createCompany, {});
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cuit, setCuit] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [stepError, setStepError] = useState<string>();
  // Adjust state when a new server result arrives (React "derive state from props" pattern).
  const [seen, setSeen] = useState<OnboardingState>(state);
  if (seen !== state) {
    setSeen(state);
    if (state.values) {
      setFullName(state.values.fullName);
      setDni(state.values.dni);
      setCompanyName(state.values.companyName);
      setCuit(state.values.cuit);
    }
    const fe = state.fieldErrors;
    if (fe && (fe.fullName || fe.dni)) setStep(1);
    else if (fe && (fe.companyName || fe.cuit)) setStep(2);
  }

  const e = t.onboarding.errors;
  const fe = state.fieldErrors ?? {};
  const cuitDigits = normalizeCuit(cuit);
  const cuitFilled = cuitDigits.length === 11;
  const cuitBad = cuitFilled && !isValidCuit(cuit);
  const dniDigits = dni.replace(/[.\s-]/g, "");
  const dniOk = /^[0-9]{7,8}$/.test(dniDigits);

  function next() {
    if (fullName.trim().length < 2) return setStepError(e.invalidFullName);
    if (!dniOk) return setStepError(e.invalidDni);
    setStepError(undefined);
    setStep(2);
  }

  const cuitMessage = fe.cuit ?? (cuitBad ? e.invalidCuit : undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs">
        <span className="bg-accent size-1.5 rounded-full" aria-hidden="true" />
        <span className="font-medium">{t.onboarding.stepOf(step, 2)}</span>
        <span className="text-muted">
          {step === 1 ? t.onboarding.stepPerson : t.onboarding.stepCompany}
        </span>
      </div>

      <div hidden={step !== 1} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">{t.onboarding.fullName}</Label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(ev) => setFullName(ev.target.value)}
            aria-invalid={Boolean(fe.fullName)}
            className={inputClass}
          />
          <FieldError id="fullName-error" message={fe.fullName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dni">{t.onboarding.dni}</Label>
          <Input
            id="dni"
            name="dni"
            inputMode="numeric"
            autoComplete="off"
            value={dni}
            onChange={(ev) => setDni(ev.target.value)}
            aria-invalid={Boolean(fe.dni)}
            className={inputClass}
          />
          <p className="text-muted text-xs">{t.onboarding.dniHint}</p>
          <FieldError id="dni-error" message={fe.dni} />
        </div>
        {stepError ? <FieldError id="step-error" message={stepError} /> : null}
        <Button
          type="button"
          variant="primary"
          size="touch"
          onClick={next}
          className="w-full md:h-9 md:text-sm"
        >
          {t.onboarding.next}
        </Button>
      </div>

      <div hidden={step !== 2} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="companyName">{t.onboarding.companyName}</Label>
          <Input
            id="companyName"
            name="companyName"
            autoComplete="organization"
            value={companyName}
            onChange={(ev) => setCompanyName(ev.target.value)}
            aria-invalid={Boolean(fe.companyName)}
            className={inputClass}
          />
          <FieldError id="companyName-error" message={fe.companyName} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cuit">{t.onboarding.cuit}</Label>
          <Input
            id="cuit"
            name="cuit"
            inputMode="numeric"
            autoComplete="off"
            value={cuit}
            onChange={(ev) => {
              const digits = normalizeCuit(ev.target.value).slice(0, 11);
              setCuit(digits.length === 11 ? formatCuit(digits) : digits);
            }}
            aria-invalid={Boolean(cuitMessage)}
            className={`${inputClass} font-mono`}
          />
          <p className="text-muted text-xs">{t.onboarding.cuitHint}</p>
          <FieldError id="cuit-error" message={cuitMessage} />
        </div>
        {state.error ? (
          <p role="alert" className="border-danger border-l-2 pl-3 text-sm">
            {state.error}
            {state.error === e.duplicate ? (
              <>
                {" "}
                <a href={t.onboarding.duplicateHref} className="text-accent underline">
                  {t.onboarding.duplicateContact}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <p className="text-muted text-xs">{t.onboarding.trialNote}</p>
        <Button
          type="submit"
          variant="primary"
          size="touch"
          disabled={pending || cuitBad || !cuitFilled}
          className="w-full md:h-9 md:text-sm"
        >
          {t.onboarding.submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="touch"
          disabled={pending}
          onClick={() => setStep(1)}
          className="md:h-9 md:text-sm"
        >
          {t.onboarding.back}
        </Button>
      </div>
    </form>
  );
}
