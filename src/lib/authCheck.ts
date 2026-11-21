import { dedupeInFlight } from "@/lib/dedupeInFlight";

export interface AuthCheckResult {
  ok: boolean;
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** GET /api/auth/check, one request however many callers ask at once. */
export function fetchAuthCheck(): Promise<AuthCheckResult> {
  return dedupeInFlight("auth-check", async () => {
    const res = await fetch("/api/auth/check", {
      credentials: "include",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  });
}
