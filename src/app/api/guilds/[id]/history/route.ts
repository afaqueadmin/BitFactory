/**
 * GET /api/guilds/[id]/history - admin only. The guild's change history,
 * newest first (?limit=, default 100, max 500):
 *  - every wallet, split and member request the Guildmaster made, whatever
 *    its status, as Requested / Confirmed / Approved / Rejected events with
 *    who did each step;
 *  - the admin's direct changes, from the guild's audit entries: guild
 *    created and updated, member added and removed, handover.
 * Guildmaster requests live in their own tables; the admin's direct changes
 * only in the audit log - this merges the two.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import type { MemberChange } from "@/lib/guilds/audit";

type Person = { name: string | null; email: string };

export interface HistoryEvent {
  id: string;
  at: Date;
  /** "request": a Guildmaster request step; "admin": an admin's direct change. */
  source: "request" | "admin";
  title: string;
  by: Person | null;
  /** The request's current status, on request events. */
  status?: string;
  details: string[];
}

const DIRECT_ACTIONS: AuditAction[] = [
  AuditAction.GUILD_CREATED,
  AuditAction.GUILD_UPDATED,
  AuditAction.GUILD_MEMBER_ADDED,
  AuditAction.GUILD_MEMBER_REMOVED,
  AuditAction.GUILD_HANDOVER,
];

const DIRECT_TITLES: Partial<Record<AuditAction, string>> = {
  GUILD_CREATED: "Guild created",
  GUILD_UPDATED: "Guild settings changed",
  GUILD_MEMBER_ADDED: "Member added by admin",
  GUILD_MEMBER_REMOVED: "Member removed by admin",
  GUILD_HANDOVER: "Guildmaster changed",
};

const userSelect = { select: { name: true, email: true } };
const who = (p: Person) => p.name || p.email;
const pct = (v: Prisma.Decimal | number | null) =>
  v === null ? "-" : `${Number(v)}%`;

/** One line per member: "Name: 35% → 30%", joined, left, wallet changes. */
function memberLines(members: MemberChange[]): string[] {
  return members.map((m) => {
    const name = who(m);
    let text =
      m.percent.from === null
        ? `${name}: joined at ${m.percent.to}%`
        : m.percent.to === null
          ? `${name}: left (was ${m.percent.from}%)`
          : m.percent.from === m.percent.to
            ? `${name}: ${m.percent.to}% (unchanged)`
            : `${name}: ${m.percent.from}% → ${m.percent.to}%`;
    if (m.wallet) {
      text += ` · wallet ${m.wallet.from ?? "not set"} → ${m.wallet.to ?? "not set"}`;
    }
    return text;
  });
}

/** Detail lines for an admin's direct change, from its audit entry. */
function directDetails(action: AuditAction, raw: unknown): string[] {
  let c: Record<string, unknown> = {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object") c = parsed as typeof c;
  } catch {
    return [];
  }
  const lines: string[] = [];
  if (Array.isArray(c.members) && action !== "GUILD_CREATED") {
    lines.push(...memberLines(c.members as MemberChange[]));
  }
  if (action === "GUILD_CREATED" && Array.isArray(c.members)) {
    if (typeof c.subaccountName === "string") {
      lines.push(`Luxor subaccount ${c.subaccountName}`);
    }
    for (const m of c.members as Record<string, unknown>[]) {
      const name = (m.name as string) || (m.email as string);
      lines.push(
        `${name}${m.isGuildmaster ? " (Guildmaster)" : ""}: ${m.percent}%` +
          (m.walletAddress ? ` · wallet ${m.walletAddress}` : "") +
          (m.walletAddress === null ? " · no wallet" : ""),
      );
    }
  }
  if (action === "GUILD_MEMBER_ADDED" && c.phoneNumber) {
    lines.push(`Phone ${c.phoneNumber}`);
  }
  if (action === "GUILD_HANDOVER") {
    const from = c.from as Person | undefined;
    const to = c.to as Person | undefined;
    if (from && to) lines.push(`${who(from)} → ${who(to)}`);
  }
  if (action === "GUILD_UPDATED") {
    const before = (c.before ?? {}) as Record<string, unknown>;
    const after = (c.after ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(after)) {
      lines.push(`${key}: ${before[key] ?? "-"} → ${after[key] ?? "-"}`);
    }
  }
  return lines;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const limitParam = Number(request.nextUrl.searchParams.get("limit"));
    const limit =
      Number.isInteger(limitParam) && limitParam > 0
        ? Math.min(limitParam, 500)
        : 100;

    const guild = await prisma.guild.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!guild) return jsonError("Guild not found", 404);

    const review = {
      requestedBy: userSelect,
      confirmedBy: userSelect,
      reviewedBy: userSelect,
    };
    const lineInclude = {
      include: { membership: { include: { user: userSelect } } },
    };
    const [wallet, split, member, audits] = await Promise.all([
      prisma.guildWalletChangeRequest.findMany({
        where: { guildId: id },
        include: { ...review, membership: { include: { user: userSelect } } },
      }),
      prisma.guildSplitChangeRequest.findMany({
        where: { guildId: id },
        include: { ...review, lines: lineInclude },
      }),
      prisma.guildMemberChangeRequest.findMany({
        where: { guildId: id },
        include: {
          ...review,
          lines: lineInclude,
          membership: { include: { user: userSelect } },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: "Guild",
          entityId: id,
          action: { in: DIRECT_ACTIONS },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: userSelect },
      }),
    ]);

    const events: HistoryEvent[] = [];

    /** Requested / Confirmed / Approved or Rejected events for one request. */
    const addRequest = (
      r: {
        id: string;
        status: string;
        createdAt: Date;
        requestedBy: Person;
        requestedByEmail: string | null;
        requestedBySecondary: boolean;
        reason: string | null;
        confirmedBy: Person | null;
        confirmedAt: Date | null;
        confirmationMethod: string | null;
        confirmationContact: string | null;
        confirmationNote: string | null;
        reviewedBy: Person | null;
        reviewedAt: Date | null;
        rejectionReason: string | null;
      },
      what: string,
      details: string[],
    ) => {
      const requested = [...details];
      if (r.reason) requested.push(`Reason: ${r.reason}`);
      if (r.requestedBySecondary && r.requestedByEmail) {
        requested.push(`Via ${r.requestedByEmail} (secondary sign-in)`);
      }
      events.push({
        id: `${r.id}-requested`,
        at: r.createdAt,
        source: "request",
        title: `${what} requested`,
        by: r.requestedBy,
        status: r.status,
        details: requested,
      });
      if (r.confirmedAt && r.confirmedBy) {
        events.push({
          id: `${r.id}-confirmed`,
          at: r.confirmedAt,
          source: "request",
          title: `${what} confirmed with the Guildmaster`,
          by: r.confirmedBy,
          status: r.status,
          details: [
            `Via ${r.confirmationMethod === "EMAIL" ? "email" : "phone call"} (${r.confirmationContact})`,
            ...(r.confirmationNote ? [`Note: ${r.confirmationNote}`] : []),
          ],
        });
      }
      if (
        r.reviewedAt &&
        (r.status === "APPROVED" || r.status === "REJECTED")
      ) {
        events.push({
          id: `${r.id}-reviewed`,
          at: r.reviewedAt,
          source: "request",
          title: `${what} ${r.status === "APPROVED" ? "approved" : "rejected"}`,
          by: r.reviewedBy,
          status: r.status,
          details:
            r.status === "REJECTED" && r.rejectionReason
              ? [`Reason: ${r.rejectionReason}`]
              : details,
        });
      }
    };

    for (const r of wallet) {
      addRequest(r, `Wallet change for ${who(r.membership.user)}`, [
        `${r.currentAddress ?? "not set"} → ${r.requestedAddress}`,
      ]);
    }
    for (const r of split) {
      addRequest(
        r,
        "Split change",
        r.lines.map(
          (l) =>
            `${who(l.membership.user)}: ${pct(l.currentPercent)} → ${pct(l.requestedPercent)}`,
        ),
      );
    }
    for (const r of member) {
      const splitLines = r.lines.map(
        (l) =>
          `${who(l.membership.user)}: ${pct(l.currentPercent)} → ${pct(l.requestedPercent)}`,
      );
      if (r.action === "ADD") {
        addRequest(r, `Adding ${r.newName}`, [
          `${r.newName} (${r.newEmail})${r.newPhoneNumber ? `, ${r.newPhoneNumber}` : ""}: joins at ${pct(r.newPercent)}`,
          `Wallet: ${r.newWalletAddress ?? "not set"}`,
          ...splitLines,
        ]);
      } else {
        const name = r.membership ? who(r.membership.user) : "a member";
        addRequest(r, `Removing ${name}`, [
          `${name}: leaves; account closed`,
          ...splitLines,
        ]);
      }
    }
    for (const a of audits) {
      events.push({
        id: a.id,
        at: a.createdAt,
        source: "admin",
        title: DIRECT_TITLES[a.action] ?? a.action,
        by: a.user,
        details: (() => {
          const lines = directDetails(a.action, a.changes);
          // Entries written before the details were added: the description.
          return lines.length > 0 ? lines : [a.description];
        })(),
      });
    }

    events.sort((x, y) => y.at.getTime() - x.at.getTime());
    return NextResponse.json({ success: true, data: events.slice(0, limit) });
  } catch (error) {
    console.error("[Guild History API] GET error:", error);
    return jsonError("Failed to load the guild's history", 500);
  }
}
