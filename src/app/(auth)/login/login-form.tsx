"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    { error: initialError },
  );
  const [magicState, magicAction, magicPending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    {},
  );
  const state = mode === "password" ? passwordState : magicState;
  const pending = passwordPending || magicPending;

  return (
    <form
      action={mode === "password" ? passwordAction : magicAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="next" value={next} />
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
        className="md:h-9 md:text-sm"
      >
        {mode === "password" ? t.auth.signIn : t.auth.sendMagicLink}
      </Button>
      <Button
        variant="ghost"
        size="touch"
        className="md:h-9 md:text-sm"
        onClick={() => setMode(mode === "password" ? "magic" : "password")}
      >
        {mode === "password" ? t.auth.useMagicLink : t.auth.usePassword}
      </Button>
    </form>
  );
}
