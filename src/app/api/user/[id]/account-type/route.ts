/**
 * POST /api/user/[id]/account-type
 *
 * Admin action: switches an account between a franchisee and a regular
 * customer.
 *
 * FRANCHISEE -> CLIENT   { role: "CLIENT", segment }
 *   segment is CORPORATE, SME, SELF_MINING or POTENTIAL_CUSTOMER. The
 *   franchise is soft-deleted (history and incentives stay on it), which is
 *   refused while any customer is still assigned to it.
 *
 * CLIENT -> FRANCHISEE   { role: "FRANCHISEE", franchise: { businessName,
 *   authorizedPersonName, phoneNumber, address, city, state, postalCode } }
 *   Refused while the client is assigned to a franchise. A franchise this
 *   account owned before (converted away earlier) is brought back with the
 *   new details, so it keeps its code and history; otherwise one is created.
 *
 * CLIENT -> SIMULATED    { role: "SIMULATED" }
 *   Simulated account (src/lib/simulation). Only for a direct customer with no
 *   miners, pool subaccounts or payments - e.g. a Potential Customer.
 *   Invoices are allowed, and admins can issue new ones. Their simulated data
 *   starts at the conversion, not at registration.
 *
 * The account is signed out everywhere, since its role is part of the token.
 * Same tier rules as deletion (an ADMIN acts on CLIENT/FRANCHISEE accounts).
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { canManageAccount } from "@/lib/auth/accountTiers";
import { resolveLuxorSubaccounts } from "@/lib/luxorSubaccounts";
import { generateFranchiseCode } from "@/lib/franchiseCode";
import {
  SimConversionError,
  convertToSimulated,
} from "@/lib/simulation/convert";

export const runtime = "nodejs";

const CLIENT_SEGMENTS = [
  "CORPORATE",
  "SME",
  "SELF_MINING",
  "POTENTIAL_CUSTOMER",
] as const;
type ClientSegment = (typeof CLIENT_SEGMENTS)[number];

const FRANCHISE_FIELDS = [
  "businessName",
  "authorizedPersonName",
  "phoneNumber",
  "address",
  "city",
  "state",
  "postalCode",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let actorId: string;
    try {
      actorId = (await verifyJwtToken(token)).userId;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Role from the database, not the token.
    const actor = await prisma.user.findFirst({
      where: { id: actorId, isDeleted: false },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN" && actor?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can change account types" },
        { status: 403 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        role: true,
        name: true,
        email: true,
        segment: true,
        isDeleted: true,
        franchiseeId: true,
      },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!canManageAccount(actor.role, target.role)) {
      return NextResponse.json(
        { error: "You do not have permission to change this account" },
        { status: 403 },
      );
    }
    if (target.isDeleted) {
      return NextResponse.json(
        { error: "Restore this account before changing its type" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const label = target.name || target.email;

    if (body.role === "CLIENT") {
      if (target.role !== "FRANCHISEE") {
        return NextResponse.json(
          { error: "Only a franchisee can be changed to a regular customer" },
          { status: 400 },
        );
      }

      const segment = body.segment as ClientSegment;
      if (!CLIENT_SEGMENTS.includes(segment)) {
        return NextResponse.json(
          {
            error:
              "Type must be Corporate, SME, Self Mining, or Potential Customer",
          },
          { status: 400 },
        );
      }

      // Same rule as PUT /api/user/[id]: active customer types need a
      // Luxor subaccount.
      if (
        segment !== "POTENTIAL_CUSTOMER" &&
        (await resolveLuxorSubaccounts(id)).length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "A Luxor subaccount is required for active customer types (Corporate, SME, Self Mining). Choose Potential Customer or add a subaccount first.",
          },
          { status: 400 },
        );
      }

      const franchises = await prisma.franchise.findMany({
        where: { franchiseeId: id, deletedAt: null },
        select: { id: true, businessName: true },
      });
      const franchiseIds = franchises.map((f) => f.id);

      const assignedCount = franchiseIds.length
        ? await prisma.user.count({
            where: { franchiseeId: { in: franchiseIds } },
          })
        : 0;
      if (assignedCount > 0) {
        return NextResponse.json(
          {
            error: `This franchise still has ${assignedCount} assigned customer(s). Reassign them to another franchise or to BitFactory first.`,
          },
          { status: 400 },
        );
      }

      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            role: "CLIENT",
            segment,
            franchiseeId: null,
            sessionsValidAfter: sessionCutoffNow(),
          },
        });
        await tx.userSession.updateMany({
          where: { userId: id, logoutAt: null },
          data: { logoutAt: now },
        });

        for (const franchise of franchises) {
          await tx.franchise.update({
            where: { id: franchise.id },
            data: { deletedAt: now, isActive: false },
          });
          await tx.auditLog.create({
            data: {
              action: AuditAction.FRANCHISE_DELETED,
              entityType: "Franchise",
              entityId: franchise.id,
              userId: actorId,
              description: `Franchise ${franchise.businessName} closed - owner ${label} changed to a regular customer`,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            action: AuditAction.USER_UPDATED,
            entityType: "User",
            entityId: id,
            userId: actorId,
            description: `User ${label} changed from franchisee to customer`,
            changes: JSON.stringify({
              role: { from: "FRANCHISEE", to: "CLIENT" },
              segment: { from: target.segment, to: segment },
            }),
          },
        });
      });

      return NextResponse.json({
        message: `${label} is now a regular customer`,
      });
    }

    if (body.role === "FRANCHISEE") {
      if (target.role !== "CLIENT") {
        return NextResponse.json(
          { error: "Only a regular customer can be changed to a franchisee" },
          { status: 400 },
        );
      }
      if (target.franchiseeId) {
        return NextResponse.json(
          {
            error:
              "This customer is assigned to a franchise. Change them to a Direct BitFactory Customer first.",
          },
          { status: 400 },
        );
      }

      const input = (body.franchise ?? {}) as Record<string, unknown>;
      const details = {} as Record<(typeof FRANCHISE_FIELDS)[number], string>;
      for (const field of FRANCHISE_FIELDS) {
        const value = input[field];
        if (typeof value !== "string" || !value.trim()) {
          return NextResponse.json(
            { error: `${field} is required` },
            { status: 400 },
          );
        }
        details[field] = value.trim();
      }

      // Bring back a franchise this account owned before, if any.
      const previous = await prisma.franchise.findFirst({
        where: { franchiseeId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const franchiseCode = previous
        ? null
        : await generateFranchiseCode(details.businessName);

      const now = new Date();
      const franchise = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            role: "FRANCHISEE",
            segment: "FRANCHISEE",
            sessionsValidAfter: sessionCutoffNow(),
          },
        });
        await tx.userSession.updateMany({
          where: { userId: id, logoutAt: null },
          data: { logoutAt: now },
        });

        const franchise = previous
          ? await tx.franchise.update({
              where: { id: previous.id },
              data: {
                ...details,
                email: target.email,
                isActive: true,
                deletedAt: null,
              },
            })
          : await tx.franchise.create({
              data: {
                ...details,
                email: target.email,
                franchiseCode: franchiseCode!,
                createdById: actorId,
                franchiseeId: id,
              },
            });

        await tx.auditLog.create({
          data: {
            action: previous
              ? AuditAction.FRANCHISE_UPDATED
              : AuditAction.FRANCHISE_CREATED,
            entityType: "Franchise",
            entityId: franchise.id,
            userId: actorId,
            description: previous
              ? `Franchise ${franchise.businessName} (${franchise.franchiseCode}) reopened for ${label}`
              : `Franchise ${franchise.businessName} (${franchise.franchiseCode}) created for ${label}`,
          },
        });
        await tx.auditLog.create({
          data: {
            action: AuditAction.USER_UPDATED,
            entityType: "User",
            entityId: id,
            userId: actorId,
            description: `User ${label} changed from customer to franchisee`,
            changes: JSON.stringify({
              role: { from: "CLIENT", to: "FRANCHISEE" },
              segment: { from: target.segment, to: "FRANCHISEE" },
            }),
          },
        });

        return franchise;
      });

      return NextResponse.json({
        message: `${label} is now a franchisee (${franchise.franchiseCode})`,
      });
    }

    if (body.role === "SIMULATED") {
      try {
        const { label: converted } = await convertToSimulated(id, actorId);
        return NextResponse.json({
          message: `${converted} is now a simulated account. Their simulated data starts today.`,
        });
      } catch (error) {
        if (error instanceof SimConversionError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }

    return NextResponse.json(
      { error: "role must be CLIENT, FRANCHISEE or SIMULATED" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error changing account type:", error);
    return NextResponse.json(
      { error: "Failed to change account type" },
      { status: 500 },
    );
  }
}
