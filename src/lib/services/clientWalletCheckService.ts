import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  auditClientWallet,
  fetchLuxorPrimaryAddress,
  masked,
  sameAddress,
  setClientWalletAddress,
} from "@/lib/clientWallets";
import {
  withRetry,
  sleep,
  SUBACCOUNT_SPACING_MS,
  EXCLUDED_SUBACCOUNTS,
} from "@/lib/services/cronRetry";

/**
 * Compares our wallet record (ClientWallet) with what Luxor holds, per Luxor
 * subaccount. Any difference opens a ClientWalletMismatch (one OPEN row per
 * subaccount) - including right after an approved change request, until an
 * admin has updated Luxor by hand. Only an admin closes a mismatch:
 * markMismatchFixed (Luxor re-fetched and now matches) or
 * acceptLuxorAddress (Luxor's address becomes our record).
 */

export interface WalletCheckRow {
  poolSubaccountId: string;
  subaccountName: string;
  customerName: string | null;
  status: "MATCH" | "MISMATCH" | "LUXOR_EMPTY" | "ERROR" | "NO_RECORD";
  /** Masked. */
  expected: string | null;
  /** Masked. */
  luxor: string | null;
  newMismatch: boolean;
  error?: string;
}

export interface WalletCheckResult {
  checkedAt: string;
  rows: WalletCheckRow[];
  newMismatches: WalletCheckRow[];
  openMismatches: WalletCheckRow[];
  errors: WalletCheckRow[];
  noRecord: WalletCheckRow[];
}

const luxorSubaccounts = (poolSubaccountId?: string) =>
  prisma.poolSubaccount.findMany({
    where: {
      ...(poolSubaccountId ? { id: poolSubaccountId } : {}),
      pool: { name: "Luxor" },
      poolAuthId: { not: null },
      subaccountName: { notIn: [...EXCLUDED_SUBACCOUNTS] },
    },
    orderBy: { subaccountName: "asc" },
    select: {
      id: true,
      subaccountName: true,
      userId: true,
      user: { select: { name: true, email: true } },
      clientWallet: { select: { address: true } },
    },
  });

type Sub = Awaited<ReturnType<typeof luxorSubaccounts>>[number];

/** Checks one subaccount and records the outcome. Never throws. */
async function checkOne(
  sub: Sub,
  now: Date,
  trigger: { actorId: string | null; label: string },
): Promise<WalletCheckRow> {
  const base = {
    poolSubaccountId: sub.id,
    subaccountName: sub.subaccountName,
    customerName: sub.user?.name || sub.user?.email || null,
  };
  if (!sub.clientWallet) {
    return {
      ...base,
      status: "NO_RECORD",
      expected: null,
      luxor: null,
      newMismatch: false,
      error: "No wallet record yet - run scripts/wallet-initial-sync.js",
    };
  }
  const expected = sub.clientWallet.address;

  let luxor: string | null;
  try {
    luxor = await withRetry(
      () => fetchLuxorPrimaryAddress(sub.subaccountName),
      `${sub.subaccountName} payment-settings`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.clientWallet.update({
      where: { poolSubaccountId: sub.id },
      data: {
        lastCheckedAt: now,
        lastCheckStatus: "ERROR",
        lastCheckError: message.slice(0, 500),
      },
    });
    return {
      ...base,
      status: "ERROR",
      expected: masked(expected),
      luxor: null,
      newMismatch: false,
      error: message,
    };
  }

  const matches = sameAddress(expected, luxor);
  const status = matches ? (luxor ? "MATCH" : "LUXOR_EMPTY") : "MISMATCH";

  let newMismatch = false;
  await prisma.$transaction(async (tx) => {
    await tx.clientWallet.update({
      where: { poolSubaccountId: sub.id },
      data: {
        lastCheckedAt: now,
        lastCheckStatus: matches
          ? luxor
            ? "MATCH"
            : "LUXOR_EMPTY"
          : "MISMATCH",
        lastCheckError: null,
      },
    });
    if (matches) return;

    const open = await tx.clientWalletMismatch.findFirst({
      where: { poolSubaccountId: sub.id, status: "OPEN" },
      select: { id: true },
    });
    if (open) {
      await tx.clientWalletMismatch.update({
        where: { id: open.id },
        data: {
          lastSeenAt: now,
          luxorAddress: luxor,
          expectedAddress: expected,
        },
      });
      return;
    }
    const created = await tx.clientWalletMismatch.create({
      data: {
        poolSubaccountId: sub.id,
        expectedAddress: expected,
        luxorAddress: luxor,
        detectedAt: now,
        lastSeenAt: now,
      },
    });
    newMismatch = true;
    // The daily check has no signed-in actor; like the guild cron, the
    // entry sits on the account it concerns and says it was the check.
    const auditUserId = trigger.actorId ?? sub.userId;
    if (!auditUserId) return;
    await auditClientWallet(tx, {
      action: AuditAction.CLIENT_WALLET_MISMATCH_DETECTED,
      poolSubaccountId: sub.id,
      userId: auditUserId,
      description: `Luxor wallet mismatch on ${sub.subaccountName} (${trigger.label}): our record ${masked(expected)}, Luxor ${masked(luxor)}`,
      changes: {
        mismatchId: created.id,
        subaccountName: sub.subaccountName,
        expected: masked(expected),
        luxor: masked(luxor),
      },
    });
  });

  return {
    ...base,
    status,
    expected: masked(expected),
    luxor: masked(luxor),
    newMismatch,
  };
}

/** The daily check (cron_wallet_address_check), or one subaccount on demand. */
export async function checkClientWallets(
  options: {
    poolSubaccountId?: string;
    actorId?: string | null;
    label?: string;
    now?: Date;
  } = {},
): Promise<WalletCheckResult> {
  const now = options.now ?? new Date();
  const subs = await luxorSubaccounts(options.poolSubaccountId);
  const rows: WalletCheckRow[] = [];
  for (const [i, sub] of subs.entries()) {
    if (i > 0) await sleep(SUBACCOUNT_SPACING_MS);
    rows.push(
      await checkOne(sub, now, {
        actorId: options.actorId ?? null,
        label: options.label ?? "daily check",
      }),
    );
  }
  return {
    checkedAt: now.toISOString(),
    rows,
    newMismatches: rows.filter((r) => r.newMismatch),
    openMismatches: rows.filter((r) => r.status === "MISMATCH"),
    errors: rows.filter((r) => r.status === "ERROR"),
    noRecord: rows.filter((r) => r.status === "NO_RECORD"),
  };
}

export class WalletActionError extends Error {}

type Meta = { ipAddress?: string | null; userAgent?: string | null };

const requireNote = (note: unknown): string => {
  if (typeof note !== "string" || note.trim().length < 3) {
    throw new WalletActionError("Add a note explaining this action");
  }
  if (note.length > 2000) throw new WalletActionError("Note is too long");
  return note.trim();
};

async function openMismatch(mismatchId: string) {
  const m = await prisma.clientWalletMismatch.findUnique({
    where: { id: mismatchId },
    include: {
      poolSubaccount: {
        select: { id: true, subaccountName: true, clientWallet: true },
      },
    },
  });
  if (!m) throw new WalletActionError("Mismatch not found");
  if (m.status !== "OPEN") {
    throw new WalletActionError("This mismatch has already been resolved");
  }
  return m;
}

/** Re-checks one subaccount against Luxor now; audited with the note. */
export async function recheckSubaccount(
  poolSubaccountId: string,
  actorId: string,
  noteInput: unknown,
  meta: Meta = {},
) {
  const note = requireNote(noteInput);
  const result = await checkClientWallets({
    poolSubaccountId,
    actorId,
    label: "manual re-check",
  });
  const row = result.rows[0];
  if (!row) throw new WalletActionError("Subaccount not found");
  await auditClientWallet(prisma, {
    action: AuditAction.CLIENT_WALLET_RECHECKED,
    poolSubaccountId,
    userId: actorId,
    description: `Wallet re-checked against Luxor for ${row.subaccountName}: ${row.status}${row.error ? ` (${row.error})` : ""}. Note: ${note}`,
    changes: {
      subaccountName: row.subaccountName,
      status: row.status,
      expected: row.expected,
      luxor: row.luxor,
      note,
    },
    ...meta,
  });
  return row;
}

/**
 * "Luxor has been updated": re-fetches Luxor and closes the mismatch only if
 * Luxor now holds our recorded address.
 */
export async function markMismatchFixed(
  mismatchId: string,
  actorId: string,
  noteInput: unknown,
  meta: Meta = {},
) {
  const note = requireNote(noteInput);
  const m = await openMismatch(mismatchId);
  const sub = m.poolSubaccount;
  const expected = sub.clientWallet?.address ?? null;
  let luxor: string | null;
  try {
    luxor = await fetchLuxorPrimaryAddress(sub.subaccountName);
  } catch (error) {
    throw new WalletActionError(
      `Couldn't reach Luxor to confirm: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (!sameAddress(expected, luxor)) {
    throw new WalletActionError(
      `Luxor still shows ${masked(luxor)}, not our record ${masked(expected)}. Update Luxor first, or accept Luxor's address instead.`,
    );
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.clientWalletMismatch.update({
      where: { id: m.id },
      data: {
        status: "RESOLVED_FIXED",
        resolvedAt: now,
        resolvedById: actorId,
        resolutionNote: note,
        luxorAddress: luxor,
        lastSeenAt: now,
      },
    });
    await tx.clientWallet.update({
      where: { poolSubaccountId: sub.id },
      data: {
        lastCheckedAt: now,
        lastCheckStatus: "MATCH",
        lastCheckError: null,
      },
    });
    await auditClientWallet(tx, {
      action: AuditAction.CLIENT_WALLET_MISMATCH_FIXED,
      poolSubaccountId: sub.id,
      userId: actorId,
      description: `Luxor wallet mismatch on ${sub.subaccountName} resolved: Luxor re-checked and now matches our record ${masked(expected)}. Note: ${note}`,
      changes: {
        mismatchId: m.id,
        subaccountName: sub.subaccountName,
        address: masked(expected),
        note,
      },
      ...meta,
    });
  });
}

/**
 * "Luxor's address is correct": re-fetches Luxor and makes its current
 * address our record (history row LUXOR_ACCEPTED), closing the mismatch.
 */
export async function acceptLuxorAddress(
  mismatchId: string,
  actorId: string,
  noteInput: unknown,
  meta: Meta = {},
) {
  const note = requireNote(noteInput);
  const m = await openMismatch(mismatchId);
  const sub = m.poolSubaccount;
  let luxor: string | null;
  try {
    luxor = await fetchLuxorPrimaryAddress(sub.subaccountName);
  } catch (error) {
    throw new WalletActionError(
      `Couldn't reach Luxor to read its address: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const expected = sub.clientWallet?.address ?? null;
  if (sameAddress(expected, luxor)) {
    throw new WalletActionError(
      "Luxor now matches our record - use “Luxor has been updated” instead.",
    );
  }
  if (!luxor) {
    throw new WalletActionError(
      "Luxor has no payout address for this subaccount, so there's nothing to accept.",
    );
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const { previous } = await setClientWalletAddress(tx, {
      poolSubaccountId: sub.id,
      address: luxor,
      source: "LUXOR_ACCEPTED",
      at: now,
      mismatchId: m.id,
      note,
      actorId,
    });
    await tx.clientWallet.update({
      where: { poolSubaccountId: sub.id },
      data: {
        lastCheckedAt: now,
        lastCheckStatus: "MATCH",
        lastCheckError: null,
      },
    });
    await tx.clientWalletMismatch.update({
      where: { id: m.id },
      data: {
        status: "RESOLVED_ACCEPTED",
        resolvedAt: now,
        resolvedById: actorId,
        resolutionNote: note,
        luxorAddress: luxor,
        lastSeenAt: now,
      },
    });
    await auditClientWallet(tx, {
      action: AuditAction.CLIENT_WALLET_MISMATCH_ACCEPTED,
      poolSubaccountId: sub.id,
      userId: actorId,
      description: `Luxor's wallet accepted for ${sub.subaccountName}: our record changed ${masked(previous)} -> ${masked(luxor)}. Note: ${note}`,
      changes: {
        mismatchId: m.id,
        subaccountName: sub.subaccountName,
        address: { from: masked(previous), to: masked(luxor) },
        note,
      },
      ...meta,
    });
  });
}
