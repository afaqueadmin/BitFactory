/**
 * /api/guilds - admin only.
 *
 * GET: every guild with its Guildmaster, subaccount, member count, what it
 * still owes in hosting and its latest distribution.
 *
 * POST: creates a guild with all its accounts in one go:
 *   { name, subaccountName,
 *     master: { name, email, phoneNumber?, percent, walletAddress? },
 *     members: [{ name, email, phoneNumber?, percent, walletAddress? }] }
 * The percentages (master included) must add up to 100. Each account gets
 * the usual welcome email with a temporary password; if any step fails, the
 * accounts already made are removed again. The Guildmaster is put on the
 * GUILDMASTER segment; members have none.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import {
  GuildInputError,
  assertEmailsAvailable,
  assertNoOpenAddRequests,
  createGuildAccount,
  deleteFreshAccounts,
  parseNewGuildPerson,
} from "@/lib/guilds/accounts";
import { isFullSplit } from "@/lib/guilds/distribution";
import { loadUnpaidHostingInvoices } from "@/lib/guilds/hostingInvoice";
import { requestMeta } from "@/lib/guilds/audit";
import { defaultWalletNetwork } from "@/lib/guilds/walletNetworks";
import {
  SUBACCOUNT_TX_OPTIONS,
  findLuxorSubaccountConflicts,
  setLuxorSubaccounts,
} from "@/lib/luxorSubaccounts";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const guilds = await prisma.guild.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        guildmaster: { select: { id: true, name: true, email: true } },
        poolAuth: { select: { authKey: true } },
        _count: { select: { memberships: { where: { leftAt: null } } } },
        distributions: {
          orderBy: { rewardMonth: "desc" },
          take: 1,
          select: {
            id: true,
            rewardMonth: true,
            status: true,
            shortfallUsd: true,
          },
        },
      },
    });

    const data = await Promise.all(
      guilds.map(async (g) => {
        const unpaid = await loadUnpaidHostingInvoices({
          guildId: g.id,
          guildmasterId: g.guildmasterId,
        });
        return {
          id: g.id,
          name: g.name,
          isActive: g.isActive,
          createdAt: g.createdAt,
          guildmaster: g.guildmaster,
          subaccountName: g.poolAuth?.authKey ?? null,
          memberCount: g._count.memberships,
          hostingOwedUsd:
            Math.round(unpaid.reduce((s, i) => s + i.outstandingUsd, 0) * 100) /
            100,
          latestDistribution: g.distributions[0] ?? null,
        };
      }),
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Guilds API] GET error:", error);
    return jsonError("Failed to load guilds", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  const actorId = auth.decoded.userId;

  const created: string[] = [];
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const subaccountName =
      typeof body.subaccountName === "string" ? body.subaccountName.trim() : "";
    if (!name) throw new GuildInputError("Guild name is required");
    if (!subaccountName) {
      throw new GuildInputError("The guild's Luxor subaccount is required");
    }

    const master = parseNewGuildPerson(body.master, "Guildmaster");
    const members = (Array.isArray(body.members) ? body.members : []).map(
      (m, i) => parseNewGuildPerson(m, `Member ${i + 1}`),
    );
    if (!isFullSplit([master, ...members].map((p) => p.percent))) {
      throw new GuildInputError(
        "The percentages (Guildmaster included) must add up to exactly 100%",
      );
    }
    await assertEmailsAvailable([master, ...members].map((p) => p.email));
    await assertNoOpenAddRequests([master, ...members].map((p) => p.email));
    const conflicts = await findLuxorSubaccountConflicts(
      [subaccountName],
      null,
    );
    if (conflicts.length > 0) {
      throw new GuildInputError(
        `Luxor subaccount ${subaccountName} already belongs to another account`,
      );
    }

    // Accounts first - each sends its welcome email before it exists.
    const masterUser = await createGuildAccount({
      person: master,
      role: "GUILDMASTER",
      segment: "GUILDMASTER",
    });
    created.push(masterUser.id);
    const memberUsers: Awaited<ReturnType<typeof createGuildAccount>>[] = [];
    for (const person of members) {
      const user = await createGuildAccount({
        person,
        role: "GUILDMEMBER",
        segment: null,
      });
      created.push(user.id);
      memberUsers.push(user);
    }

    const guild = await prisma.$transaction(async (tx) => {
      await setLuxorSubaccounts(tx, {
        userId: masterUser.id,
        names: [subaccountName],
        actorId,
      });
      const poolAuth = await tx.poolAuth.findFirstOrThrow({
        where: { userId: masterUser.id, authKey: subaccountName },
        select: { id: true },
      });
      const now = new Date();
      const people = [
        { user: masterUser, person: master, isGuildmaster: true },
        ...memberUsers.map((user, i) => ({
          user,
          person: members[i],
          isGuildmaster: false,
        })),
      ];
      const guild = await tx.guild.create({
        data: {
          name,
          guildmasterId: masterUser.id,
          poolAuthId: poolAuth.id,
          createdById: actorId,
          memberships: {
            create: people.map(({ user, person, isGuildmaster }) => ({
              userId: user.id,
              isGuildmaster,
              rewardPercent: new Prisma.Decimal(person.percent.toFixed(4)),
              walletAddress: person.walletAddress,
              walletNetwork: defaultWalletNetwork(),
              walletUpdatedAt: person.walletAddress ? now : null,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.GUILD_CREATED,
          entityType: "Guild",
          entityId: guild.id,
          userId: actorId,
          description: `Guild ${name} created with ${people.length} member(s) on subaccount ${subaccountName}`,
          changes: JSON.stringify({
            subaccountName,
            members: people.map(({ user, person, isGuildmaster }) => ({
              userId: user.id,
              name: person.name,
              email: user.email,
              phoneNumber: person.phoneNumber,
              isGuildmaster,
              percent: person.percent,
              walletAddress: person.walletAddress,
            })),
          }),
          ...requestMeta(request),
        },
      });
      return guild;
    }, SUBACCOUNT_TX_OPTIONS);

    return NextResponse.json(
      { success: true, data: { id: guild.id } },
      { status: 201 },
    );
  } catch (error) {
    await deleteFreshAccounts(created).catch((cleanupError) =>
      console.error("[Guilds API] cleanup failed:", cleanupError),
    );
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guilds API] POST error:", error);
    return jsonError("Failed to create the guild", 500);
  }
}
