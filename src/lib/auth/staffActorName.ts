import { prisma } from "@/lib/prisma";
import { staffActorLabel } from "@/lib/auth/staffRoles";

/**
 * How a staff actor is named in audit text. A STAFF account has no access of
 * its own, so it is named by its custom roles ("Admin", "Admin, Support");
 * "staff" if it has none. Other roles keep staffActorLabel. Server only.
 */
export async function staffActorName(actor: {
  id: string;
  role: string;
}): Promise<string> {
  if (actor.role !== "STAFF") return staffActorLabel(actor.role);
  const rows = await prisma.staffRoleAssignment.findMany({
    where: { userId: actor.id },
    select: { role: { select: { name: true } } },
    orderBy: { assignedAt: "asc" },
  });
  return rows.length ? rows.map((r) => r.role.name).join(", ") : "staff";
}
