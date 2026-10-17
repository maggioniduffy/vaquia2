"use server";

import { signInAsGuest } from "@/app/(auth)/login/actions";

// Form-action wrapper: signInAsGuest returns a LoginState, forms need void. On success it redirects.
export async function guestDemo(): Promise<void> {
  const result = await signInAsGuest();
  if (result?.error) throw new Error(result.error);
}
