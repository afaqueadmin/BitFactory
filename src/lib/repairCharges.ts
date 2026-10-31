/**
 * Repair price lists (RepairCharge / RepairSiteSetting): shared types, labels,
 * input parsing and price formatting for /api/repair-charges, the client
 * /repair-charges page and the admin /admin/repair-charges page. No server
 * imports, so it's safe in client components.
 */

export const REPAIR_SITES = ["BRAZIL", "ETHIOPIA"] as const;
export type RepairSite = (typeof REPAIR_SITES)[number];

export const REPAIR_PRICE_TYPES = ["FIXED", "RANGE", "EXTERNAL"] as const;
export type RepairPriceType = (typeof REPAIR_PRICE_TYPES)[number];

export const REPAIR_SITE_LABELS: Record<RepairSite, string> = {
  BRAZIL: "Brazil",
  ETHIOPIA: "Ethiopia",
};

export const REPAIR_PRICE_TYPE_LABELS: Record<RepairPriceType, string> = {
  FIXED: "Fixed price",
  RANGE: "Price range",
  EXTERNAL: "Per manufacturer website",
};

export const MAX_REPAIR_TYPE_LENGTH = 120;
export const MAX_REPAIR_NOTE_LENGTH = 300;
export const MAX_REPAIR_URL_LENGTH = 500;

/** API shape: Decimal columns serialized as numbers. */
export interface RepairChargeItem {
  id: string;
  site: RepairSite;
  repairType: string;
  priceType: RepairPriceType;
  amount: number | null;
  amountMax: number | null;
  note: string | null;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface RepairSiteSettingItem {
  site: RepairSite;
  handsAndEyesFee: number;
  partsUrl: string | null;
}

/** GET shape: updatedAt is the site's last price-list or settings change (ISO). */
export interface RepairSiteSettingView extends RepairSiteSettingItem {
  updatedAt: string;
}

export const isRepairSite = (v: unknown): v is RepairSite =>
  typeof v === "string" && (REPAIR_SITES as readonly string[]).includes(v);

const isPriceType = (v: unknown): v is RepairPriceType =>
  typeof v === "string" &&
  (REPAIR_PRICE_TYPES as readonly string[]).includes(v);

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
export const formatRepairUsd = (n: number) => formatter.format(n);

/** "$120", "$150 – $180", or "See website" for EXTERNAL. */
export function formatRepairPrice(
  charge: Pick<RepairChargeItem, "priceType" | "amount" | "amountMax">,
): string {
  if (charge.priceType === "EXTERNAL" || charge.amount === null) {
    return "See website";
  }
  if (charge.priceType === "RANGE" && charge.amountMax !== null) {
    return `${formatRepairUsd(charge.amount)} – ${formatRepairUsd(charge.amountMax)}`;
  }
  return formatRepairUsd(charge.amount);
}

/** Empty -> null; otherwise must be an http(s) URL. */
function parseUrl(v: unknown): { value: string | null } | { error: string } {
  if (v === undefined || v === null || v === "") return { value: null };
  if (typeof v !== "string") return { error: "Link must be a URL" };
  const s = v.trim();
  if (!s) return { value: null };
  if (s.length > MAX_REPAIR_URL_LENGTH) {
    return { error: `Link is too long (max ${MAX_REPAIR_URL_LENGTH})` };
  }
  try {
    const url = new URL(s);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "Link must start with http:// or https://" };
    }
  } catch {
    return { error: "Link must be a valid URL" };
  }
  return { value: s };
}

function parseAmount(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

export interface RepairChargeInput {
  site: RepairSite;
  repairType: string;
  priceType: RepairPriceType;
  amount: number | null;
  amountMax: number | null;
  note: string | null;
  linkUrl: string | null;
  isActive: boolean;
}

/**
 * Validates a full charge (create, or an edit merged onto the existing row).
 * FIXED needs amount; RANGE needs amount < amountMax; EXTERNAL stores no
 * amounts. Amounts the price type doesn't use are cleared.
 */
export function parseRepairChargeInput(
  body: Record<string, unknown>,
): RepairChargeInput | { error: string } {
  if (!isRepairSite(body.site)) return { error: "Choose a site" };

  const repairType =
    typeof body.repairType === "string" ? body.repairType.trim() : "";
  if (!repairType || repairType.length > MAX_REPAIR_TYPE_LENGTH) {
    return {
      error: `Repair type is required (max ${MAX_REPAIR_TYPE_LENGTH} characters)`,
    };
  }

  const priceType = body.priceType ?? "FIXED";
  if (!isPriceType(priceType)) return { error: "Invalid price type" };

  const amount = parseAmount(body.amount);
  const amountMax = parseAmount(body.amountMax);
  if (amount === undefined || amountMax === undefined) {
    return { error: "Amounts must be numbers of 0 or more" };
  }
  if (priceType !== "EXTERNAL" && amount === null) {
    return { error: "Enter a price" };
  }
  if (priceType === "RANGE" && (amountMax === null || amountMax <= amount!)) {
    return { error: "Maximum price must be higher than the minimum" };
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > MAX_REPAIR_NOTE_LENGTH) {
    return { error: `Note is too long (max ${MAX_REPAIR_NOTE_LENGTH})` };
  }

  const link = parseUrl(body.linkUrl);
  if ("error" in link) return link;

  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return { error: "isActive must be true or false" };
  }

  return {
    site: body.site,
    repairType,
    priceType,
    amount: priceType === "EXTERNAL" ? null : amount,
    amountMax: priceType === "RANGE" ? amountMax : null,
    note,
    linkUrl: link.value,
    isActive: body.isActive ?? true,
  };
}

export function parseRepairSiteSettingInput(
  body: Record<string, unknown>,
): RepairSiteSettingItem | { error: string } {
  if (!isRepairSite(body.site)) return { error: "Choose a site" };
  const fee = parseAmount(body.handsAndEyesFee);
  if (fee === undefined || fee === null) {
    return { error: "Hands & eyes fee must be a number of 0 or more" };
  }
  const link = parseUrl(body.partsUrl);
  if ("error" in link) return link;
  return { site: body.site, handsAndEyesFee: fee, partsUrl: link.value };
}
