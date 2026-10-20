import { createSerwistRoute } from "@serwist/turbopack";

// Serves the service worker (and its chunks) at /serwist/sw.js. Exempt from the auth guard in src/proxy.ts.
// A fresh revision per build keeps the precached offline fallback current.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  },
);
