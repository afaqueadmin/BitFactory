import { NextRequest } from "next/server";

/**
 * Receives Content-Security-Policy violation reports (see next.config.ts)
 * and writes one short line per report to the server log, so a source the
 * policy is missing shows up before CSP_ENFORCE is turned on.
 *
 * Public by necessity (browsers send these without credentials), so it only
 * logs, caps the body size, and logs at most LOG_LIMIT reports a minute per
 * server instance.
 */
const MAX_BODY_BYTES = 8 * 1024;
const LOG_LIMIT = 60;
let windowStart = 0;
let loggedInWindow = 0;

type CspReport = {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "source-file"?: string;
  "line-number"?: number;
};

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES)
      return new Response(null, { status: 204 });

    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      loggedInWindow = 0;
    }
    if (loggedInWindow >= LOG_LIMIT) return new Response(null, { status: 204 });
    loggedInWindow++;

    const body = JSON.parse(text) as { "csp-report"?: CspReport };
    const report = body["csp-report"];
    if (report) {
      const page = report["document-uri"]
        ? new URL(report["document-uri"]).pathname
        : "?";
      console.warn(
        "[CSP violation]",
        JSON.stringify({
          page,
          directive:
            report["effective-directive"] ?? report["violated-directive"],
          blocked: report["blocked-uri"],
          source: report["source-file"]
            ? `${report["source-file"]}:${report["line-number"] ?? "?"}`
            : undefined,
        }),
      );
    }
  } catch {
    // Malformed report - nothing to log.
  }
  return new Response(null, { status: 204 });
}
