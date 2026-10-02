import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Origin of a configured URL, or null - used to allow the BTCPay checkout
// iframe from wherever BTCPAY_URL points.
function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy (L-1 follow-up). Built from what the app actually
 * loads (checked by crawling every page per role with it enforced): fonts are
 * self-hosted by next/font; images from Cloudinary, the news feed and
 * data:/blob: (2FA QR code, uploads); browser fetches of the BTC price from
 * public exchange APIs; and two iframes - Polymarket and the BTCPay checkout.
 *
 * 'unsafe-inline' scripts are needed by Next.js's inline bootstrap scripts
 * (no nonce setup); styles by MUI/emotion. The rest still blocks script from
 * other sites, exfiltration via fetch/XHR, plugins, <base> hijacking, and
 * form posts elsewhere.
 *
 * Sent as Report-Only (violations go to /api/csp-report and the server log)
 * until CSP_ENFORCE=true, so a missed source can't break a page in
 * production.
 */
function contentSecurityPolicy(): string {
  const frames = ["'self'", "https://embed.polymarket.com"];
  const btcpay = originOf(process.env.BTCPAY_URL);
  if (btcpay) frames.push(btcpay);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://res.cloudinary.com",
      // Bitcoin news article covers (/api/btc-news, from Cointelegraph's feed)
      "https://s3-images.ctmedia.io",
      "https://images.cointelegraph.com",
      "https://s3.cointelegraph.com",
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      // Live BTC price, fetched from the browser by btcPriceService.ts
      "https://data-api.binance.vision",
      "https://api.binance.com",
      "https://api.binance.us",
      "https://api.coinbase.com",
      "https://api.kraken.com",
      "https://api.coingecko.com",
      "https://mempool.space",
      ...(isDev ? ["ws:", "wss:"] : []),
    ],
    "frame-src": frames,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": ["/api/csp-report"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key:
      process.env.CSP_ENFORCE === "true"
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicy(),
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
