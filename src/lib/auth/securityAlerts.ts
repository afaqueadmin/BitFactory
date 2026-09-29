import { prisma } from "@/lib/prisma";
import { sendSecurityAlertEmail } from "@/lib/email";

/**
 * M-5: security-change notifications. Sent after the change is saved; a failed
 * send is logged and never blocks the action itself.
 */

type SecurityEvent =
  | { type: "2FA_ENABLED" }
  | { type: "2FA_DISABLED" }
  | { type: "PASSKEY_ADDED"; name: string }
  | { type: "PASSKEY_REMOVED"; name: string }
  | { type: "EMAIL_CHANGED_FROM"; newEmail: string }
  | { type: "EMAIL_CHANGED_TO"; oldEmail: string };

function describe(event: SecurityEvent) {
  switch (event.type) {
    case "2FA_ENABLED":
      return {
        subject: "Two-Factor Authentication Enabled",
        heading: "Two-factor authentication turned on",
        message:
          "Two-factor authentication was turned on for your BitFactory account with a new authenticator app, and new backup codes were issued.",
      };
    case "2FA_DISABLED":
      return {
        subject: "Two-Factor Authentication Disabled",
        heading: "Two-factor authentication turned off",
        message:
          "Two-factor authentication was turned off for your BitFactory account. Your account is now protected by your password only.",
      };
    case "PASSKEY_ADDED":
      return {
        subject: "New Passkey Added",
        heading: "A new passkey was added",
        message: `A new passkey ("${event.name}") was added to your BitFactory account. It can be used to sign in without a password.`,
      };
    case "PASSKEY_REMOVED":
      return {
        subject: "Passkey Removed",
        heading: "A passkey was removed",
        message: `The passkey "${event.name}" was removed from your BitFactory account.`,
      };
    case "EMAIL_CHANGED_FROM":
      return {
        subject: "Your Account Email Was Changed",
        heading: "Your account email was changed",
        message: `The email address for your BitFactory account was changed to ${event.newEmail}. This address will no longer receive account emails or be able to reset the password.`,
      };
    case "EMAIL_CHANGED_TO":
      return {
        subject: "Your Account Email Was Changed",
        heading: "This is now your account email",
        message: `This address is now the email for your BitFactory account (previously ${event.oldEmail}).`,
      };
  }
}

/** Same as notifySecurityChange, looking up the account's email first. */
export async function notifySecurityChangeForUser(
  userId: string,
  event: SecurityEvent,
  headers: Headers,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user) await notifySecurityChange(user.email, event, headers);
  } catch (error) {
    console.error(`[securityAlerts] ${event.type} lookup failed:`, error);
  }
}

export async function notifySecurityChange(
  email: string,
  event: SecurityEvent,
  headers: Headers,
): Promise<void> {
  try {
    const result = await sendSecurityAlertEmail(email, {
      ...describe(event),
      ipAddress:
        headers.get("x-forwarded-for") || headers.get("x-real-ip") || "unknown",
      userAgent: headers.get("user-agent") || "unknown",
    });
    if (!result.success) {
      console.error(`[securityAlerts] ${event.type} email failed`);
    }
  } catch (error) {
    console.error(`[securityAlerts] ${event.type} email failed:`, error);
  }
}
