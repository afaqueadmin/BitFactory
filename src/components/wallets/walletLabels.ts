import type { DaylightTone } from "@/components/daylight/AdminPage";

/** Display helpers shared by the Wallets module tabs. */

export const SOURCE_LABEL: Record<string, string> = {
  INITIAL_SYNC: "First read from Luxor",
  PAYOUT_HISTORY: "Seen on past payouts",
  CHANGE_REQUEST: "Approved change request",
  LUXOR_ACCEPTED: "Accepted from Luxor",
};

export const CHECK_LABEL: Record<
  string,
  { label: string; tone: DaylightTone }
> = {
  MATCH: { label: "Matches Luxor", tone: "success" },
  MISMATCH: { label: "Differs from Luxor", tone: "danger" },
  LUXOR_EMPTY: { label: "No address on Luxor", tone: "warning" },
  ERROR: { label: "Couldn't reach Luxor", tone: "warning" },
};

export const MISMATCH_STATUS: Record<
  string,
  { label: string; tone: DaylightTone }
> = {
  OPEN: { label: "Open", tone: "danger" },
  RESOLVED_FIXED: { label: "Luxor updated", tone: "success" },
  RESOLVED_ACCEPTED: { label: "Luxor accepted", tone: "info" },
};

export const fmtDate = (v: string | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const fmtDateTime = (v: string | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC"
    : "—";

export const fmtBtc = (n: number) => `${n.toFixed(8)} BTC`;

export const monoSx = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
  wordBreak: "break-all",
} as const;

export const personLabel = (
  p: { name: string | null; email: string } | null | undefined,
) => (p ? p.name || p.email : "—");
