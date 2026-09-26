import { AuditAction, Prisma } from "@prisma/client";

/**
 * PoolAuth (a client's Luxor/Braiins subaccount credential) is written from
 * six call sites across four route files - the two dedicated pool-auth
 * admin routes, plus four dual-write sync sites embedded in user/franchisee
 * create and update. Shared here rather than pasted six times.
 */
export async function logPoolCredentialChange(
  client: Prisma.TransactionClient,
  args: {
    action:
      | typeof AuditAction.POOL_CREDENTIAL_ADDED
      | typeof AuditAction.POOL_CREDENTIAL_UPDATED
      | typeof AuditAction.POOL_CREDENTIAL_REMOVED;
    userId: string;
    actorId: string;
    poolName: string;
    /**
     * Shown in the description. Only pass non-secret identifiers (Luxor
     * subaccount names) - never a Braiins API token.
     */
    credentialName?: string;
  },
) {
  const verb =
    args.action === AuditAction.POOL_CREDENTIAL_ADDED
      ? "added"
      : args.action === AuditAction.POOL_CREDENTIAL_UPDATED
        ? "updated"
        : "removed";

  await client.auditLog.create({
    data: {
      action: args.action,
      entityType: "User",
      entityId: args.userId,
      userId: args.actorId,
      description: `${args.poolName} pool credential ${verb}${args.credentialName ? ` (${args.credentialName})` : ""}`,
    },
  });
}
