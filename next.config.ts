import type { NextConfig } from "next";

// Content-Security-Policy is deliberately not included here yet - it needs a
// compatibility pass first (MUI/emotion inline styles, the data: URI used for
// the 2FA QR code image, Cloudinary-hosted images, Google Fonts) before it can
// be turned on without breaking existing pages. Tracked as a separate,
// follow-up task rather than bundled into this baseline header set.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  // serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
