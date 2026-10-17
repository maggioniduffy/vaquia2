"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import { sendCode, signInAsGuest, verifyCode, type LoginState } from "./actions";

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
export function LoginForm({ next, guestEnabled }: { next: string; guestEnabled: boolean }) {
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
        {codeStep ? (
          <>
            <input type="hidden" name="email" value={state.email ?? ""} />
            <p className="text-muted text-sm">{state.email}</p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="code">{t.auth.code}</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                className="h-12 md:h-9"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-12 md:h-9"
            />
          </div>
        )}

        {state.error ? (
          <p role="alert" className="border-danger border-l-2 pl-3 text-sm">
            {state.error}
          </p>
        ) : null}
        {state.info ? (
          <p role="status" className="border-success border-l-2 pl-3 text-sm">
            {state.info}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="touch"
          disabled={pending}
          name="intent"
          value={codeStep ? "verify" : "send"}
          className="md:h-9 md:text-sm"
        >
          {codeStep ? t.auth.signIn : t.auth.sendCode}
        </Button>
        {codeStep ? (
          <>
            <Button
              type="submit"
              variant="ghost"
              size="touch"
              disabled={pending}
              name="intent"
              value="send"
              formNoValidate
              className="md:h-9 md:text-sm"
            >
              {t.auth.resendCode}
            </Button>
            <Button
              type="submit"
              variant="ghost"
              size="touch"
              disabled={pending}
              name="intent"
              value="reset"
              formNoValidate
              className="md:h-9 md:text-sm"
            >
              {t.auth.changeEmail}
            </Button>
          </>
        ) : null}
      </form>
      {guestEnabled && !codeStep ? (
        <form action={guestAction} className="flex flex-col gap-4">
          {guestState.error ? (
            <p role="alert" className="border-danger border-l-2 pl-3 text-sm">
              {guestState.error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="ghost"
            size="touch"
            disabled={guestPending}
            className="w-full md:h-9 md:text-sm"
          >
            {t.auth.guestSignIn}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
