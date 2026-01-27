import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingIncludes: {
    "/api/pdf/generate": ["node_modules/@sparticuz/chromium-min/**"],
  },
};

export default nextConfig;
