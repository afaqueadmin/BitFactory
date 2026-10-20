/**
 * Entry point for simulated accounts. Client routes call simRoute()
 * right after verifying the token; for a SIMULATED caller it answers with
 * the simulated miner's data instead of the caller's (they have none), for
 * everyone else it returns null and the route carries on as before.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WorkerSubaccount } from "@/lib/hashrateHistory";
import {
  SIM_CONVERSION_NOTE,
  SIM_CONVERSION_NOTE_LEGACY,
  SIM_REREGISTER_NOTE,
  isSimulatedRole,
} from "./config";
import { getSimSettings, type SimSettings } from "./settings";

export class SimNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimNotConfiguredError";
  }
}

export interface DemoMiner {
  id: string;
  /** The real name - also its Luxor worker name. Never sent to a simulated user. */
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
  /** The real miner's own latest rate - shown to admins for reference. */
  realRatePerKwh: number;
}

export interface SimContext {
  userId: string;
  /** Registration time; every simulated series starts on this UTC day. */
  since: Date;
  now: Date;
  demoMiner: DemoMiner;
  /** What the simulated miner and its worker are shown as. */
  displayName: string;
  /** USD/kWh simulated charges use (simulation_settings). */
  ratePerKwh: number;
  /** The owner's Luxor subaccounts - the miner can sit in any of them. */
  ownerSubaccounts: WorkerSubaccount[];
}

/** Settings plus the miner they point at; throws when either is missing. */
export async function loadSimSetup(): Promise<{
  settings: SimSettings;
  demoMiner: DemoMiner;
  /** The settings rate, or the real miner's own on the env fallback. */
  ratePerKwh: number;
}> {
  const settings = await getSimSettings();
  if (!settings) {
    throw new SimNotConfiguredError("Simulation settings are not set");
  }
  const demoMiner = await loadDemoMiner(settings.sourceMinerId);
  return {
    settings,
    demoMiner,
    ratePerKwh: settings.ratePerKwh ?? demoMiner.realRatePerKwh,
  };
}

/** USD charged per day for the simulated miner: kW x rate x 24. */
export function simDailyChargeUsd(
  demoMiner: Pick<DemoMiner, "hardware">,
  ratePerKwh: number,
): number {
  return (
    Math.round(demoMiner.hardware.powerUsage * ratePerKwh * 24 * 100) / 100
  );
}

async function loadDemoMiner(id: string): Promise<DemoMiner> {
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
        select: { rate_per_kwh: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!miner) {
    throw new SimNotConfiguredError(`Simulated miner ${id} not found`);
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
    realRatePerKwh: miner.rateHistory.length
      ? Number(miner.rateHistory[0].rate_per_kwh)
      : 0,
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

/**
 * When a simulated account's simulation starts: registration, or - for an
 * existing customer an admin turned into a simulated account, or an inactive
 * one re-registered - that later moment. Null if the user doesn't exist.
 */
export async function loadSimStart(userId: string): Promise<Date | null> {
  const [user, restart] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
    prisma.auditLog.findFirst({
      where: {
        entityType: "User",
        entityId: userId,
        action: "USER_UPDATED",
        OR: [
          { description: { endsWith: SIM_CONVERSION_NOTE } },
          { description: { endsWith: SIM_CONVERSION_NOTE_LEGACY } },
          { description: { endsWith: SIM_REREGISTER_NOTE } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  if (!user) return null;
  return restart && restart.createdAt > user.createdAt
    ? restart.createdAt
    : user.createdAt;
}

/** Null for any caller that isn't a simulated account. */
export async function getSimContext(decoded: {
  userId: string;
  role: string;
}): Promise<SimContext | null> {
  if (!isSimulatedRole(decoded.role)) return null;

  const [since, setup] = await Promise.all([
    loadSimStart(decoded.userId),
    loadSimSetup(),
  ]);
  if (!since) throw new SimNotConfiguredError("Simulated account not found");

  return {
    userId: decoded.userId,
    since,
    now: new Date(),
    demoMiner: setup.demoMiner,
    displayName: setup.settings.displayName,
    ratePerKwh: setup.ratePerKwh,
    ownerSubaccounts: await loadOwnerSubaccounts(setup.demoMiner.ownerId),
  };
}

/**
 * Runs `handler` for a simulated account and returns its response, or null for
 * anyone else. A missing simulated-miner setup answers 503 rather than leaking
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
        { success: false, error: "Simulation data is not available right now" },
        { status: 503 },
      );
    }
    throw error;
  }
}

/** Blocks an action for simulated accounts; null when the caller may proceed. */
export function rejectIfSimulated(role: string): NextResponse | null {
  if (!isSimulatedRole(role)) return null;
  return NextResponse.json(
    { success: false, error: "Not available on simulated accounts" },
    { status: 403 },
  );
}
