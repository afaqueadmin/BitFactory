/**
 * Handing a guild to a new Guildmaster. Everything the guild owns sits on
 * the Guildmaster's account, so it all moves to the new one: miners (with an
 * ownership history row each), the Luxor subaccount, invoices, ledger,
 * recurring invoices, pricing and memos - plus the invoiced amount that
 * billing and payback analysis read. The new Guildmaster gets the GUILDMASTER
 * segment; the outgoing one stays in the guild as a Guildmember (no segment),
 * keeping their percentage.
 *
 * The new Guildmaster must already be a member: to hand over to someone new,
 * add them as a member first.
 */

import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revokeAllSessions } from "@/lib/auth/sessionRevocation";
import { GuildInputError } from "./accounts";

export async function handOverGuild(params: {
  guildId: string;
  newMasterMembershipId: string;
  actorId: string;
  /** IP and browser for the audit entry (requestMeta). */
  meta?: { ipAddress: string; userAgent: string };
}) {
  const { guildId, newMasterMembershipId, actorId, meta } = params;

  const result = await prisma.$transaction(
    async (tx) => {
      const guild = await tx.guild.findUnique({
        where: { id: guildId },
        include: { memberships: { where: { leftAt: null } } },
      });
      if (!guild || guild.deletedAt) {
        throw new GuildInputError("Guild not found");
      }
      const incoming = guild.memberships.find(
        (m) => m.id === newMasterMembershipId,
      );
      if (!incoming) {
        throw new GuildInputError("The new Guildmaster must be a member");
      }
      if (incoming.isGuildmaster) {
        throw new GuildInputError("They're already the Guildmaster");
      }
      const outgoing = guild.memberships.find((m) => m.isGuildmaster);
      const fromId = guild.guildmasterId;
      const toId = incoming.userId;

      const from = await tx.user.findUniqueOrThrow({
        where: { id: fromId },
        select: { name: true, email: true, invoicedAmount: true },
      });
      const to = await tx.user.findUniqueOrThrow({
        where: { id: toId },
        select: { name: true, email: true },
      });

      const miners = await tx.miner.findMany({
        where: { userId: fromId },
        select: { id: true },
      });
      await tx.miner.updateMany({
        where: { userId: fromId },
        data: { userId: toId, updatedById: actorId },
      });
      if (miners.length > 0) {
        await tx.minerOwnershipHistory.createMany({
          data: miners.map((m) => ({
            minerId: m.id,
            ownerId: toId,
            createdById: actorId,
          })),
        });
      }

      const moved = {
        miners: miners.length,
        poolAuths: (
          await tx.poolAuth.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          })
        ).count,
        poolSubaccounts: (
          await tx.poolSubaccount.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          })
        ).count,
        invoices: (
          await tx.invoice.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          })
        ).count,
        costPayments: (
          await tx.costPayment.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          })
        ).count,
        recurringInvoices: (
          await tx.recurringInvoice.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          })
        ).count,
        pricingConfigs: (
          await tx.customerPricingConfig.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          })
        ).count,
        memos: (
          await tx.memo.updateMany({
            where: { userId: fromId },
            data: { userId: toId },
          })
        ).count,
      };

      await tx.user.update({
        where: { id: toId },
        data: {
          role: "GUILDMASTER",
          segment: "GUILDMASTER",
          invoicedAmount: from.invoicedAmount,
        },
      });
      await tx.user.update({
        where: { id: fromId },
        data: { role: "GUILDMEMBER", segment: null },
      });
      await tx.guild.update({
        where: { id: guildId },
        data: { guildmasterId: toId },
      });
      if (outgoing) {
        await tx.guildMembership.update({
          where: { id: outgoing.id },
          data: { isGuildmaster: false },
        });
      }
      await tx.guildMembership.update({
        where: { id: incoming.id },
        data: { isGuildmaster: true },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.GUILD_HANDOVER,
          entityType: "Guild",
          entityId: guildId,
          userId: actorId,
          description: `Guild ${guild.name} handed over from ${from.email} to ${to.email}`,
          changes: JSON.stringify({
            guildmaster: { from: fromId, to: toId },
            from: { userId: fromId, name: from.name, email: from.email },
            to: { userId: toId, name: to.name, email: to.email },
            moved,
          }),
          ...meta,
        },
      });

      return { fromId, toId, moved };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  // Both roles changed, and the role is in the session token.
  await revokeAllSessions(result.fromId);
  await revokeAllSessions(result.toId);
  return result;
}
