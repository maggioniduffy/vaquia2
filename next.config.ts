import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Certificates (<= 4 MB, Vercel's body cap is 4.5 MB) and CSV imports go through Server Actions.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default withSerwist(nextConfig);
