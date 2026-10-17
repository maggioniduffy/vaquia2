import { ImageResponse } from "next/og";
import { appIconDataUri } from "@/lib/brand/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <img src={appIconDataUri} width={180} height={180} alt="" />,
    size,
  );
}
