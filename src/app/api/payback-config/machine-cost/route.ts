import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import {
  serializePaybackConfig,
  updatePaybackConfig,
} from "@/lib/paybackConfigHelpers";
import { resolvePaybackAccountType } from "@/lib/helpers/paybackAccountType";

/**
 * PATCH /api/payback-config/machine-cost
 *
 * Lets a self-mining account (User.segment === "SELF_MINING", e.g. "Higgs
 * Self Mining") set the machine cost its own payback analysis is built on.
 * Those accounts read the COMPANY profile — there's no client invoice to
 * stand in for capital — so this writes the COMPANY config, the same record
 * the admin company page edits.
 *
 * Deliberately narrow: only the machine cost of the miner named in the body,
 * and only for self-mining accounts. Every other config field stays
 * admin-only via /api/admin/payback-config-company.
 */

const MACHINE_COST_FIELD = {
  S21PRO: "s21proMachineCost",
  S21XP: "s21xpMachineCost",
} as const;

type MinerKey = keyof typeof MACHINE_COST_FIELD;

const isMinerKey = (value: unknown): value is MinerKey =>
  typeof value === "string" && value in MACHINE_COST_FIELD;

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("[Machine Cost API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { segment: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Client accounts drive capital off their invoiced amount instead, and
    // must never be able to write the company-wide config.
    if (resolvePaybackAccountType(user.segment) !== "SELF_MINING") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { miner, machineCost } = body ?? {};

    if (!isMinerKey(miner)) {
      return NextResponse.json(
        { success: false, error: "Invalid miner model" },
        { status: 400 },
      );
    }

    const numValue =
      typeof machineCost === "string" ? parseFloat(machineCost) : machineCost;

    if (typeof numValue !== "number" || !Number.isFinite(numValue)) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid machine cost" },
        { status: 400 },
      );
    }

    if (numValue < 0) {
      return NextResponse.json(
        { success: false, error: "Machine cost cannot be negative" },
        { status: 400 },
      );
    }

    const updated = await updatePaybackConfig("COMPANY", {
      [MACHINE_COST_FIELD[miner]]: numValue,
    });

    return NextResponse.json({
      success: true,
      data: serializePaybackConfig(updated),
    });
  } catch (error) {
    console.error("[Machine Cost API] Error updating machine cost:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update machine cost",
      },
      { status: 500 },
    );
  }
}
