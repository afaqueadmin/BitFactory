/**
 * /api/guilds/[id] - admin only.
 *
 * GET: the guild with every member (wallets included - admins see them all),
 * its distributions with their lines, open change requests, and what it
 * still owes in hosting.
 *
 * PATCH: { name?, isActive?, payoutAddress?, payoutMethod? }. An inactive
 * guild is skipped by the monthly
 * distribution cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, GuildPayoutMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { loadGuildHostingInvoices } from "@/lib/guilds/hostingInvoice";
import { GuildInputError, parseWalletAddress } from "@/lib/guilds/accounts";
import {
  AVAILABLE_PAYOUT_METHODS,
  getPayoutSettings,
} from "@/lib/guilds/payoutSettings";
import { requestMeta } from "@/lib/guilds/audit";

const userSelect = { select: { id: true, name: true, email: true } };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const guild = await prisma.guild.findFirst({
      where: { id, deletedAt: null },
      include: {
        guildmaster: userSelect,
        createdBy: userSelect,
        poolAuth: { select: { id: true, authKey: true } },
        memberships: {
          orderBy: [{ isGuildmaster: "desc" }, { joinedAt: "asc" }],
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        distributions: {
          orderBy: { rewardMonth: "desc" },
          include: {
            lines: { orderBy: { isGuildmaster: "desc" } },
            payoutBatch: {
              select: {
                id: true,
                method: true,
                status: true,
                txid: true,
                confirmations: true,
                createdBy: userSelect,
                confirmedAt: true,
              },
            },
          },
        },
        walletChangeRequests: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
        },
        splitChangeRequests: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
          include: { lines: true },
        },
        memberChangeRequests: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        },
      },
    });
    if (!guild) return jsonError("Guild not found", 404);

    const hostingInvoices = await loadGuildHostingInvoices({
      guildId: guild.id,
      guildmasterId: guild.guildmasterId,
    });

    const settings = await getPayoutSettings();

    return NextResponse.json({
      success: true,
      data: {
        ...guild,
        hostingInvoices,
        payoutSettings: {
          defaultPayoutMethod: settings.defaultPayoutMethod,
          minPayoutSats: settings.minPayoutSats,
          availableMethods: AVAILABLE_PAYOUT_METHODS,
        },
      },
    });
  } catch (error) {
    console.error("[Guilds API] GET [id] error:", error);
    return jsonError("Failed to load the guild", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      isActive?: unknown;
      payoutAddress?: unknown;
      payoutMethod?: unknown;
    };
    const data: Prisma.GuildUpdateInput = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return jsonError("Name can't be empty");
      }
      data.name = body.name.trim();
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return jsonError("isActive must be true or false");
      }
      data.isActive = body.isActive;
    }
    // The guild's receiving address - the one to set on Luxor.
    if (body.payoutAddress !== undefined) {
      data.payoutAddress = parseWalletAddress(body.payoutAddress);
    }
    // null = the default method. Only methods that can send today.
    if (body.payoutMethod !== undefined) {
      if (
        body.payoutMethod !== null &&
        !AVAILABLE_PAYOUT_METHODS.includes(
          body.payoutMethod as GuildPayoutMethod,
        )
      ) {
        throw new GuildInputError("That payout method isn't available yet");
      }
      data.payoutMethod = body.payoutMethod as GuildPayoutMethod | null;
    }
    if (Object.keys(data).length === 0) return jsonError("Nothing to change");

    const before = await prisma.guild.findFirst({
      where: { id, deletedAt: null },
      select: {
        name: true,
        isActive: true,
        payoutAddress: true,
        payoutMethod: true,
      },
    });
    if (!before) return jsonError("Guild not found", 404);

    let guild;
    try {
      guild = await prisma.guild.update({ where: { id }, data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new GuildInputError("Another guild already uses that address");
      }
      throw error;
    }
    await prisma.auditLog.create({
      data: {
        action: AuditAction.GUILD_UPDATED,
        entityType: "Guild",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Guild ${guild.name} updated`,
        changes: JSON.stringify({ before, after: data }),
        ...requestMeta(request),
      },
    });
    return NextResponse.json({ success: true, data: guild });
  } catch (error) {
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guilds API] PATCH error:", error);
    return jsonError("Failed to update the guild", 500);
  }
}
