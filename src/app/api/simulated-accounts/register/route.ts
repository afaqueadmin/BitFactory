import { NextRequest, NextResponse, after } from "next/server";
import { hash } from "bcrypt";
import { prisma } from "@/lib/prisma";
import { sendSimulatedWelcomeEmail } from "@/lib/email";
import {
  canonicalEmail,
  isEmailTaken,
  isEmailUniqueViolation,
} from "@/lib/auth/emailIdentity";
import { generateTempPassword } from "@/lib/helpers/generateTempPassword";
import { getOrCreatePaybackConfig } from "@/lib/paybackConfigHelpers";
import { enforceAuthRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * POST /api/simulated-accounts/register  (public, no auth)
 * Body: { name, email, phoneNumber }
 *
 * Self-service simulated (SIMULATED) account. The email is proven the same way
 * as for clients: the temporary password is only ever sent there, and the
 * account is created only once that email has gone out. 2FA setup follows
 * at first sign-in (twoFactorPolicy).
 *
 * The reply is identical whether or not the email already has an account,
 * and the work happens after it is sent, so the form can't be used to find
 * registered emails - by content or by timing.
 */

const SIGNUP_LIMITS = {
  perEmail: { max: 3, windowSeconds: 60 * 60 },
  perIp: { max: 10, windowSeconds: 60 * 60 },
};

const GENERIC_REPLY = {
  success: true,
  message:
    "Thanks! If this email can be used for a simulated account, your sign-in details are on their way.",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{5,19}$/;

async function createSimulatedAccount(
  name: string,
  email: string,
  phoneNumber: string,
  ipAddress: string | null,
  userAgent: string,
): Promise<void> {
  if (await isEmailTaken(email)) return;

  const tempPassword = generateTempPassword();
  const hashedPassword = await hash(tempPassword, 12);

  // Email first: an account whose password never arrived would be unusable.
  const sent = await sendSimulatedWelcomeEmail(email, name, tempPassword);
  if (!sent.success) {
    console.error("[Simulated Signup] Welcome email failed:", sent.error);
    return;
  }

  const { defaultInvoicedAmount } = await getOrCreatePaybackConfig("CLIENT");
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phoneNumber,
        password: hashedPassword,
        role: "SIMULATED",
        invoicedAmount: defaultInvoicedAmount,
        logins: {
          create: { email, password: hashedPassword, isPrimary: true },
        },
      },
      select: { id: true },
    });
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        type: "SIMULATED_SIGNUP",
        ipAddress: ipAddress || "unknown",
        userAgent,
      },
    });
  } catch (error) {
    // Lost a race with another signup for the same email - nothing to do.
    if (isEmailUniqueViolation(error)) return;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const rawEmail = typeof body.email === "string" ? body.email : "";
    const phoneNumber =
      typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";

    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Please enter your name (up to 100 characters)" },
        { status: 400 },
      );
    }
    const email = canonicalEmail(rawEmail);
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 },
      );
    }
    if (!PHONE_PATTERN.test(phoneNumber)) {
      return NextResponse.json(
        { error: "Please enter a valid phone number" },
        { status: 400 },
      );
    }

    const ipAddress = getClientIp(request.headers);
    const limited = await enforceAuthRateLimit(
      "sim_signup",
      { email, ip: ipAddress },
      SIGNUP_LIMITS,
    );
    if (limited) return limited;

    const userAgent = request.headers.get("user-agent") || "unknown";
    after(async () => {
      try {
        await createSimulatedAccount(
          name,
          email,
          phoneNumber,
          ipAddress,
          userAgent,
        );
      } catch (error) {
        console.error(
          "[Simulated Signup] Failed to create simulated account:",
          error,
        );
      }
    });

    return NextResponse.json(GENERIC_REPLY);
  } catch (error) {
    console.error("[Simulated Signup] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
