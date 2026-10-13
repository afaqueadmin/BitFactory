import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSecurityAlertEmail } from "@/lib/email";

/**
 * M-5: security-change notifications. Sent after the change is saved; a failed
 * send is logged and never blocks the action itself. The send runs after the
 * response (after()), so a slow SMTP server can't stall the request - a hung
 * send once timed out the forced 2FA setup after it had already saved.
 * Must be called inside a request.
 */

type SecurityEvent =
  | { type: "2FA_ENABLED" }
  | { type: "2FA_DISABLED" }
  | { type: "2FA_LOCKED" }
  | { type: "PASSKEY_ADDED"; name: string }
  | { type: "PASSKEY_REMOVED"; name: string };

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
    case "2FA_LOCKED":
      return {
        subject: "Sign-In Locked After Wrong 2FA Codes",
        heading: "Two-factor sign-in locked",
        message:
          "Someone entered the correct password for your BitFactory account, then 30 wrong two-factor codes within 24 hours. Two-factor sign-in is locked for up to 24 hours. If this wasn't you, your password is known to someone else: reset it as soon as possible. You can still sign in with a passkey.",
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
  }
}

/** Same as notifySecurityChange, looking up the account's email first. */
export async function notifySecurityChangeForUser(
  userId: string,
  event: SecurityEvent,
  headers: Headers,
): Promise<void> {
  const meta = requestMeta(headers);
  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user) await sendAlert(user.email, event, meta);
    } catch (error) {
      console.error(`[securityAlerts] ${event.type} lookup failed:`, error);
    }
  });
}

export async function notifySecurityChange(
  email: string,
  event: SecurityEvent,
  headers: Headers,
): Promise<void> {
  const meta = requestMeta(headers);
  after(() => sendAlert(email, event, meta));
}

// Read while the request is live, not inside the after() callback.
function requestMeta(headers: Headers) {
  return {
    ipAddress:
      headers.get("x-forwarded-for") || headers.get("x-real-ip") || "unknown",
    userAgent: headers.get("user-agent") || "unknown",
  };
}

async function sendAlert(
  email: string,
  event: SecurityEvent,
  meta: { ipAddress: string; userAgent: string },
): Promise<void> {
  try {
    const result = await sendSecurityAlertEmail(email, {
      ...describe(event),
      ...meta,
    });
    if (!result.success) {
      console.error(`[securityAlerts] ${event.type} email failed`);
    }
  } catch (error) {
    console.error(`[securityAlerts] ${event.type} email failed:`, error);
  }
}
