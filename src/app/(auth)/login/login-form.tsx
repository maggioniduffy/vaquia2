"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  authGhost,
  authHelp,
  authInput,
  authLabel,
  authPrimary,
  authSecondary,
} from "@/components/auth/brand-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import { sendCode, signInAsGuest, signInWithGoogle, verifyCode, type LoginState } from "./actions";

// Several submit buttons share one form; `intent` tells the reducer which one fired.
async function codeFlow(prev: LoginState, formData: FormData): Promise<LoginState> {
  switch (formData.get("intent")) {
    case "verify":
      return verifyCode(prev, formData);
    case "reset":
      return {};
    default:
      return sendCode(prev, formData);
  }
}

// Email → 6-digit code sent by email → signed in. No passwords.
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export function LoginForm({
  next,
  guestEnabled,
  googleEnabled,
  mode = "login",
}: {
  next: string;
  guestEnabled: boolean;
  googleEnabled: boolean;
  mode?: "login" | "signup";
}) {
  const signup = mode === "signup";
  const [state, action, pending] = useActionState<LoginState, FormData>(codeFlow, {});
  const [guestState, guestAction, guestPending] = useActionState<LoginState, FormData>(
    signInAsGuest,
    {},
  );
  const codeStep = state.step === "code";

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        {signup && !codeStep ? (
          <p className="text-sm text-[color:var(--a-mu)]">{t.auth.signUpHint}</p>
        ) : null}
        {codeStep ? (
          <>
            <input type="hidden" name="email" value={state.email ?? ""} />
            <p className="text-sm text-[color:var(--a-mu)]">{state.email}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code" className={authLabel}>
                {t.auth.code}
              </Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                className={authInput}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className={authLabel}>
              {t.auth.email}
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={authInput}
            />
          </div>
        )}

        {state.error ? (
          <p role="alert" className="border-danger border-l-2 pl-3 text-sm">
            {state.error}
          </p>
        ) : null}
        {state.info ? (
          <p role="status" className="border-accent border-l-2 pl-3 text-sm">
            {state.info}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending}
          name="intent"
          value={codeStep ? "verify" : "send"}
          className={authPrimary}
        >
          {codeStep ? (signup ? t.auth.signUpSubmit : t.auth.signIn) : t.auth.sendCode}
        </Button>
        {codeStep ? (
          <>
            <Button
              type="submit"
              variant="ghost"
              size="md"
              disabled={pending}
              name="intent"
              value="send"
              formNoValidate
              className={authGhost}
            >
              {t.auth.resendCode}
            </Button>
            <Button
              type="submit"
              variant="ghost"
              size="md"
              disabled={pending}
              name="intent"
              value="reset"
              formNoValidate
              className={authGhost}
            >
              {t.auth.changeEmail}
            </Button>
          </>
        ) : null}
      </form>
      {googleEnabled && !codeStep ? (
        <>
          <p className={`${authHelp} text-center`}>{t.auth.or}</p>
          <form action={signInWithGoogle.bind(null, next)}>
            <Button
              type="submit"
              variant="secondary"
              size="md"
              className={`${authSecondary} gap-2`}
            >
              <GoogleMark />
              {t.auth.googleSignIn}
            </Button>
          </form>
        </>
      ) : null}
      {guestEnabled && !codeStep ? (
        <form action={guestAction} className="flex flex-col gap-4">
          {guestState.error ? (
            <p role="alert" className="border-danger border-l-2 pl-3 text-sm">
              {guestState.error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="secondary"
            size="md"
            disabled={guestPending}
            className={authSecondary}
          >
            {t.auth.guestSignIn}
          </Button>
        </form>
      ) : null}
      {!codeStep ? (
        <p className="text-center text-sm text-[color:var(--a-mu)]">
          {signup ? t.auth.haveAccount : t.auth.noAccountYet}{" "}
          <Link
            href={signup ? "/login" : "/signup"}
            className="text-accent underline-offset-2 hover:underline"
          >
            {signup ? t.auth.goToLogin : t.auth.goToSignUp}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
