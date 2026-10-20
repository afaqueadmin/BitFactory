import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSimAdmin } from "@/lib/simulation/adminAuth";
import {
  DEFAULT_SIM_DISPLAY_NAME,
  SIM_SETTINGS_ID,
  getSimSettings,
} from "@/lib/simulation/settings";

export const runtime = "nodejs";

const minerSelect = {
  id: true,
  name: true,
  status: true,
  hardware: { select: { model: true, powerUsage: true } },
  user: { select: { name: true, email: true } },
  rateHistory: {
    select: { rate_per_kwh: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} as const;

type MinerRow = {
  id: string;
  name: string;
  status: string;
  hardware: { model: string; powerUsage: number };
  user: { name: string | null; email: string };
  rateHistory: Array<{ rate_per_kwh: unknown }>;
};

const minerView = (m: MinerRow) => ({
  id: m.id,
  name: m.name,
  status: m.status,
  model: m.hardware.model,
  powerUsageKw: m.hardware.powerUsage,
  ownerName: m.user.name || m.user.email,
  realRatePerKwh: m.rateHistory.length
    ? Number(m.rateHistory[0].rate_per_kwh)
    : 0,
});

/**
 * GET /api/simulated-accounts/settings  (ADMIN / SUPER_ADMIN)
 *
 * The simulation settings, the miner they mirror (with its real rate and
 * power for reference) and the miners an admin can pick from.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSimAdmin(request);
    if ("response" in auth) return auth.response;

    const [settings, miners] = await Promise.all([
      getSimSettings(),
      prisma.miner.findMany({
        where: { isDeleted: false },
        orderBy: { name: "asc" },
        select: minerSelect,
      }),
    ]);

    const source = settings
      ? miners.find((m) => m.id === settings.sourceMinerId)
      : undefined;

    return NextResponse.json({
      success: true,
      settings: settings && {
        sourceMinerId: settings.sourceMinerId,
        displayName: settings.displayName,
        welcomeBonusUsd: settings.welcomeBonusUsd,
        ratePerKwh: settings.ratePerKwh,
        stored: settings.stored,
      },
      sourceMiner: source ? minerView(source) : null,
      miners: miners.map(minerView),
    });
  } catch (error) {
    console.error("[Simulation Settings API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load simulation settings" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/simulated-accounts/settings  (ADMIN / SUPER_ADMIN)
 * Body: { sourceMinerId, displayName, welcomeBonusUsd, ratePerKwh }
 *
 * A new rate applies from the next daily charge; a new bonus applies to
 * accounts that start from now on. Charges and bonuses already written stay.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSimAdmin(request);
    if ("response" in auth) return auth.response;

    const body = await request.json().catch(() => ({}));
    const sourceMinerId =
      typeof body.sourceMinerId === "string" ? body.sourceMinerId.trim() : "";
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : DEFAULT_SIM_DISPLAY_NAME;
    const welcomeBonusUsd = Number(body.welcomeBonusUsd);
    const ratePerKwh = Number(body.ratePerKwh);

    if (!sourceMinerId) {
      return NextResponse.json(
        { error: "Choose the miner to mirror" },
        { status: 400 },
      );
    }
    if (displayName.length > 60) {
      return NextResponse.json(
        { error: "Display name must be 60 characters or fewer" },
        { status: 400 },
      );
    }
    if (
      !Number.isFinite(welcomeBonusUsd) ||
      welcomeBonusUsd < 0 ||
      welcomeBonusUsd > 1_000_000
    ) {
      return NextResponse.json(
        { error: "Welcome bonus must be between 0 and 1,000,000" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(ratePerKwh) || ratePerKwh < 0 || ratePerKwh > 10) {
      return NextResponse.json(
        { error: "Rate must be between 0 and 10 USD per kWh" },
        { status: 400 },
      );
    }

    const miner = await prisma.miner.findFirst({
      where: { id: sourceMinerId, isDeleted: false },
      select: { id: true },
    });
    if (!miner) {
      return NextResponse.json({ error: "Miner not found" }, { status: 404 });
    }

    const before = await getSimSettings();
    const data = {
      sourceMinerId,
      displayName,
      welcomeBonusUsd: Math.round(welcomeBonusUsd * 100) / 100,
      ratePerKwh,
      updatedById: auth.actorId,
    };

    await prisma.$transaction(async (tx) => {
      await tx.simulationSettings.upsert({
        where: { id: SIM_SETTINGS_ID },
        create: { id: SIM_SETTINGS_ID, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PRICING_CONFIG_UPDATED,
          entityType: "SimulationSettings",
          entityId: String(SIM_SETTINGS_ID),
          userId: auth.actorId,
          description: "Simulation settings updated",
          changes: JSON.stringify({
            from: before && {
              sourceMinerId: before.sourceMinerId,
              displayName: before.displayName,
              welcomeBonusUsd: before.welcomeBonusUsd,
              ratePerKwh: before.ratePerKwh,
            },
            to: {
              sourceMinerId,
              displayName,
              welcomeBonusUsd: data.welcomeBonusUsd,
              ratePerKwh,
            },
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Simulation settings saved",
    });
  } catch (error) {
    console.error("[Simulation Settings API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save simulation settings" },
      { status: 500 },
    );
  }
}
