/**
 * Scoping/visibility helpers for SupportTicket, mirroring the pattern in
 * franchiseeScope.ts. A ticket's franchiseId is denormalized at creation
 * time (see resolveTicketFranchiseId) to whichever Franchise the raiser
 * belongs to - either the Franchise a FRANCHISEE owns, or the Franchise a
 * CLIENT is attached to. That single field is enough for a franchisee's
 * list query to catch both their own personal-account tickets and their
 * onboarded clients' tickets in one shot.
 *
 * Visibility model (per product decision): a franchisee's client ticket is
 * visible to BOTH the franchisee and BitFactory admin simultaneously - admin
 * can act on any ticket at any time, franchisee is scoped to their own
 * franchise's tickets only. isInternal messages are hidden from CLIENT only
 * (ADMIN/SUPER_ADMIN/FRANCHISEE can all see and post them) - "internal"
 * means "hidden from the end customer", not "BitFactory-staff-only".
 *
 * A FRANCHISEE can also raise a ticket on behalf of one of their own
 * clients (onBehalfOfUserId) instead of for their own account - raisedById
 * stays the franchisee (the actual submitter, for audit attribution), so a
 * CLIENT's visibility has to check both raisedById (their own tickets) and
 * onBehalfOfUserId (tickets their franchisee raised for them) to see
 * everything that concerns them.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOwnFranchise } from "@/lib/franchiseeScope";

interface AuthedUser {
  userId: string;
  role: string;
}

/** Spread into a `prisma.supportTicket.findMany({ where: {...} })` clause. */
export function ticketListWhereForUser(
  user: AuthedUser,
): Prisma.SupportTicketWhereInput {
  if (user.role === "CLIENT")
    return {
      OR: [{ raisedById: user.userId }, { onBehalfOfUserId: user.userId }],
    };
  if (user.role === "FRANCHISEE")
    return { franchise: { franchiseeId: user.userId } };
  return {}; // ADMIN / SUPER_ADMIN see every ticket
}

/** True if `user` is allowed to view/act on this specific ticket. */
export async function assertCanAccessTicket(
  user: AuthedUser,
  ticket: {
    raisedById: string;
    onBehalfOfUserId: string | null;
    franchiseId: string | null;
  },
): Promise<boolean> {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  if (ticket.raisedById === user.userId) return true;
  if (ticket.onBehalfOfUserId === user.userId) return true;
  if (user.role === "FRANCHISEE" && ticket.franchiseId) {
    const owns = await prisma.franchise.findFirst({
      where: { id: ticket.franchiseId, franchiseeId: user.userId },
      select: { id: true },
    });
    return !!owns;
  }
  return false;
}

/**
 * The Franchise a new ticket should be tagged with, based on who's raising
 * it: a FRANCHISEE's own owned Franchise, or the Franchise a CLIENT is
 * attached to (null for a direct BitFactory customer with no franchise).
 */
export async function resolveTicketFranchiseId(
  user: AuthedUser,
): Promise<string | null> {
  if (user.role === "FRANCHISEE") {
    const franchise = await getOwnFranchise(user.userId);
    return franchise?.id ?? null;
  }
  if (user.role === "CLIENT") {
    const client = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { franchiseeId: true },
    });
    return client?.franchiseeId ?? null;
  }
  return null;
}

/**
 * Priority is a support/triage concept - never exposed to a CLIENT viewer.
 * Strips it from a single ticket (or array of tickets) in place of a
 * destructure-and-drop, which would otherwise leave an unused binding.
 */
export function stripPriorityForClient<T extends { priority?: unknown }>(
  ticket: T,
): T {
  const copy = { ...ticket };
  delete copy.priority;
  return copy;
}
