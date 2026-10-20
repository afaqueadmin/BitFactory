/**
 * Turning a regular customer into a simulated account - shared by the admin
 * "Change to Simulated Account" action and approving a customer's own
 * request for one. Writes the user row, their open sessions, an audit entry
 * and the welcome bonus that starts their simulated ledger.
 */

import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { SIM_CONVERSION_NOTE } from "./config";
import { startSimLedger } from "./ledgerStore";
import { currentWelcomeBonusUsd } from "./settings";

/** UserActivity types for a customer's request (no table of its own). */
export const SIM_REQUEST_ACTIVITY = "SIMULATION_REQUESTED";
export const SIM_REQUEST_DECLINED_ACTIVITY = "SIMULATION_REQUEST_DECLINED";

export class SimConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimConversionError";
  }
}

/**
 * Why `userId` can't become a simulated account, or null if it can. A
 * simulated account is never billed and drops out of every customer list,
 * so only a direct customer with nothing real on the account qualifies.
 */
export async function simConversionBlocker(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isDeleted: true, franchiseeId: true },
  });
  if (!user || user.isDeleted) return "Customer not found";
  if (user.role !== "CLIENT") {
    return "Only a regular customer can be changed to a simulated account";
  }
  if (user.franchiseeId) {
    return "This customer is assigned to a franchise. Change them to a Direct BitFactory Customer first.";
  }

  const [miners, poolAuths, invoices, payments] = await Promise.all([
    prisma.miner.count({ where: { userId, isDeleted: false } }),
    prisma.poolAuth.count({ where: { userId } }),
    prisma.invoice.count({ where: { userId } }),
    prisma.costPayment.count({ where: { userId, isDeleted: false } }),
  ]);
  const blockers = [
    miners && `${miners} miner(s)`,
    poolAuths && `${poolAuths} pool subaccount(s)`,
    invoices && `${invoices} invoice(s)`,
    payments && `${payments} payment/ledger entr(ies)`,
  ].filter(Boolean);
  return blockers.length > 0
    ? `Only a customer with no miners, subaccounts, invoices or payments can become a simulated account. This one has ${blockers.join(", ")}.`
    : null;
}

/**
 * Converts after checking simConversionBlocker. Signs the account out
 * everywhere (its role is in the token); the simulation starts at the audit
 * entry written here (see getSimContext), not at registration.
 */
export async function convertToSimulated(
  userId: string,
  actorId: string,
): Promise<{ label: string; email: string; name: string | null }> {
  const blocker = await simConversionBlocker(userId);
  if (blocker) throw new SimConversionError(blocker);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, segment: true },
  });
  const label = user.name || user.email;

  const now = new Date();
  const bonusUsd = await currentWelcomeBonusUsd();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        role: "SIMULATED",
        segment: null,
        sessionsValidAfter: sessionCutoffNow(),
      },
    });
    await tx.userSession.updateMany({
      where: { userId, logoutAt: null },
      data: { logoutAt: now },
    });
    await tx.auditLog.create({
      data: {
        action: AuditAction.USER_UPDATED,
        entityType: "User",
        entityId: userId,
        userId: actorId,
        description: `User ${label} ${SIM_CONVERSION_NOTE}`,
        changes: JSON.stringify({
          role: { from: "CLIENT", to: "SIMULATED" },
          segment: { from: user.segment, to: null },
        }),
        // The simulation starts here (see loadSimStart), with the bonus.
        createdAt: now,
      },
    });
    await startSimLedger(tx, userId, now, bonusUsd, actorId);
  });

  return { label, email: user.email, name: user.name };
}

/**
 * Customers whose latest simulation request is still open: they asked,
 * no admin has declined since, and they're still an active regular
 * customer (approving converts them, which closes the request).
 */
export async function pendingSimulationRequests(): Promise<
  Array<{
    id: string;
    name: string | null;
    email: string;
    phoneNumber: string | null;
    requestedAt: Date;
  }>
> {
  const activities = await prisma.userActivity.findMany({
    where: {
      type: { in: [SIM_REQUEST_ACTIVITY, SIM_REQUEST_DECLINED_ACTIVITY] },
      user: { role: "CLIENT", isDeleted: false },
    },
    orderBy: { createdAt: "desc" },
    select: {
      type: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, email: true, phoneNumber: true },
      },
    },
  });

  const latestByUser = new Map<string, (typeof activities)[number]>();
  for (const a of activities) {
    if (!latestByUser.has(a.user.id)) latestByUser.set(a.user.id, a);
  }
  return Array.from(latestByUser.values())
    .filter((a) => a.type === SIM_REQUEST_ACTIVITY)
    .map((a) => ({ ...a.user, requestedAt: a.createdAt }));
}

/** The caller's own request status, for the dashboard card. */
export async function simulationRequestStatus(
  userId: string,
): Promise<"none" | "pending" | "declined"> {
  const latest = await prisma.userActivity.findFirst({
    where: {
      userId,
      type: { in: [SIM_REQUEST_ACTIVITY, SIM_REQUEST_DECLINED_ACTIVITY] },
    },
    orderBy: { createdAt: "desc" },
    select: { type: true },
  });
  if (!latest) return "none";
  return latest.type === SIM_REQUEST_ACTIVITY ? "pending" : "declined";
}
