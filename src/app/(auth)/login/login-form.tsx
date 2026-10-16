"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import {
  sendCode,
  signInAsGuest,
  signInWithPassword,
  verifyCode,
  type LoginState,
} from "./actions";

// The code flow has several submit buttons; `intent` tells the single reducer which one fired.
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

export function LoginForm({ next, guestEnabled }: { next: string; guestEnabled: boolean }) {
  const [mode, setMode] = useState<"password" | "code">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    {},
  );
  const [codeState, codeAction, codePending] = useActionState<LoginState, FormData>(codeFlow, {});
  const state = mode === "password" ? passwordState : codeState;
  const pending = passwordPending || codePending;
  const codeStep = mode === "code" && codeState.step === "code";

  return (
    <div className="flex flex-col gap-4">
      <form
        action={mode === "password" ? passwordAction : codeAction}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="next" value={next} />
        {codeStep ? (
          <>
            <input type="hidden" name="email" value={codeState.email ?? ""} />
            <p className="text-muted text-sm">{codeState.email}</p>
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
          <>
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
            {mode === "password" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="password">{t.auth.password}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-12 md:h-9"
                />
              </div>
            ) : null}
          </>
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
          {mode === "password" ? t.auth.signIn : codeStep ? t.auth.signIn : t.auth.sendCode}
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
        <Button
          variant="ghost"
          size="touch"
          className="md:h-9 md:text-sm"
          onClick={() => setMode(mode === "password" ? "code" : "password")}
        >
          {mode === "password" ? t.auth.useCode : t.auth.usePassword}
        </Button>
      </form>
      {guestEnabled ? (
        <form action={signInAsGuest}>
          <Button type="submit" variant="ghost" size="touch" className="w-full md:h-9 md:text-sm">
            {t.auth.guestSignIn}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
