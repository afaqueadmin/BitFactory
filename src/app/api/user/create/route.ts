import { prisma } from "@/lib/prisma";
import { hash } from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";
import { logPoolCredentialChange } from "@/lib/audit/logPoolCredentialChange";
import {
  SUBACCOUNT_TX_OPTIONS,
  findLuxorSubaccountConflicts,
  normalizeSubaccountNames,
  setClientGroup,
  setLuxorSubaccounts,
} from "@/lib/luxorSubaccounts";
import { sendWelcomeEmail } from "@/lib/email";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";
import { generateTempPassword } from "@/lib/helpers/generateTempPassword";
import { getOrCreatePaybackConfig } from "@/lib/paybackConfigHelpers";

/**
 * Response structure from /api/luxor proxy route
 */
interface ProxyResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    console.log("Create user API [POST]: Token present:", !!token);

    if (!token) {
      return Response.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    let userId: string;
    // Check if the current user is an admin
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      console.log("CreateUser API [POST]: Token verified, userId:", userId);
    } catch (error) {
      console.error("CreateUser API [POST]: Token verification failed:", error);
      return Response.json(
        { error: "Invalid token" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can create users" },
        { status: 403 },
      );
    }

    const {
      name,
      email,
      role,
      sendEmail,
      initialDeposit,
      luxorSubaccountNames: rawLuxorSubaccountNames,
      braiinsAuthKey,
      groupId,
      franchiseeId,
      segment,
    } = await request.json();

    // Only CLIENT users are given Luxor subaccounts here (franchisees go
    // through /api/franchisees).
    const luxorSubaccountNames =
      role === "CLIENT"
        ? (normalizeSubaccountNames(rawLuxorSubaccountNames) ?? [])
        : [];

    // Validate input
    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Name, email, and role are required" },
        { status: 400 },
      );
    }

    if (
      user &&
      user.role !== "SUPER_ADMIN" &&
      ["ADMIN", "SUPER_ADMIN"].includes(role)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // franchiseeId is only applicable to CLIENT users (null = direct BitFactory
    // customer). Ignore it for any other role rather than silently accepting it.
    if (franchiseeId && role === "CLIENT") {
      const franchise = await prisma.franchise.findUnique({
        where: { id: franchiseeId },
        select: { id: true, isActive: true, deletedAt: true },
      });
      if (!franchise || !franchise.isActive || franchise.deletedAt) {
        return NextResponse.json(
          { error: "Invalid or inactive franchise selected" },
          { status: 400 },
        );
      }
    }

    // segment is only applicable to CLIENT users. A franchise assignment
    // forces RETAIL server-side regardless of what was submitted (mutually
    // exclusive with the direct-segment picker); otherwise a direct segment
    // selection is required.
    let resolvedSegment:
      | "CORPORATE"
      | "SME"
      | "SELF_MINING"
      | "RETAIL"
      | "POTENTIAL_CUSTOMER"
      | null = null;
    if (role === "CLIENT") {
      if (franchiseeId) {
        resolvedSegment = "RETAIL";
      } else if (
        segment === "CORPORATE" ||
        segment === "SME" ||
        segment === "SELF_MINING" ||
        segment === "POTENTIAL_CUSTOMER"
      ) {
        resolvedSegment = segment;
      } else {
        return NextResponse.json(
          {
            error:
              "Segment (Corporate, SME, Self Mining, or Potential Customer) is required for CLIENT users without a franchise",
          },
          { status: 400 },
        );
      }

      // Enforce subaccount requirement for active customer types
      if (
        resolvedSegment !== "POTENTIAL_CUSTOMER" &&
        luxorSubaccountNames.length === 0
      ) {
        return NextResponse.json(
          {
            error: "A Luxor subaccount is required for this customer type",
          },
          { status: 400 },
        );
      }

      // Checked up front - the welcome email below goes out before the
      // account exists, so this must not fail after that point.
      const conflicts = await findLuxorSubaccountConflicts(
        luxorSubaccountNames,
        null,
      );
      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: `Luxor subaccount already assigned to another user: ${conflicts.join(", ")}`,
          },
          { status: 409 },
        );
      }
    }

    console.log(
      `[User Create API] Creating user "${name}" with role: ${role}${
        role === "CLIENT"
          ? `, subaccounts: ${luxorSubaccountNames.join(", ") || "none"}`
          : ""
      }`,
    );

    // Check if email is already in use
    // Find all users and match by normalizing their stored email usernames
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    // Find user by comparing normalized email usernames
    const normalizedUsername = normalizeEmailUsername(email);
    const existingUser = allUsers.find(
      (u) => normalizeEmailUsername(u.email) === normalizedUsername,
    );

    if (existingUser) {
      return NextResponse.json(
        { error: "Email is already in use" },
        { status: 400 },
      );
    }

    // Generate a temporary password. Per H-5, this is never returned in the
    // API response - only sent by email - so if sendEmail is requested, that
    // send has to succeed BEFORE the account exists, or the new user would be
    // created with a password nobody (including the admin) can ever see.
    const tempPassword = generateTempPassword();
    const hashedPassword = await hash(tempPassword, 12);

    let emailSent = false;
    if (sendEmail) {
      const emailResult = await sendWelcomeEmail(email, tempPassword);
      if (!emailResult.success) {
        console.error("Failed to send welcome email:", emailResult.error);
        return NextResponse.json(
          {
            error:
              "Failed to send the welcome email, so the account was not created. Please check the email address and try again.",
          },
          { status: 502 },
        );
      }
      emailSent = true;
    }

    // Create the user in database
    const { defaultInvoicedAmount } = await getOrCreatePaybackConfig("CLIENT");

    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role,
          invoicedAmount: defaultInvoicedAmount,
          franchiseeId: role === "CLIENT" ? franchiseeId || null : null,
          segment: resolvedSegment,
        },
      });
      console.log(`[User Create API] User created in DB: ${newUser.id}`);
    } catch (dbError) {
      console.error("[User Create API] Failed to create user in DB:", dbError);
      const message =
        dbError instanceof Error
          ? dbError.message
          : "Failed to create user in database";
      throw new Error(message);
    }

    // If client role and initial deposit provided, create cost payment entry
    if (role === "CLIENT" && initialDeposit && initialDeposit > 0) {
      try {
        await prisma.costPayment.create({
          data: {
            userId: newUser.id,
            amount: initialDeposit,
            consumption: 0,
            type: "PAYMENT",
          },
        });
        console.log(
          `[User Create API] Created initial cost payment: ${initialDeposit} for user ${newUser.id}`,
        );
      } catch (paymentError) {
        console.error(
          "[User Create API] Failed to create cost payment:",
          paymentError,
        );
        // Don't fail user creation if payment entry creation fails
      }
    }

    // For CLIENT role, assign the selected Luxor subaccounts (they already
    // exist in Luxor, we're just assigning them to this user) and the group -
    // every subaccount joins it, or the user directly when there are none.
    if (role === "CLIENT" && (luxorSubaccountNames.length > 0 || groupId)) {
      try {
        await prisma.$transaction(async (tx) => {
          await setLuxorSubaccounts(tx, {
            userId: newUser.id,
            names: luxorSubaccountNames,
            actorId: userId,
          });
          if (groupId) {
            await setClientGroup(tx, {
              userId: newUser.id,
              groupId,
              actorId: userId,
            });
          }
        }, SUBACCOUNT_TX_OPTIONS);
        console.log(
          `[User Create API] Assigned subaccounts [${luxorSubaccountNames.join(", ")}]${groupId ? ` and group "${groupId}"` : ""} to user ${newUser.id}`,
        );
      } catch (assignError) {
        console.error(
          "[User Create API] Failed to assign Luxor subaccounts/group:",
          assignError,
        );
        // Don't fail user creation if this fails
      }
    }

    // For CLIENT role, optionally assign a Braiins credential too
    if (role === "CLIENT" && braiinsAuthKey && braiinsAuthKey.trim()) {
      try {
        const braiinsPool = await prisma.pool.findUnique({
          where: { name: "Braiins" },
          select: { id: true },
        });
        if (braiinsPool) {
          // Brand-new user, so there is no existing PoolAuth row to collide with.
          await prisma.poolAuth.create({
            data: {
              poolId: braiinsPool.id,
              userId: newUser.id,
              authKey: braiinsAuthKey.trim(),
            },
          });
          console.log(
            `[User Create API] Assigned Braiins credential to user ${newUser.id}`,
          );
          await logPoolCredentialChange(prisma, {
            action: AuditAction.POOL_CREDENTIAL_ADDED,
            userId: newUser.id,
            actorId: userId,
            poolName: "Braiins",
          });
        }
      } catch (braiinsError) {
        console.error(
          "[User Create API] Failed to assign Braiins credential:",
          braiinsError,
        );
        // Don't fail user creation if this fails
      }
    }

    // Log the user creation activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: "USER_CREATED",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json(
      {
        message: "User created successfully",
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          luxorSubaccounts: luxorSubaccountNames,
        },
        emailSent,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "An error occurred while creating the user" },
      { status: 500 },
    );
  }
}
