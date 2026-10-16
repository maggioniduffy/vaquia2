import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  redirect(homePathFor(session.active?.role));
}
