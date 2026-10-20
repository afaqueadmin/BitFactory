import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSimAdmin } from "@/lib/simulation/adminAuth";
import {
  SimNotConfiguredError,
  loadSimSetup,
  simDailyChargeUsd,
} from "@/lib/simulation/context";
import { ledgerBalance } from "@/lib/simulation/ledger";
import { loadSimLedger } from "@/lib/simulation/ledgerStore";

export const runtime = "nodejs";

const ADMIN_ENTRY_TYPES = ["PAYMENT", "ADJUSTMENT"] as const;
type AdminEntryType = (typeof ADMIN_ENTRY_TYPES)[number];

async function findSimulatedAccount(id: string) {
  return prisma.user.findFirst({
    where: { id, role: "SIMULATED" },
    select: { id: true, name: true, email: true },
  });
}

/**
 * GET /api/simulated-accounts/[id]/entries  (ADMIN / SUPER_ADMIN)
 *
 * The account's simulated cost ledger, newest first with running balance,
 * plus its balance, current daily cost and days left - what the customer's
 * own dashboard shows.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSimAdmin(request);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const account = await findSimulatedAccount(id);
    if (!account) {
      return NextResponse.json(
        { error: "Simulated account not found" },
        { status: 404 },
      );
    }

    const ledger = await loadSimLedger(id);
    let running = 0;
    const entries = ledger
      .map((r) => {
        running += r.amount;
        return { ...r, balance: running };
      })
      .reverse();

    let dailyCost = 0;
    try {
      const { demoMiner, ratePerKwh } = await loadSimSetup();
      dailyCost =
        demoMiner.status === "AUTO"
          ? simDailyChargeUsd(demoMiner, ratePerKwh)
          : 0;
    } catch (error) {
      if (!(error instanceof SimNotConfiguredError)) throw error;
    }
    const balance = ledgerBalance(ledger);

    return NextResponse.json({
      success: true,
      account,
      balance,
      dailyCost,
      daysLeft: dailyCost > 0 ? Math.floor(balance / dailyCost) : null,
      entries,
    });
  } catch (error) {
    console.error("[Simulated Entries API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load the simulated ledger" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/simulated-accounts/[id]/entries  (ADMIN / SUPER_ADMIN)
 * Body: { type: "PAYMENT" | "ADJUSTMENT", amount, narration? }
 *
 * Same rules as an admin payment on a real customer (POST /api/cost-payments):
 * a non-zero amount, and a narration (max 500) required for an adjustment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSimAdmin(request);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const account = await findSimulatedAccount(id);
    if (!account) {
      return NextResponse.json(
        { error: "Simulated account not found" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const type = body.type as AdminEntryType;
    const amount = Number(body.amount);
    const narration =
      typeof body.narration === "string" ? body.narration.trim() : "";

    if (!ADMIN_ENTRY_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "Type must be PAYMENT or ADJUSTMENT" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e7) {
      return NextResponse.json(
        { error: "Amount must be a non-zero number" },
        { status: 400 },
      );
    }
    if (type === "PAYMENT" && amount < 0) {
      return NextResponse.json(
        { error: "A payment must be positive; use an adjustment to deduct" },
        { status: 400 },
      );
    }
    if (type === "ADJUSTMENT" && !narration) {
      return NextResponse.json(
        { error: "Narration is required for an adjustment" },
        { status: 400 },
      );
    }
    if (narration.length > 500) {
      return NextResponse.json(
        { error: "Narration must not exceed 500 characters" },
        { status: 400 },
      );
    }

    const rounded = Math.round(amount * 100) / 100;
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.simulatedCostPayment.create({
        data: {
          userId: id,
          amount: rounded,
          type,
          narration: narration || null,
          createdById: auth.actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYMENT_ADDED,
          entityType: "SimulatedCostPayment",
          entityId: created.id,
          userId: auth.actorId,
          description: `Simulated ${type === "PAYMENT" ? "payment" : "adjustment"} of ${rounded} USD for ${account.name || account.email}`,
          changes: JSON.stringify({
            simulatedUserId: id,
            type,
            amount: rounded,
            narration: narration || null,
          }),
        },
      });
      return created;
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (error) {
    console.error("[Simulated Entries API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to add the entry" },
      { status: 500 },
    );
  }
}
