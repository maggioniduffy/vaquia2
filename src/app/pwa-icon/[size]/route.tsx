import { ImageResponse } from "next/og";
import { appIconDataUri } from "@/lib/brand/app-icon";

const SIZES = [192, 512];

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const px = Number((await ctx.params).size);
  if (!SIZES.includes(px)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appIconDataUri} width={px} height={px} alt="" />,
    { width: px, height: px },
  );
}
