/**
 * DELETE /api/admin/staff-access/[userId]/passkeys/[credentialId]
 *
 * A SUPER_ADMIN removes a passkey from an ADMIN/ACCOUNTING account - e.g. an
 * office PC that was replaced. The person can't do this themselves while the
 * office passkey is required. The account is signed out everywhere, and the
 * login's email gets the usual "passkey removed" alert.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionCutoffNow } from "@/lib/auth/sessionRevocation";
import { notifySecurityChange } from "@/lib/auth/securityAlerts";
import {
  label,
  loadTarget,
  requestMeta,
  staffAccessActor,
} from "@/lib/auth/staffAccessAdmin";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; credentialId: string }> },
) {
  const auth = await authorizeStaff(request, ["access_rules.manage"]);
  if ("response" in auth) return auth.response;
  const actor = await staffAccessActor(auth.userId);
  const { userId, credentialId } = await params;
  const target = await loadTarget(actor, userId);
  if (target instanceof NextResponse) return target;

  try {
    const credential = await prisma.webAuthnCredential.findFirst({
      where: { id: credentialId, userId },
      select: {
        id: true,
        loginId: true,
        credentialName: true,
        login: { select: { email: true } },
      },
    });
    if (!credential) {
      return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
    }
    const meta = requestMeta(request);
    const name = credential.credentialName ?? "Passkey";

    await prisma.$transaction([
      prisma.webAuthnCredential.delete({ where: { id: credential.id } }),
      prisma.user.update({
        where: { id: userId },
        data: { sessionsValidAfter: sessionCutoffNow() },
      }),
      prisma.userActivity.create({
        data: {
          userId,
          loginId: credential.loginId,
          type: "WEBAUTHN_DELETED_BY_ADMIN",
          ...meta,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.STAFF_ACCESS_PASSKEY_REMOVED,
          entityType: "User",
          entityId: userId,
          userId: actor.id,
          description: `Passkey "${name}" of ${label(target)} removed by super admin ${actor.email}; signed out everywhere`,
          ...meta,
        },
      }),
    ]);

    await notifySecurityChange(
      credential.login.email,
      { type: "PASSKEY_REMOVED", name },
      request.headers,
    );
    return NextResponse.json({ message: `Passkey "${name}" removed` });
  } catch (error) {
    console.error("Admin passkey remove error:", error);
    return NextResponse.json(
      { error: "Failed to remove the passkey" },
      { status: 500 },
    );
  }
}
