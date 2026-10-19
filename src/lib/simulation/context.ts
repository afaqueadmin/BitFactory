/**
 * Entry point for simulated (demo) accounts. Client routes call simRoute()
 * right after verifying the token; for a SIMULATED caller it answers with
 * the demo miner's data instead of the caller's (they have none), for
 * everyone else it returns null and the route carries on as before.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WorkerSubaccount } from "@/lib/hashrateHistory";
import {
  SIM_CONVERSION_NOTE,
  isSimulatedRole,
  simDemoMinerId,
  simDemoMinerName,
} from "./config";
import type { RatePoint } from "./ledger";

export class SimNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimNotConfiguredError";
  }
}

export interface DemoMiner {
  id: string;
  /** The real name - also its Luxor worker name. Never sent to a demo user. */
  workerName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  warrantyExpiresAt: Date | null;
  hardwareId: string;
  spaceId: string;
  poolId: string | null;
  ownerId: string;
  hardware: {
    id: string;
    model: string;
    powerUsage: number;
    hashRate: string;
  };
  space: { location: string; name: string };
  pool: { id: string; name: string } | null;
  rates: RatePoint[];
}

export interface SimContext {
  userId: string;
  /** Registration time; every simulated series starts on this UTC day. */
  since: Date;
  now: Date;
  demoMiner: DemoMiner;
  /** What the demo miner and its worker are shown as. */
  displayName: string;
  /** The owner's Luxor subaccounts - the miner can sit in any of them. */
  ownerSubaccounts: WorkerSubaccount[];
}

async function loadDemoMiner(): Promise<DemoMiner> {
  const id = simDemoMinerId();
  if (!id) throw new SimNotConfiguredError("SIM_DEMO_MINER_ID is not set");

  const miner = await prisma.miner.findFirst({
    where: { id, isDeleted: false },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      warrantyExpiresAt: true,
      hardwareId: true,
      spaceId: true,
      poolId: true,
      userId: true,
      hardware: {
        select: { id: true, model: true, powerUsage: true, hashRate: true },
      },
      space: { select: { location: true, name: true } },
      pool: { select: { id: true, name: true } },
      rateHistory: {
        select: { rate_per_kwh: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!miner) {
    throw new SimNotConfiguredError(`Demo miner ${id} not found`);
  }

  return {
    id: miner.id,
    workerName: miner.name,
    status: miner.status,
    createdAt: miner.createdAt,
    updatedAt: miner.updatedAt,
    warrantyExpiresAt: miner.warrantyExpiresAt,
    hardwareId: miner.hardwareId,
    spaceId: miner.spaceId,
    poolId: miner.poolId,
    ownerId: miner.userId,
    hardware: {
      id: miner.hardware.id,
      model: miner.hardware.model,
      powerUsage: miner.hardware.powerUsage,
      hashRate: miner.hardware.hashRate.toString(),
    },
    space: miner.space,
    pool: miner.pool,
    rates: miner.rateHistory.map((r) => ({
      effectiveFrom: r.createdAt,
      ratePerKwh: Number(r.rate_per_kwh),
    })),
  };
}

async function loadOwnerSubaccounts(
  ownerId: string,
): Promise<WorkerSubaccount[]> {
  const rows = await prisma.poolSubaccount.findMany({
    where: { userId: ownerId, pool: { name: "Luxor" } },
    include: { poolAuth: true },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .filter((s) => !!s.poolAuth)
    .map((s) => ({
      poolSubaccountId: s.id,
      subaccountName: s.poolAuth!.authKey,
    }));
}

/** Null for any caller that isn't a demo account. */
export async function getSimContext(decoded: {
  userId: string;
  role: string;
}): Promise<SimContext | null> {
  if (!isSimulatedRole(decoded.role)) return null;

  const [user, conversion, demoMiner] = await Promise.all([
    prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { createdAt: true },
    }),
    // An existing customer an admin turned into a demo account starts from
    // that moment, not from when the account was first created.
    prisma.auditLog.findFirst({
      where: {
        entityType: "User",
        entityId: decoded.userId,
        action: "USER_UPDATED",
        description: { endsWith: SIM_CONVERSION_NOTE },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    loadDemoMiner(),
  ]);
  if (!user) throw new SimNotConfiguredError("Demo account not found");

  const since =
    conversion && conversion.createdAt > user.createdAt
      ? conversion.createdAt
      : user.createdAt;

  return {
    userId: decoded.userId,
    since,
    now: new Date(),
    demoMiner,
    displayName: simDemoMinerName(),
    ownerSubaccounts: await loadOwnerSubaccounts(demoMiner.ownerId),
  };
}

/**
 * Runs `handler` for a demo account and returns its response, or null for
 * anyone else. A missing demo-miner setup answers 503 rather than leaking
 * into the route's normal path.
 */
export async function simRoute(
  decoded: { userId: string; role: string },
  handler: (ctx: SimContext) => Promise<Response> | Response,
): Promise<Response | null> {
  if (!isSimulatedRole(decoded.role)) return null;
  try {
    const ctx = await getSimContext(decoded);
    if (!ctx) return null;
    return await handler(ctx);
  } catch (error) {
    if (error instanceof SimNotConfiguredError) {
      console.error(`[Simulation] ${error.message}`);
      return NextResponse.json(
        { success: false, error: "Demo data is not available right now" },
        { status: 503 },
      );
    }
    throw error;
  }
}

/** Blocks an action for demo accounts; null when the caller may proceed. */
export function rejectIfSimulated(role: string): NextResponse | null {
  if (!isSimulatedRole(role)) return null;
  return NextResponse.json(
    { success: false, error: "Not available on demo accounts" },
    { status: 403 },
  );
}
