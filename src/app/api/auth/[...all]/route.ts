import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { isBlockedAuthPath } from "./blocked";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

export async function POST(request: Request) {
  if (isBlockedAuthPath(new URL(request.url).pathname)) {
    return new Response("Not found", { status: 404 });
  }
  return handler.POST(request);
}
